import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE_NAME } from "../src/auth/session.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Phase 1B.2a: CORS and CSRF Protection", () => {
  let app: FastifyInstance;
  const TRUSTED_ORIGIN = "http://localhost:5173";
  const UNTRUSTED_ORIGIN = "http://evil-attacker.example.com";
  const TEST_EMAIL = "cors-csrf-test@trackup.com";
  const TEST_PASSWORD = "Password123!";
  let testUserId: string;
  let validSessionCookie: string;

  beforeAll(async () => {
    app = buildApp({
      logger: false,
      corsOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    });
    await app.ready();

    // Clean up any test user residue
    await db.delete(users).where(eq(users.email, TEST_EMAIL));

    // Register test user
    const regRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin: TRUSTED_ORIGIN },
      payload: {
        name: "CORS Test User",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(regRes.statusCode).toBe(201);
    testUserId = regRes.json().user.id;

    // Login test user to acquire valid session cookie
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: TRUSTED_ORIGIN },
      payload: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const setCookie = loginRes.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    validSessionCookie = String(setCookie).split(";")[0];
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    await app.close();
    await closeDatabasePool();
  });

  describe("Requirement 1: Allowed Origin Receives Correct CORS Headers", () => {
    it("sets Access-Control-Allow-Origin, Allow-Credentials, and Vary for trusted origin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: {
          origin: TRUSTED_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(TRUSTED_ORIGIN);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["vary"]).toContain("Origin");
    });
  });

  describe("Requirement 2: Untrusted Origin Is Not Granted Credentialed Access", () => {
    it("omits Access-Control-Allow-Origin when request originates from an untrusted origin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: {
          origin: UNTRUSTED_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Requirement 3: Credentialed CORS Never Uses Wildcard Origin", () => {
    it("never responds with Access-Control-Allow-Origin: * when credentials are enabled", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: {
          origin: TRUSTED_ORIGIN,
        },
      });

      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });
  });

  describe("Requirement 4: Preflight Requests Work Correctly", () => {
    it("handles valid CORS preflight request with appropriate methods and headers", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/projects",
        headers: {
          origin: TRUSTED_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,accept",
        },
      });

      expect([200, 204]).toContain(res.statusCode);
      expect(res.headers["access-control-allow-origin"]).toBe(TRUSTED_ORIGIN);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-methods"]).toBeDefined();
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("rejects or does not permit preflight from an untrusted origin", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/projects",
        headers: {
          origin: UNTRUSTED_ORIGIN,
          "access-control-request-method": "POST",
        },
      });

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Requirement 5: Untrusted Origin Cannot Pass Origin Protection for Unsafe Requests", () => {
    it("rejects POST /api/auth/login with untrusted origin (403 CSRF_ORIGIN_INVALID)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: UNTRUSTED_ORIGIN,
        },
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Untrusted request origin",
        code: "CSRF_ORIGIN_INVALID",
      });
    });

    it("rejects POST /api/auth/register with untrusted origin (403 CSRF_ORIGIN_INVALID)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: {
          origin: UNTRUSTED_ORIGIN,
        },
        payload: {
          name: "Attacker",
          email: "attacker@evil.com",
          password: "Password123!",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Untrusted request origin",
        code: "CSRF_ORIGIN_INVALID",
      });
    });

    it("rejects authenticated domain mutations with untrusted origin (403 CSRF_ORIGIN_INVALID)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          origin: UNTRUSTED_ORIGIN,
        },
        payload: {
          name: "Forged Project",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_ORIGIN_INVALID");
    });
  });

  describe("Requirement 6: Referer Fallback Validation & Rejection", () => {
    it("rejects unsafe request with untrusted Referer header (403 CSRF_REFERER_INVALID)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          referer: "http://attacker-site.com/exploit",
        },
        payload: { name: "Referer Attack Project" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Untrusted request referer",
        code: "CSRF_REFERER_INVALID",
      });
    });

    it("rejects unsafe request with malformed Referer URL (403 CSRF_REFERER_INVALID)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          referer: "not-a-valid-url",
        },
        payload: { name: "Malformed Referer" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Malformed Referer header",
        code: "CSRF_REFERER_INVALID",
      });
    });

    it("rejects unsafe request with non-http/https Referer scheme (403 CSRF_REFERER_INVALID)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          referer: "ftp://localhost:5173/files",
        },
        payload: { name: "FTP Referer" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Invalid Referer protocol",
        code: "CSRF_REFERER_INVALID",
      });
    });

    it("accepts unsafe request when Origin is absent but Referer matches trusted origin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          referer: "http://localhost:5173/dashboard/projects",
        },
        payload: { name: "Valid Referer Project" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().project.name).toBe("Valid Referer Project");
    });
  });

  describe("Requirement 7: Missing Origin and Referer Headers Follow Documented Policy", () => {
    it("fails closed on cookie-authenticated POST when both headers are missing (403 CSRF_HEADER_MISSING)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
        },
        payload: { name: "Missing Headers Attack" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Missing Origin or Referer header on authenticated state-changing request",
        code: "CSRF_HEADER_MISSING",
      });
    });

    it("fails closed on cookie-authenticated PATCH when both headers are missing (403 CSRF_HEADER_MISSING)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/tasks/00000000-0000-0000-0000-000000000000",
        headers: {
          cookie: validSessionCookie,
        },
        payload: { title: "Updated" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_HEADER_MISSING");
    });

    it("fails closed on cookie-authenticated DELETE when both headers are missing (403 CSRF_HEADER_MISSING)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/projects/00000000-0000-0000-0000-000000000000",
        headers: {
          cookie: validSessionCookie,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_HEADER_MISSING");
    });

    it("fails closed on cookie-authenticated POST /api/auth/logout when both headers are missing (403 CSRF_HEADER_MISSING)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          cookie: validSessionCookie,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_HEADER_MISSING");
    });

    it("allows non-cookie requests without Origin/Referer (unauthenticated login)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe(TEST_EMAIL);
    });

    it("allows non-cookie integration test requests using x-dev-user-id without Origin/Referer", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          "x-dev-user-id": testUserId,
        },
        payload: { name: "Non-cookie Dev Test Project" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().project.name).toBe("Non-cookie Dev Test Project");
    });
  });

  describe("Requirement 8: Read-Only Requests Are Not Incorrectly Blocked", () => {
    it("allows GET /health without Origin or Referer", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");
    });

    it("allows GET /health even with untrusted Origin (CORS handles browser isolation)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: UNTRUSTED_ORIGIN },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows authenticated GET /api/auth/me without Origin or Referer", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: validSessionCookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe(TEST_EMAIL);
    });

    it("allows authenticated GET /api/projects with untrusted Origin header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          origin: UNTRUSTED_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(200);
      // Untrusted origin does not receive Access-Control-Allow-Origin
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows HEAD /health without restriction", async () => {
      const res = await app.inject({
        method: "HEAD",
        url: "/health",
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("Requirement 9: Login, Registration, Logout, and Representative Domain Mutations", () => {
    it("rejects cross-site fetch metadata signal (Sec-Fetch-Site: cross-site) on mutation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          origin: TRUSTED_ORIGIN,
          "sec-fetch-site": "cross-site",
        },
        payload: { name: "Cross Site Blocked" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: "Cross-site requests are forbidden",
        code: "CSRF_CROSS_SITE",
      });
    });

    it("completes full legitimate authenticated mutation lifecycle with trusted origin", async () => {
      // 1. Create project with trusted origin
      const createProjRes = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          cookie: validSessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: { name: "Lifecycle Project" },
      });
      expect(createProjRes.statusCode).toBe(201);
      const projectId = createProjRes.json().project.id;

      // 2. Create task with trusted origin
      const createTaskRes = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: {
          cookie: validSessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          title: "Lifecycle Task",
          projectId,
        },
      });
      expect(createTaskRes.statusCode).toBe(201);
      const taskId = createTaskRes.json().task.id;

      // 3. Update task with trusted origin
      const patchTaskRes = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${taskId}`,
        headers: {
          cookie: validSessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: { status: "COMPLETED" },
      });
      expect(patchTaskRes.statusCode).toBe(200);

      // 4. Delete project with trusted origin
      const deleteProjRes = await app.inject({
        method: "DELETE",
        url: `/api/projects/${projectId}`,
        headers: {
          cookie: validSessionCookie,
          origin: TRUSTED_ORIGIN,
        },
      });
      expect(deleteProjRes.statusCode).toBe(200);

      // 5. Logout with trusted origin
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          cookie: validSessionCookie,
          origin: TRUSTED_ORIGIN,
        },
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.json().message).toBe("Logged out successfully");
    });
  });
});
