import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { setTestAuthOverride } from "../context/AuthContext";
import {
  getSafeReturnTo,
  isValidInternalRedirect,
} from "../components/ProtectedRoute";

describe("Phase 1B.3a: Protected Frontend Routes", () => {
  beforeEach(() => {
    // Clear test override so realistic production AuthProvider and ProtectedRoute logic runs
    setTestAuthOverride(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Open-Redirect and Loop Prevention (Validation Logic)", () => {
    it("accepts safe relative internal paths", () => {
      expect(isValidInternalRedirect("/dashboard")).toBe(true);
      expect(isValidInternalRedirect("/tasks")).toBe(true);
      expect(isValidInternalRedirect("/projects/proj-123")).toBe(true);
      expect(isValidInternalRedirect("/calendar?view=month")).toBe(true);
      expect(isValidInternalRedirect("/habits")).toBe(true);
      expect(isValidInternalRedirect("/journal")).toBe(true);
    });

    it("rejects protocol-relative and scheme-based external URLs (Open Redirect Prevention)", () => {
      // Protocol-relative
      expect(isValidInternalRedirect("//evil.com")).toBe(false);
      expect(isValidInternalRedirect("//evil.com/path")).toBe(false);
      expect(isValidInternalRedirect("/\\evil.com")).toBe(false);

      // Explicit schemes
      expect(isValidInternalRedirect("https://attacker.com")).toBe(false);
      expect(isValidInternalRedirect("http://attacker.com")).toBe(false);
      expect(isValidInternalRedirect("javascript:alert(1)")).toBe(false);
      expect(isValidInternalRedirect("data:text/html,<script>alert(1)</script>")).toBe(false);

      // Scheme evasion variants
      expect(isValidInternalRedirect("/http://evil.com")).toBe(false);
      expect(isValidInternalRedirect("///attacker.com")).toBe(false);
    });

    it("prevents redirect loops back to auth entry points", () => {
      expect(isValidInternalRedirect("/login")).toBe(false);
      expect(isValidInternalRedirect("/signup")).toBe(false);
      expect(isValidInternalRedirect("/login?returnTo=/dashboard")).toBe(false);
      expect(isValidInternalRedirect("/signup?plan=pro")).toBe(false);
    });

    it("getSafeReturnTo falls back safely to /dashboard on invalid destinations", () => {
      expect(getSafeReturnTo("https://evil.com")).toBe("/dashboard");
      expect(getSafeReturnTo("//evil.com/phish")).toBe("/dashboard");
      expect(getSafeReturnTo("/login")).toBe("/dashboard");
      expect(getSafeReturnTo(null)).toBe("/dashboard");
      expect(getSafeReturnTo(undefined)).toBe("/dashboard");
      expect(getSafeReturnTo("")).toBe("/dashboard");

      // Custom fallback works
      expect(getSafeReturnTo("https://evil.com", "/calendar")).toBe("/calendar");

      // Safe targets preserved
      expect(getSafeReturnTo("/calendar")).toBe("/calendar");
      expect(getSafeReturnTo("/tasks?filter=today")).toBe("/tasks?filter=today");
    });
  });

  describe("2. Public Routes Accessibility", () => {
    it("renders public Landing Page at / without authentication or redirect", () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return { ok: false, status: 401, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/");
      render(<App />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Track Your Life/i);
      expect(screen.getByText("The Personal Life OS")).toBeInTheDocument();
      expect(window.location.pathname).toBe("/");
    });

    it("renders public Login Page at /login without redirect when unauthenticated", () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return { ok: false, status: 401, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(window.location.pathname).toBe("/login");
    });

    it("renders public Signup Page at /signup without redirect when unauthenticated", () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return { ok: false, status: 401, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/signup");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(window.location.pathname).toBe("/signup");
    });
  });

  describe("3. Session-Loading & Unresolved Session State", () => {
    it("renders deliberate loading screen and suppresses private content while session is unresolved", () => {
      let resolveSessionFetch: (val: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveSessionFetch = resolve;
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return pendingFetch;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Deliberate loading screen is visible
      expect(screen.getByRole("status", { name: "Loading workspace" })).toBeInTheDocument();
      expect(screen.getByText("Loading workspace...")).toBeInTheDocument();

      // Private dashboard content and app sidebar are NOT in document while unresolved
      expect(screen.queryByText("TrackUp")).not.toBeInTheDocument();
      expect(screen.queryByText(/Good (morning|afternoon|evening)/i)).not.toBeInTheDocument();

      // Resolve session fetch to unauthenticated to clean up
      resolveSessionFetch!({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      } as Response);
    });
  });

  describe("4. Unauthenticated Redirection & Return-Path Preservation", () => {
    it("redirects unauthenticated visitor from /dashboard to /login with returnTo parameter", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Authentication required", code: "UNAUTHENTICATED" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(window.location.pathname).toBe("/login");
        expect(window.location.search).toBe("?returnTo=%2Fdashboard");
        expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      });
    });

    it("redirects unauthenticated visitor from /calendar to /login with returnTo parameter", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Authentication required" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/calendar");
      render(<App />);

      await waitFor(() => {
        expect(window.location.pathname).toBe("/login");
        expect(window.location.search).toBe("?returnTo=%2Fcalendar");
        expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      });
    });

    it("redirects unauthenticated visitor from /tasks to /login with returnTo parameter", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Unauthorized" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(window.location.pathname).toBe("/login");
        expect(window.location.search).toBe("?returnTo=%2Ftasks");
      });
    });

    it("logs in successfully and navigates to validated returnTo destination", async () => {
      const mockUser = {
        id: "usr-456",
        name: "Dev User",
        email: "dev@trackup.local",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({}),
          } as Response;
        }
        if (url.includes("/api/auth/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: mockUser }),
          } as Response;
        }
        if (url.includes("/api/calendar/events")) {
          return { ok: true, json: async () => ({ events: [] }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      // User arrives at /login with safe returnTo=/calendar
      window.history.pushState({}, "", "/login?returnTo=%2Fcalendar");
      render(<App />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: "dev@trackup.local" },
      });
      fireEvent.change(screen.getByLabelText(/Password/i), {
        target: { value: "SuperPassword123!" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Log In" }));

      await waitFor(() => {
        expect(window.location.pathname).toBe("/calendar");
      });
    });

    it("neutralizes open-redirect attempt in returnTo query parameter to /dashboard on login", async () => {
      const mockUser = {
        id: "usr-456",
        name: "Dev User",
        email: "dev@trackup.local",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({}),
          } as Response;
        }
        if (url.includes("/api/auth/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: mockUser }),
          } as Response;
        }
        if (url.includes("/api/tasks")) {
          return { ok: true, json: async () => ({ tasks: [] }) } as Response;
        }
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      // Attacker attempts open redirect to external site
      window.history.pushState({}, "", "/login?returnTo=https%3A%2F%2Fattacker.com");
      render(<App />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: "dev@trackup.local" },
      });
      fireEvent.change(screen.getByLabelText(/Password/i), {
        target: { value: "SuperPassword123!" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Log In" }));

      // Neutralized to safe default /dashboard
      await waitFor(() => {
        expect(window.location.pathname).toBe("/dashboard");
      });
    });
  });

  describe("5. Public Auth Routes Product Contract", () => {
    it("renders /login with valid form inputs according to the product contract", async () => {
      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    });

    it("renders /signup with valid form inputs according to the product contract", async () => {
      window.history.pushState({}, "", "/signup");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
      expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    });
  });

  describe("6. Authenticated Access to Private Routes", () => {
    it("renders private /dashboard content when authenticated", async () => {
      const mockUser = {
        id: "auth-user-789",
        name: "Verified User",
        email: "verified@trackup.local",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: mockUser }),
          } as Response;
        }
        if (url.includes("/api/tasks")) {
          return { ok: true, json: async () => ({ tasks: [] }) } as Response;
        }
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Verified User")).toBeInTheDocument();
        expect(screen.getByText("verified@trackup.local")).toBeInTheDocument();
        expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeInTheDocument();
      });
    });
  });
});
