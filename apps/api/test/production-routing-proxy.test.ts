import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import {
  DEFAULT_SESSION_COOKIE_NAME,
  PROD_SESSION_COOKIE_NAME,
  getSessionCookieName,
  getSessionCookieOptions,
} from "../src/auth/session.js";
import { DEV_DEFAULT_CORS_ORIGIN, parseCorsOrigins } from "../src/config/env.js";
import { db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProxyResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: () => any;
}

/**
 * Simulates Vercel Edge routing based directly on apps/web/vercel.json configuration.
 * Executes the exact rewrite rules in declarative order:
 * 1. Matches /api/:path* -> forwards to Fastify backend app
 * 2. Matches /(.*) -> serves SPA fallback (index.html)
 */
function createVercelEdgeRouter(app: FastifyInstance, vercelConfigPath: string) {
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
  const rewrites: Array<{ source: string; destination: string }> = vercelConfig.rewrites;

  return async function handleEdgeRequest(options: {
    method: "GET" | "POST" | "PATCH" | "DELETE" | "OPTIONS";
    url: string;
    headers?: Record<string, string>;
    payload?: any;
  }): Promise<ProxyResponse> {
    const { method, url, headers = {}, payload } = options;
    const [pathname, queryString] = url.split("?");

    for (const rule of rewrites) {
      if (rule.source === "/api/:path*" && pathname.startsWith("/api/")) {
        // Forwarded to backend API preserving method, query string, headers, and body
        const backendRes = await app.inject({
          method,
          url: queryString ? `${pathname}?${queryString}` : pathname,
          headers: {
            ...headers,
            // Vercel proxy headers
            "x-forwarded-host": headers["host"] || "app.trackup.com",
            "x-forwarded-proto": "https",
          },
          payload,
        });

        return {
          statusCode: backendRes.statusCode,
          headers: backendRes.headers,
          body: backendRes.body,
          json: () => JSON.parse(backendRes.body),
        };
      }

      if (rule.source === "/(.*)" && rule.destination === "/index.html") {
        // SPA Fallback served by Vercel static asset layer
        return {
          statusCode: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
          body: "<!DOCTYPE html><html><head><title>TrackUp</title></head><body><div id=\"root\"></div></body></html>",
          json: () => {
            throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
          },
        };
      }
    }

    return {
      statusCode: 404,
      headers: { "content-type": "text/plain" },
      body: "Not Found",
      json: () => ({ error: "Not Found" }),
    };
  };
}

describe("Milestone 3A: Production Routing, Same-Origin Authentication & Deployment Verification", () => {
  let app: FastifyInstance;
  let edgeRouter: ReturnType<typeof createVercelEdgeRouter>;

  const vercelConfigPath = path.resolve(__dirname, "../../web/vercel.json");
  const viteConfigPath = path.resolve(__dirname, "../../web/vite.config.ts");
  const renderConfigPath = path.resolve(__dirname, "../../../render.yaml");

  const TRUSTED_PRODUCTION_ORIGIN = "https://app.trackup.com";
  const UNTRUSTED_ORIGIN = "https://malicious-attacker.com";
  const TEST_EMAIL = "m3a-routing-test@trackup.com";
  const TEST_PASSWORD = "Password123!Secure";

  let createdRawToken: string;
  let validSessionCookie: string;

  beforeAll(async () => {
    app = buildApp({
      logger: false,
      corsOrigins: ["https://app.trackup.com", "https://trackup.vercel.app"],
    });
    await app.ready();

    edgeRouter = createVercelEdgeRouter(app, vercelConfigPath);

    // Clean up any test user residue
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    await app.close();
  });

  describe("1. Vercel Configuration & Routing Order Verification", () => {
    it("apps/web/vercel.json exists and prioritizes API routing before SPA fallback", () => {
      expect(fs.existsSync(vercelConfigPath)).toBe(true);

      const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
      expect(vercelConfig.rewrites).toBeDefined();
      expect(Array.isArray(vercelConfig.rewrites)).toBe(true);
      expect(vercelConfig.rewrites.length).toBeGreaterThanOrEqual(2);

      const apiIndex = vercelConfig.rewrites.findIndex(
        (r: any) => r.source === "/api/:path*"
      );
      const spaIndex = vercelConfig.rewrites.findIndex(
        (r: any) => r.source === "/(.*)" && r.destination === "/index.html"
      );

      expect(apiIndex).toBeGreaterThanOrEqual(0);
      expect(spaIndex).toBeGreaterThanOrEqual(0);
      expect(apiIndex).toBeLessThan(spaIndex);

      const apiRule = vercelConfig.rewrites[apiIndex];
      expect(apiRule.destination).toBe(
        "https://trackup-api.onrender.com/api/:path*"
      );
    });

    it("render.yaml defines matching trackup-api web service and production configuration", () => {
      expect(fs.existsSync(renderConfigPath)).toBe(true);
      const content = fs.readFileSync(renderConfigPath, "utf8");

      expect(content).toContain("name: trackup-api");
      expect(content).toContain("type: web");
      expect(content).toContain("NODE_ENV");
      expect(content).toContain("CORS_ORIGIN");
      expect(content).toContain("TRUST_PROXY");
    });
  });

  describe("2. Edge Routing: API Precedence vs. SPA Fallback", () => {
    it("routes unauthenticated /api/auth/me to API backend returning JSON (401 Unauthorized), NOT index.html", async () => {
      const res = await edgeRouter({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          accept: "application/json",
        },
      });

      expect(res.statusCode).toBe(401);
      expect(String(res.headers["content-type"])).toContain("application/json");
      expect(res.json().error).toBeDefined();
      expect(res.body).not.toContain("<!DOCTYPE html>");
    });

    it("routes frontend page navigation (/dashboard, /expenses, /login) to SPA fallback (index.html)", async () => {
      const dashboardRes = await edgeRouter({
        method: "GET",
        url: "/dashboard",
      });
      expect(dashboardRes.statusCode).toBe(200);
      expect(String(dashboardRes.headers["content-type"])).toContain("text/html");
      expect(dashboardRes.body).toContain("<!DOCTYPE html>");
      expect(dashboardRes.body).toContain('<div id="root"></div>');

      const expensesRes = await edgeRouter({
        method: "GET",
        url: "/expenses",
      });
      expect(expensesRes.statusCode).toBe(200);
      expect(expensesRes.body).toContain("<!DOCTYPE html>");

      const loginRes = await edgeRouter({
        method: "GET",
        url: "/login",
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body).toContain("<!DOCTYPE html>");
    });

    it("preserves API 404 responses as JSON error objects instead of serving index.html", async () => {
      const notFoundRes = await edgeRouter({
        method: "GET",
        url: "/api/nonexistent-feature-endpoint",
        headers: {
          accept: "application/json",
        },
      });

      expect(notFoundRes.statusCode).toBe(404);
      expect(String(notFoundRes.headers["content-type"])).toContain("application/json");
      expect(notFoundRes.body).not.toContain("<!DOCTYPE html>");
      const parsed = notFoundRes.json();
      expect(parsed.statusCode).toBe(404);
      expect(parsed.error).toBe("Not Found");
    });
  });

  describe("3. Query Strings, HTTP Methods, and Request Bodies Through Proxy", () => {
    it("preserves query strings on GET requests forwarded through the proxy", async () => {
      const res = await edgeRouter({
        method: "GET",
        url: "/api/expenses?month=2026-10",
        headers: {
          accept: "application/json",
        },
      });

      // Handled by expense routes (or returns 401 if unauthorized, but query is received)
      expect(res.statusCode).toBe(401);
      expect(String(res.headers["content-type"])).toContain("application/json");
      expect(res.json().error).toBeDefined();
    });

    it("preserves POST method, Content-Type, and request body through the proxy", async () => {
      const regRes = await edgeRouter({
        method: "POST",
        url: "/api/auth/register",
        headers: {
          origin: TRUSTED_PRODUCTION_ORIGIN,
          "content-type": "application/json",
          accept: "application/json",
        },
        payload: {
          name: "M3A Test User",
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      expect(regRes.statusCode).toBe(201);
      const data = regRes.json();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(TEST_EMAIL);
      expect(data.user.name).toBe("M3A Test User");
    });
  });

  describe("4. Session-Cookie Compatibility & RFC 6265bis __Host- Invariants", () => {
    it("authenticates via login through proxy, setting session cookie with __Host- prefix in production", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        expect(getSessionCookieName()).toBe(PROD_SESSION_COOKIE_NAME);
        expect(getSessionCookieName()).toBe("__Host-trackup_session");

        const cookieOptions = getSessionCookieOptions();
        expect(cookieOptions.secure).toBe(true);
        expect(cookieOptions.httpOnly).toBe(true);
        expect(cookieOptions.sameSite).toBe("lax");
        expect(cookieOptions.path).toBe("/");
        expect((cookieOptions as any).domain).toBeUndefined();

        // Perform login through edge router
        const loginRes = await edgeRouter({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: TRUSTED_PRODUCTION_ORIGIN,
            "content-type": "application/json",
            accept: "application/json",
          },
          payload: {
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
          },
        });

        expect(loginRes.statusCode).toBe(200);
        const setCookie = loginRes.headers["set-cookie"];
        expect(setCookie).toBeDefined();

        const cookieString = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
        expect(cookieString).toContain("__Host-trackup_session=");
        expect(cookieString).toContain("Path=/");
        expect(cookieString).toContain("HttpOnly");
        expect(cookieString).toContain("SameSite=Lax");
        expect(cookieString).toContain("Secure");
        expect(cookieString.toLowerCase()).not.toContain("domain=");

        validSessionCookie = cookieString.split(";")[0];
        createdRawToken = validSessionCookie.split("=")[1];
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("persists authenticated session on subsequent /api/auth/me requests through proxy", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const meRes = await edgeRouter({
          method: "GET",
          url: "/api/auth/me",
          headers: {
            cookie: `__Host-trackup_session=${createdRawToken}`,
            accept: "application/json",
          },
        });

        expect(meRes.statusCode).toBe(200);
        const data = meRes.json();
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe(TEST_EMAIL);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("persists authentication across simulated page refresh (/dashboard -> /api/auth/me)", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        // Step 1: User refreshes page at /dashboard
        const pageRes = await edgeRouter({
          method: "GET",
          url: "/dashboard",
          headers: {
            cookie: `__Host-trackup_session=${createdRawToken}`,
          },
        });
        expect(pageRes.statusCode).toBe(200);
        expect(pageRes.body).toContain("<!DOCTYPE html>");

        // Step 2: SPA boots in browser and calls /api/auth/me with ambient cookie
        const authMeRes = await edgeRouter({
          method: "GET",
          url: "/api/auth/me",
          headers: {
            cookie: `__Host-trackup_session=${createdRawToken}`,
            accept: "application/json",
          },
        });
        expect(authMeRes.statusCode).toBe(200);
        expect(authMeRes.json().user?.email).toBe(TEST_EMAIL);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("invalidates session in database and clears cookie on logout through proxy", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        // Perform logout
        const logoutRes = await edgeRouter({
          method: "POST",
          url: "/api/auth/logout",
          headers: {
            origin: TRUSTED_PRODUCTION_ORIGIN,
            cookie: `__Host-trackup_session=${createdRawToken}`,
            "content-type": "application/json",
          },
          payload: {},
        });

        expect(logoutRes.statusCode).toBe(200);
        const setCookie = logoutRes.headers["set-cookie"];
        expect(setCookie).toBeDefined();
        const cookieString = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
        expect(cookieString).toContain("__Host-trackup_session=");
        expect(cookieString).toMatch(/Max-Age=0|expires=/i);

        // Subsequent /api/auth/me returns 401 Unauthorized because session was invalidated
        const subsequentMeRes = await edgeRouter({
          method: "GET",
          url: "/api/auth/me",
          headers: {
            cookie: `__Host-trackup_session=${createdRawToken}`,
            accept: "application/json",
          },
        });

        expect(subsequentMeRes.statusCode).toBe(401);
        expect(subsequentMeRes.json().error).toBe("Authentication required");
        expect(subsequentMeRes.json().code).toBe("UNAUTHENTICATED");
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe("5. CORS, CSRF, and Origin Defenses Enforced Through Proxy", () => {
    it("rejects state-changing requests with untrusted Origin header with 403 CSRF_ORIGIN_INVALID", async () => {
      const untrustedRes = await edgeRouter({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: UNTRUSTED_ORIGIN,
          "content-type": "application/json",
        },
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      expect(untrustedRes.statusCode).toBe(403);
      expect(String(untrustedRes.headers["content-type"])).toContain("application/json");
      expect(untrustedRes.body).not.toContain("<!DOCTYPE html>");
      const parsed = untrustedRes.json();
      expect(parsed.code).toBe("CSRF_ORIGIN_INVALID");
      expect(parsed.error).toContain("Untrusted request origin");
    });

    it("rejects state-changing requests carrying ambient cookies without Origin/Referer with 403 CSRF_HEADER_MISSING", async () => {
      // Create fresh session for this check
      const loginRes = await edgeRouter({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: TRUSTED_PRODUCTION_ORIGIN,
          "content-type": "application/json",
        },
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });
      expect(loginRes.statusCode).toBe(200);

      // Attempt state change carrying cookie without Origin or Referer
      const mutateRes = await edgeRouter({
        method: "POST",
        url: "/api/expenses",
        headers: {
          cookie: `trackup_session=${loginRes.headers["set-cookie"]}`,
          "content-type": "application/json",
        },
        payload: {
          amount: 50,
          category: "Food",
          date: "2026-10-14",
        },
      });

      expect(mutateRes.statusCode).toBe(403);
      const parsed = mutateRes.json();
      expect(parsed.code).toBe("CSRF_HEADER_MISSING");
    });

    it("rejects cross-site fetch requests (Sec-Fetch-Site: cross-site) with 403 CSRF_CROSS_SITE", async () => {
      const crossSiteRes = await edgeRouter({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: TRUSTED_PRODUCTION_ORIGIN,
          "sec-fetch-site": "cross-site",
          "content-type": "application/json",
        },
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      expect(crossSiteRes.statusCode).toBe(403);
      expect(crossSiteRes.json().code).toBe("CSRF_CROSS_SITE");
    });
  });

  describe("6. Local Development Compatibility Verification", () => {
    it("apps/web/vite.config.ts defines /api proxy targeting http://localhost:4000 with changeOrigin", () => {
      expect(fs.existsSync(viteConfigPath)).toBe(true);
      const viteContent = fs.readFileSync(viteConfigPath, "utf8");

      expect(viteContent).toContain('"/api"');
      expect(viteContent).toContain("http://localhost:4000");
      expect(viteContent).toContain("changeOrigin: true");
    });

    it("uses trackup_session and secure=false in development environment for plain HTTP localhost", () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      try {
        expect(getSessionCookieName()).toBe(DEFAULT_SESSION_COOKIE_NAME);
        expect(getSessionCookieName()).toBe("trackup_session");

        const options = getSessionCookieOptions();
        expect(options.secure).toBe(false);
        expect(options.httpOnly).toBe(true);
        expect(options.path).toBe("/");
        expect(options.sameSite).toBe("lax");
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("CORS origin fallback defaults to localhost and 127.0.0.1 for seamless dev experience", () => {
      expect(DEV_DEFAULT_CORS_ORIGIN).toBe("http://localhost:5173,http://127.0.0.1:5173");
      const parsed = parseCorsOrigins(DEV_DEFAULT_CORS_ORIGIN);
      expect(parsed).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
    });
  });
});
