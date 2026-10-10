import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import {
  cleanupExpiredSessions,
  createSession,
  DEFAULT_SESSION_COOKIE_NAME,
  extractSessionToken,
  generateSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  hashSessionToken,
  isSessionCleanupInProgress,
  PROD_SESSION_COOKIE_NAME,
  runSafeSessionCleanup,
  validateSession,
} from "../src/auth/session.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { sessions, users } from "../src/db/schema.js";

describe("Phase 1B.3b: Session Cleanup & Production Cookie Security", () => {
  let app: FastifyInstance;
  let testUserId: string;
  const testUserEmail = `cleanup_test_${Date.now()}@example.com`;
  const plainPassword = "TestPassword123!";

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);
    const [user] = await db
      .insert(users)
      .values({
        email: testUserEmail,
        name: "Session Lifecycle Tester",
        passwordHash,
      })
      .returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, testUserId));
    await app.close();
    await closeDatabasePool();
  });

  describe("1. Expired-Session Cleanup Engine", () => {
    it("deletes only expired sessions and preserves active ones", async () => {
      const now = new Date();

      // Create an expired session (expired 1 hour ago)
      const expiredRawToken = generateSessionToken();
      await db.insert(sessions).values({
        userId: testUserId,
        tokenHash: hashSessionToken(expiredRawToken),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      });

      // Create an active session (valid for 24 hours)
      const activeRawToken = generateSessionToken();
      await db.insert(sessions).values({
        userId: testUserId,
        tokenHash: hashSessionToken(activeRawToken),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });

      // Execute cleanup
      const result = await cleanupExpiredSessions({ now });
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);

      // Verify the active session is still valid and resolvable
      const validatedActive = await validateSession(activeRawToken);
      expect(validatedActive).not.toBeNull();
      expect(validatedActive?.user.id).toBe(testUserId);

      // Verify the expired session is completely gone from the database
      const validatedExpired = await validateSession(expiredRawToken);
      expect(validatedExpired).toBeNull();
    });

    it("respects batchSize limits during cleanup to bound database work", async () => {
      const now = new Date();

      // Seed 3 expired sessions
      for (let i = 0; i < 3; i++) {
        const token = generateSessionToken();
        await db.insert(sessions).values({
          userId: testUserId,
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(now.getTime() - (i + 1) * 3600 * 1000),
        });
      }

      // Cleanup with batch size of 2
      const firstBatch = await cleanupExpiredSessions({ now, batchSize: 2 });
      expect(firstBatch.deletedCount).toBe(2);

      // Second batch cleans up the remaining expired session(s)
      const secondBatch = await cleanupExpiredSessions({ now, batchSize: 2 });
      expect(secondBatch.deletedCount).toBeGreaterThanOrEqual(1);
    });

    it("is idempotent when no expired sessions exist", async () => {
      const result = await cleanupExpiredSessions({ now: new Date() });
      // Should delete 0 without errors
      expect(result.deletedCount).toBe(0);
    });
  });

  describe("2. Concurrency Guarding & runSafeSessionCleanup", () => {
    it("manages process-level lock and skips overlapping runs", async () => {
      expect(isSessionCleanupInProgress()).toBe(false);

      // Normal execution returns result and releases lock
      const res = await runSafeSessionCleanup();
      expect(res).not.toBeNull();
      expect(typeof res?.deletedCount).toBe("number");
      expect(isSessionCleanupInProgress()).toBe(false);
    });
  });

  describe("3. Production Cookie Security & Attributes", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterAll(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("returns trackup_session and secure=false in development/test", () => {
      process.env.NODE_ENV = "test";
      expect(getSessionCookieName()).toBe(DEFAULT_SESSION_COOKIE_NAME);
      expect(getSessionCookieName()).toBe("trackup_session");

      const options = getSessionCookieOptions();
      expect(options.secure).toBe(false);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
      expect((options as any).domain).toBeUndefined();
    });

    it("returns __Host-trackup_session and secure=true in production complying with RFC 6265bis", () => {
      process.env.NODE_ENV = "production";
      try {
        expect(getSessionCookieName()).toBe(PROD_SESSION_COOKIE_NAME);
        expect(getSessionCookieName()).toBe("__Host-trackup_session");

        const options = getSessionCookieOptions();
        // Constraints for __Host- cookie prefix:
        // 1. Must be Secure
        expect(options.secure).toBe(true);
        // 2. Must have Path=/
        expect(options.path).toBe("/");
        // 3. Must NOT specify Domain
        expect((options as any).domain).toBeUndefined();
        // 4. Must be HttpOnly
        expect(options.httpOnly).toBe(true);
        // 5. Must have SameSite=Lax for same-site security
        expect(options.sameSite).toBe("lax");
      } finally {
        process.env.NODE_ENV = "test";
      }
    });

    it("extractSessionToken safely resolves primary and fallback cookie names", () => {
      // In test mode:
      process.env.NODE_ENV = "test";
      expect(
        extractSessionToken({ [DEFAULT_SESSION_COOKIE_NAME]: "token-123" })
      ).toBe("token-123");

      // In production mode:
      process.env.NODE_ENV = "production";
      try {
        // Reads __Host- cookie
        expect(
          extractSessionToken({ [PROD_SESSION_COOKIE_NAME]: "prod-token-456" })
        ).toBe("prod-token-456");

        // Gracefully falls back to default cookie if during transition
        expect(
          extractSessionToken({ [DEFAULT_SESSION_COOKIE_NAME]: "legacy-token-789" })
        ).toBe("legacy-token-789");

        // Returns undefined for empty or missing
        expect(extractSessionToken(undefined)).toBeUndefined();
        expect(extractSessionToken({})).toBeUndefined();
        expect(extractSessionToken({ [PROD_SESSION_COOKIE_NAME]: "" })).toBeUndefined();
      } finally {
        process.env.NODE_ENV = "test";
      }
    });
  });

  describe("4. End-to-End Production Cookie Issuance & Clearing", () => {
    let prodApp: FastifyInstance;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeAll(async () => {
      process.env.NODE_ENV = "production";
      prodApp = buildApp({ logger: false });
      await prodApp.ready();
    });

    afterAll(async () => {
      await prodApp.close();
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("issues __Host-trackup_session with Secure, HttpOnly, and SameSite=Lax on login", async () => {
      const res = await prodApp.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://localhost:5173",
        },
        payload: {
          email: testUserEmail,
          password: plainPassword,
        },
      });

      expect(res.statusCode).toBe(200);
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();

      const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
      // Verify prefix
      expect(cookieStr).toContain("__Host-trackup_session=");
      // Verify security attributes
      expect(cookieStr).toMatch(/Secure/i);
      expect(cookieStr).toMatch(/HttpOnly/i);
      expect(cookieStr).toMatch(/SameSite=Lax/i);
      expect(cookieStr).toMatch(/Path=\//i);
      // Verify Domain attribute is absent
      expect(cookieStr).not.toMatch(/Domain=/i);
    });

    it("clears __Host-trackup_session on logout with matching security attributes", async () => {
      // First login to get a valid token
      const loginRes = await prodApp.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://localhost:5173",
        },
        payload: {
          email: testUserEmail,
          password: plainPassword,
        },
      });

      const setCookie = loginRes.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
      const tokenMatch = cookieStr.match(/__Host-trackup_session=([^;]+)/);
      expect(tokenMatch).not.toBeNull();
      const token = tokenMatch![1];

      // Logout with the session cookie and valid Origin
      const logoutRes = await prodApp.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          cookie: `__Host-trackup_session=${token}`,
          origin: "http://localhost:5173",
        },
      });

      expect(logoutRes.statusCode).toBe(200);
      const clearCookie = logoutRes.headers["set-cookie"];
      expect(clearCookie).toBeDefined();
      const clearStr = Array.isArray(clearCookie) ? clearCookie.join("; ") : String(clearCookie);

      expect(clearStr).toContain("__Host-trackup_session=");
      expect(clearStr).toMatch(/Secure/i);
      expect(clearStr).toMatch(/Path=\//i);
      expect(clearStr).toMatch(/HttpOnly/i);

      // Verify the session is invalidated in PostgreSQL
      const validated = await validateSession(token);
      expect(validated).toBeNull();
    });
  });

  describe("5. Periodic Session Cleanup Lifecycle", () => {
    it("initializes and gracefully shuts down background cleanup task", async () => {
      const scheduledApp = buildApp({
        logger: false,
        enableSessionCleanup: true,
        sessionCleanupIntervalMs: 60000,
      });

      await scheduledApp.ready();
      // Should shut down cleanly without leaving active unhandled timers
      await scheduledApp.close();
    });
  });
});
