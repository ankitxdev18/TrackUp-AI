import { describe, it, expect, vi, beforeEach } from "vitest";
import vercelConfig from "../../vercel.json";
import vercelStagingConfig from "../../vercel.staging.json";
import { getMeApi, loginApi, registerApi, logoutApi } from "../api/auth";

describe("Milestone 3A & 9B: Frontend Deployment Configuration & Routing Invariants", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Production Vercel Configuration Contract", () => {
    it("defines /api/:path* proxy rewrite strictly before the SPA fallback", () => {
      expect(vercelConfig.rewrites).toBeDefined();
      expect(Array.isArray(vercelConfig.rewrites)).toBe(true);
      expect(vercelConfig.rewrites.length).toBeGreaterThanOrEqual(2);

      const apiIndex = vercelConfig.rewrites.findIndex(
        (r) => r.source === "/api/:path*"
      );
      const spaIndex = vercelConfig.rewrites.findIndex(
        (r) => r.source === "/(.*)" && r.destination === "/index.html"
      );

      // 1. Both rules must exist
      expect(apiIndex).toBeGreaterThanOrEqual(0);
      expect(spaIndex).toBeGreaterThanOrEqual(0);

      // 2. Precedence rule: API rewrite must be first
      expect(apiIndex).toBeLessThan(spaIndex);

      // 3. Target destination validation
      const apiRule = vercelConfig.rewrites[apiIndex];
      expect(apiRule.destination).toMatch(/^https:\/\/[a-z0-9-]+\.onrender\.com\/api\/:path\*$/);
      expect(apiRule.destination).toBe(
        "https://trackup-api.onrender.com/api/:path*"
      );
    });

    it("ensures fallback rule catches all remaining paths to index.html for SPA client-side routing", () => {
      const fallback = vercelConfig.rewrites.find(
        (r) => r.destination === "/index.html"
      );
      expect(fallback).toBeDefined();
      expect(fallback?.source).toBe("/(.*)");
    });
  });

  describe("2. Staging Vercel Configuration Contract", () => {
    it("defines /api/:path* proxy rewrite pointing to dedicated staging API strictly before SPA fallback", () => {
      expect(vercelStagingConfig.rewrites).toBeDefined();
      expect(Array.isArray(vercelStagingConfig.rewrites)).toBe(true);
      expect(vercelStagingConfig.rewrites.length).toBeGreaterThanOrEqual(2);

      const apiIndex = vercelStagingConfig.rewrites.findIndex(
        (r) => r.source === "/api/:path*"
      );
      const spaIndex = vercelStagingConfig.rewrites.findIndex(
        (r) => r.source === "/(.*)" && r.destination === "/index.html"
      );

      // 1. Both rules must exist
      expect(apiIndex).toBeGreaterThanOrEqual(0);
      expect(spaIndex).toBeGreaterThanOrEqual(0);

      // 2. Precedence rule: API rewrite must be first
      expect(apiIndex).toBeLessThan(spaIndex);

      // 3. Target destination validation
      const apiRule = vercelStagingConfig.rewrites[apiIndex];
      expect(apiRule.destination).toMatch(/^https:\/\/[a-z0-9-]+\.onrender\.com\/api\/:path\*$/);
      expect(apiRule.destination).toBe(
        "https://trackup-staging-api.onrender.com/api/:path*"
      );
    });

    it("verifies staging and production routing destinations are strictly isolated", () => {
      const prodApiRule = vercelConfig.rewrites.find((r) => r.source === "/api/:path*");
      const stagingApiRule = vercelStagingConfig.rewrites.find((r) => r.source === "/api/:path*");

      expect(prodApiRule).toBeDefined();
      expect(stagingApiRule).toBeDefined();

      // Must be completely different hostnames
      expect(stagingApiRule?.destination).not.toBe(prodApiRule?.destination);
      expect(stagingApiRule?.destination).toBe("https://trackup-staging-api.onrender.com/api/:path*");
      expect(prodApiRule?.destination).toBe("https://trackup-api.onrender.com/api/:path*");
      expect(stagingApiRule?.destination).not.toContain("localhost");
      expect(stagingApiRule?.destination).toMatch(/^https:\/\//);
    });

    it("ensures staging fallback rule catches all remaining paths to index.html for SPA client-side routing", () => {
      const fallback = vercelStagingConfig.rewrites.find(
        (r) => r.destination === "/index.html"
      );
      expect(fallback).toBeDefined();
      expect(fallback?.source).toBe("/(.*)");
    });
  });

  describe("3. Frontend API Helpers Same-Origin & Credentials Invariants", () => {
    it("getMeApi issues relative request with credentials: include", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          user: {
            id: "user-123",
            email: "test@trackup.com",
            name: "Test User",
          },
        }),
      } as unknown as Response);

      const user = await getMeApi();

      expect(fetchSpy).toHaveBeenCalledWith("/api/auth/me", {
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });
      expect(user).toEqual({
        id: "user-123",
        email: "test@trackup.com",
        name: "Test User",
      });
    });

    it("loginApi issues relative POST request with credentials: include and JSON headers", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          user: {
            id: "user-456",
            email: "login@trackup.com",
            name: "Logged In User",
          },
        }),
      } as unknown as Response);

      const user = await loginApi({
        email: "login@trackup.com",
        password: "Password123!",
      });

      expect(fetchSpy).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: "login@trackup.com",
          password: "Password123!",
        }),
      });
      expect(user?.email).toBe("login@trackup.com");
    });

    it("registerApi issues relative POST request with credentials: include", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          user: {
            id: "user-789",
            email: "reg@trackup.com",
            name: "Reg User",
          },
        }),
      } as unknown as Response);

      const user = await registerApi({
        name: "Reg User",
        email: "reg@trackup.com",
        password: "Password123!",
      });

      expect(fetchSpy).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: "Reg User",
          email: "reg@trackup.com",
          password: "Password123!",
        }),
      });
      expect(user?.name).toBe("Reg User");
    });

    it("logoutApi issues relative POST request with credentials: include", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await logoutApi();

      expect(fetchSpy).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      });
    });

    it("demonstrates the defect: if /api/auth/me receives HTML (SPA fallback), getMeApi gracefully catches without throwing uncaught syntax exception", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
        },
      } as unknown as Response);

      // Before Milestone 3A, SPA rewrite would send HTML with ok: true
      const result = await getMeApi();
      expect(result).toBeNull();
    });
  });
});
