import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";

describe("M2.5 Frontend Authentication & Session Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Login Flow (/login)", () => {
    it("renders the login form with email, password inputs, and submit button", async () => {
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
      expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    });

    it("displays validation error on invalid email or empty password", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return { ok: false, status: 401, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/login");
      render(<App />);

      const submitBtn = screen.getByRole("button", { name: "Log In" });
      fireEvent.click(submitBtn);

      expect(screen.getByRole("alert")).toHaveTextContent(/Please enter your email address/i);
    });

    it("handles login failure with server error message", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return { ok: false, status: 401, json: async () => ({}) } as Response;
        }
        if (url.includes("/api/auth/login")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Invalid email or password", code: "UNAUTHENTICATED" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      window.history.pushState({}, "", "/login");
      render(<App />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/Password/i), {
        target: { value: "WrongPassword123!" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Log In" }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
      });
    });

    it("successfully logs in, updates auth context, and navigates to dashboard", async () => {
      const mockUser = {
        id: "user-123",
        email: "alice@example.com",
        name: "Alice Mercer",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return { ok: false, status: 401, json: async () => ({}) } as Response;
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

      window.history.pushState({}, "", "/login");
      render(<App />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: "alice@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/Password/i), {
        target: { value: "SecurePass123!" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Log In" }));

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Logged in successfully!");
      });

      await waitFor(() => {
        expect(window.location.pathname).toBe("/dashboard");
      });
    });
  });

  describe("Session Persistence & /me Verification", () => {
    it("restores authenticated user profile from /api/auth/me on initial load", async () => {
      const mockUser = {
        id: "persisted-user-id",
        email: "persisted@example.com",
        name: "Persisted User",
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

      // Real user name and email should be populated in the sidebar
      await waitFor(() => {
        expect(screen.getByText("Persisted User")).toBeInTheDocument();
        expect(screen.getByText("persisted@example.com")).toBeInTheDocument();
      });
    });
  });

  describe("Logout Flow", () => {
    it("calls POST /api/auth/logout, clears state, and navigates to /login", async () => {
      const mockUser = {
        id: "active-user-id",
        email: "active@example.com",
        name: "Active User",
      };

      let logoutCalled = false;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return {
            ok: !logoutCalled,
            status: logoutCalled ? 401 : 200,
            json: async () => (logoutCalled ? {} : { user: mockUser }),
          } as Response;
        }
        if (url.includes("/api/auth/logout")) {
          logoutCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: "Logged out successfully" }),
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
        expect(screen.getByText("Active User")).toBeInTheDocument();
      });

      // Click the logout button in the shell
      const logoutBtn = screen.getByRole("button", { name: "Log Out" });
      fireEvent.click(logoutBtn);

      await waitFor(() => {
        expect(logoutCalled).toBe(true);
        expect(window.location.pathname).toBe("/login");
        expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      });
    });
  });
});
