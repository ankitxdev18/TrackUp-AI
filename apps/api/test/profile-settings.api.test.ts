import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import {
  SESSION_COOKIE_NAME,
} from "../src/auth/session.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { users } from "../src/db/schema.js";

describe("Phase 4.5: Profile & Settings API Slice", () => {
  let app: FastifyInstance;
  const TRUSTED_ORIGIN = "http://localhost:5173";

  const testEmail = `profile_test_${Date.now()}@trackup.dev`;
  const initialPassword = "InitialPassword123!";
  const newPassword = "BrandNewSecurePassword456!";
  let testUserId: string;

  beforeAll(async () => {
    app = buildApp({
      logger: false,
      corsOrigins: [TRUSTED_ORIGIN],
    });
    await app.ready();

    // Clean up any test residue
    await db.delete(users).where(eq(users.email, testEmail));

    // Seed test user with initial Argon2id hash
    const passwordHash = await hashPassword(initialPassword);
    const [user] = await db
      .insert(users)
      .values({
        email: testEmail,
        name: "Initial Name",
        passwordHash,
        timezone: "UTC",
      })
      .returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await app.close();
    await closeDatabasePool();
  });

  // Helper to extract session cookie from set-cookie header
  function extractSessionCookie(setCookieHeaders: string | string[] | undefined): string {
    if (!setCookieHeaders) return "";
    const headerStr = Array.isArray(setCookieHeaders)
      ? setCookieHeaders.join("; ")
      : setCookieHeaders;
    const match = headerStr.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    return match ? `${SESSION_COOKIE_NAME}=${match[1]}` : "";
  }

  async function loginAndGetCookie(password = initialPassword): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: TRUSTED_ORIGIN },
      payload: {
        email: testEmail,
        password,
      },
    });
    expect(res.statusCode).toBe(200);
    return extractSessionCookie(res.headers["set-cookie"]);
  }

  describe("GET /api/auth/me — Extended Profile Payload", () => {
    it("returns safe profile fields including timezone and createdAt", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe(testUserId);
      expect(body.user.email).toBe(testEmail.toLowerCase());
      expect(body.user.name).toBe("Initial Name");
      expect(body.user.timezone).toBe("UTC");
      expect(typeof body.user.createdAt).toBe("string");
      expect(new Date(body.user.createdAt).toISOString()).toBe(body.user.createdAt);
      // Ensure passwordHash is never leaked
      expect(body.user.passwordHash).toBeUndefined();
    });

    it("rejects unauthenticated request with 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/auth/profile — Profile & Timezone Updates", () => {
    it("updates display name successfully", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          name: "Updated Display Name",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.name).toBe("Updated Display Name");
      expect(body.user.timezone).toBe("UTC");

      // Verify persistence via GET /me
      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookie },
      });
      expect(meRes.json().user.name).toBe("Updated Display Name");
    });

    it("updates timezone successfully with valid IANA timezone", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          timezone: "Asia/Tokyo",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.timezone).toBe("Asia/Tokyo");

      // Verify persistence via GET /me
      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookie },
      });
      expect(meRes.json().user.timezone).toBe("Asia/Tokyo");
    });

    it("updates both name and timezone simultaneously", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          name: "Global Nomad",
          timezone: "Europe/London",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.name).toBe("Global Nomad");
      expect(body.user.timezone).toBe("Europe/London");
    });

    it("rejects invalid IANA timezone identifier with 400 VALIDATION_ERROR", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          timezone: "Invalid/Fake_Zone_99",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details.some((d: { field: string }) => d.field === "timezone")).toBe(true);
    });

    it("rejects empty payload when neither name nor timezone is provided", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("rejects blank or empty name with 400 VALIDATION_ERROR", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          name: "   ",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("rejects unauthenticated PATCH /profile with 401", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/profile",
        headers: { origin: TRUSTED_ORIGIN },
        payload: { name: "Hacker" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/auth/change-password — Password Rotation & Session Revocation", () => {
    it("rejects unauthenticated request with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          currentPassword: initialPassword,
          newPassword: newPassword,
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects incorrect current password with 401 INCORRECT_CURRENT_PASSWORD", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          currentPassword: "WrongCurrentPassword123!",
          newPassword: newPassword,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("INCORRECT_CURRENT_PASSWORD");
    });

    it("rejects new password identical to current password with 400 VALIDATION_ERROR", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword: initialPassword,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("rejects new password under 10 characters with 400 VALIDATION_ERROR", async () => {
      const sessionCookie = await loginAndGetCookie();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: {
          cookie: sessionCookie,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword: "short9!",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("successfully changes password, rotates session, revokes prior sessions, and updates credentials", async () => {
      // 1. Establish initial session (Session A)
      const sessionCookieA = await loginAndGetCookie(initialPassword);

      // 2. Establish concurrent session (Session B) from another client
      const sessionCookieB = await loginAndGetCookie(initialPassword);

      // Both should currently be valid
      const checkA = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookieA },
      });
      expect(checkA.statusCode).toBe(200);

      const checkB = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookieB },
      });
      expect(checkB.statusCode).toBe(200);

      // 3. User changes password using Session A
      const changeRes = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: {
          cookie: sessionCookieA,
          origin: TRUSTED_ORIGIN,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword: newPassword,
        },
      });

      expect(changeRes.statusCode).toBe(200);
      const body = changeRes.json();
      expect(body.message).toBe("Password changed successfully");
      expect(body.sessionsRevoked).toBe(true);

      // 4. Inspect new session cookie issued in Set-Cookie
      const newSessionCookie = extractSessionCookie(changeRes.headers["set-cookie"]);
      expect(newSessionCookie).toBeTruthy();
      expect(newSessionCookie).not.toBe(sessionCookieA);

      // 5. Verify prior Session A is revoked
      const checkRevokedA = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookieA },
      });
      expect(checkRevokedA.statusCode).toBe(401);

      // 6. Verify concurrent Session B is revoked
      const checkRevokedB = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookieB },
      });
      expect(checkRevokedB.statusCode).toBe(401);

      // 7. Verify new session cookie works seamlessly
      const checkNewSession = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: newSessionCookie },
      });
      expect(checkNewSession.statusCode).toBe(200);
      expect(checkNewSession.json().user.id).toBe(testUserId);

      // 8. Verify logging in with old password fails
      const failLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          email: testEmail,
          password: initialPassword,
        },
      });
      expect(failLogin.statusCode).toBe(401);

      // 9. Verify logging in with new password succeeds
      const successLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          email: testEmail,
          password: newPassword,
        },
      });
      expect(successLogin.statusCode).toBe(200);
      expect(successLogin.json().user.id).toBe(testUserId);
    });
  });
});
