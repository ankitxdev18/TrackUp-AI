import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import * as passwordModule from "../src/auth/password.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Phase 1B.2b: Authentication Rate Limiting & Login Timing Defenses", () => {
  const TRUSTED_ORIGIN = "http://localhost:5173";
  const TEST_EMAIL = `rate_limit_timing_${Date.now()}@trackup.test`;
  const TEST_PASSWORD = "CorrectPassword123!";
  let testUserId: string;

  beforeAll(async () => {
    // Clean up any test user residue
    await db.delete(users).where(eq(users.email, TEST_EMAIL));

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [created] = await db
      .insert(users)
      .values({
        name: "Rate Limit Timing User",
        email: TEST_EMAIL,
        passwordHash,
      })
      .returning();
    testUserId = created.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    await closeDatabasePool();
  });

  // =========================================================================
  // 1. RATE LIMITING: THRESHOLDS & RESPONSE BEHAVIOR
  // =========================================================================
  describe("Authentication Rate Limiting Thresholds & Behavior", () => {
    let rateLimitedApp: FastifyInstance;

    beforeAll(async () => {
      // Build app with a small rate limit threshold: 3 attempts per 5000ms window
      rateLimitedApp = buildApp({
        logger: false,
        corsOrigins: [TRUSTED_ORIGIN],
        rateLimit: {
          authMax: 3,
          authWindowMs: 5000,
          globalMax: 20,
          globalWindowMs: 5000,
        },
      });
      await rateLimitedApp.ready();
    });

    afterAll(async () => {
      await rateLimitedApp.close();
    });

    it("allows requests under the rate limit threshold", async () => {
      for (let i = 0; i < 3; i++) {
        const res = await rateLimitedApp.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin: TRUSTED_ORIGIN },
          payload: { email: TEST_EMAIL, password: "WrongPassword123!" },
        });
        expect(res.statusCode).toBe(401);
      }
    });

    it("rejects subsequent requests exceeding the threshold with HTTP 429 Too Many Requests", async () => {
      // 4th request from same IP must be rate-limited
      const res = await rateLimitedApp.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: { email: TEST_EMAIL, password: "WrongPassword123!" },
      });

      expect(res.statusCode).toBe(429);
      const body = res.json();
      expect(body).toEqual({
        statusCode: 429,
        error: "Too Many Requests",
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });

      // Verify standard rate limit headers are present
      expect(res.headers["retry-after"]).toBeDefined();
      expect(String(res.headers["x-ratelimit-limit"])).toBe("3");
      expect(String(res.headers["x-ratelimit-remaining"])).toBe("0");
    });

    it("enforces rate limits on registration (/api/auth/register)", async () => {
      // Register with the same app until rate limited (3 attempts allowed)
      for (let i = 0; i < 3; i++) {
        await rateLimitedApp.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { origin: TRUSTED_ORIGIN },
          payload: {
            name: "Register Spammer",
            email: `spam_${Date.now()}_${i}@trackup.test`,
            password: "ValidPassword123!",
          },
        });
      }

      const res4 = await rateLimitedApp.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          name: "Register Spammer",
          email: `spam_${Date.now()}_4@trackup.test`,
          password: "ValidPassword123!",
        },
      });

      // 4th attempt from same client IP must be rate limited
      expect(res4.statusCode).toBe(429);
      expect(res4.json().code).toBe("RATE_LIMITED");
    });
  });

  // =========================================================================
  // 2. TIMING DEFENSES & PUBLIC ERROR BEHAVIOR
  // =========================================================================
  describe("Login Timing Defenses & Error Uniformity", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp({
        logger: false,
        corsOrigins: [TRUSTED_ORIGIN],
      });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it("returns identical HTTP status and body for nonexistent user vs incorrect password", async () => {
      const nonexistentRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          email: "nonexistent-user-12345@trackup.test",
          password: "SomePassword123!",
        },
      });

      const wrongPasswordRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          email: TEST_EMAIL,
          password: "IncorrectPassword123!",
        },
      });

      expect(nonexistentRes.statusCode).toBe(401);
      expect(wrongPasswordRes.statusCode).toBe(401);

      expect(nonexistentRes.json()).toEqual({
        error: "Invalid email or password",
        code: "UNAUTHENTICATED",
      });

      expect(wrongPasswordRes.json()).toEqual({
        error: "Invalid email or password",
        code: "UNAUTHENTICATED",
      });

      // Exact deep equality between nonexistent and incorrect-password responses
      expect(nonexistentRes.json()).toEqual(wrongPasswordRes.json());
    });

    it("executes dummy Argon2id verification using DUMMY_PASSWORD_HASH for nonexistent user", async () => {
      const verifySpy = vi.spyOn(passwordModule, "verifyPassword");

      try {
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin: TRUSTED_ORIGIN },
          payload: {
            email: "nonexistent-user-timing@trackup.test",
            password: "CandidatePassword123!",
          },
        });

        // Verify that verifyPassword was called with DUMMY_PASSWORD_HASH
        expect(verifySpy).toHaveBeenCalledWith(
          passwordModule.DUMMY_PASSWORD_HASH,
          "CandidatePassword123!"
        );
      } finally {
        verifySpy.mockRestore();
      }
    });

    it("preserves successful login under normal conditions", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe(TEST_EMAIL);
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("never discloses submitted passwords or hashes in error logs or responses", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: TRUSTED_ORIGIN },
        payload: {
          email: TEST_EMAIL,
          password: "MySuperSecretPlaintextPassword123!",
        },
      });

      const bodyStr = JSON.stringify(res.json());
      expect(bodyStr).not.toContain("MySuperSecretPlaintextPassword123!");
      expect(bodyStr).not.toContain("argon2");
      expect(bodyStr).not.toContain("$argon2id$");
    });
  });

  // =========================================================================
  // 3. PROXY & IP SPOOFING DEFENSE
  // =========================================================================
  describe("Proxy & IP Spoofing Defenses", () => {
    it("cannot bypass rate limit by spoofing X-Forwarded-For when trustProxy is false", async () => {
      const appNoProxy = buildApp({
        logger: false,
        trustProxy: false,
        rateLimit: {
          authMax: 2,
          authWindowMs: 10000,
        },
      });
      await appNoProxy.ready();

      try {
        // Request 1 with spoofed IP
        const res1 = await appNoProxy.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": "198.51.100.1",
          },
          payload: { email: TEST_EMAIL, password: "WrongPassword123!" },
        });
        expect(res1.statusCode).toBe(401);

        // Request 2 with different spoofed IP
        const res2 = await appNoProxy.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": "198.51.100.2",
          },
          payload: { email: TEST_EMAIL, password: "WrongPassword123!" },
        });
        expect(res2.statusCode).toBe(401);

        // Request 3 with yet another spoofed IP — must still be blocked because trustProxy: false
        const res3 = await appNoProxy.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": "198.51.100.3",
          },
          payload: { email: TEST_EMAIL, password: "WrongPassword123!" },
        });
        expect(res3.statusCode).toBe(429);
      } finally {
        await appNoProxy.close();
      }
    });

    it("avoids locking legitimate users out when an attacker targets their account", async () => {
      // When an attacker floods from one IP, only that IP is rate-limited.
      // Another client IP can still log into the targeted account without permanent lockout.
      const multiClientApp = buildApp({
        logger: false,
        trustProxy: true, // Allow simulating multiple distinct client IPs
        rateLimit: {
          authMax: 2,
          authWindowMs: 10000,
        },
      });
      await multiClientApp.ready();

      try {
        const ATTACKER_IP = "203.0.113.195";
        const LEGITIMATE_USER_IP = "198.51.100.42";

        // Attacker attempts 2 guesses from ATTACKER_IP
        for (let i = 0; i < 2; i++) {
          await multiClientApp.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: {
              origin: TRUSTED_ORIGIN,
              "x-forwarded-for": ATTACKER_IP,
            },
            payload: { email: TEST_EMAIL, password: "AttackerGuess123!" },
          });
        }

        // 3rd attempt from Attacker is blocked (429)
        const attackerBlocked = await multiClientApp.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": ATTACKER_IP,
          },
          payload: { email: TEST_EMAIL, password: "AttackerGuess123!" },
        });
        expect(attackerBlocked.statusCode).toBe(429);

        // Legitimate user from a different IP is NOT locked out and can log in successfully
        const legitRes = await multiClientApp.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": LEGITIMATE_USER_IP,
          },
          payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
        });
        expect(legitRes.statusCode).toBe(200);
        expect(legitRes.json().user.email).toBe(TEST_EMAIL);
      } finally {
        await multiClientApp.close();
      }
    });
  });

  // =========================================================================
  // 4. SECURITY FOLLOW-UP ITEMS (CHECKS 1–4 RECONCILIATION)
  // =========================================================================
  describe("Security Follow-up Hardening Verification", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp({
        logger: false,
        corsOrigins: [TRUSTED_ORIGIN],
      });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it("Check 1: preflight OPTIONS response does not expose x-dev-user-id in allowed headers", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/tasks",
        headers: {
          origin: TRUSTED_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });

      expect(res.statusCode).toBe(204);
      const allowedHeaders = res.headers["access-control-allow-headers"];
      expect(allowedHeaders).toBeDefined();
      expect(String(allowedHeaders)).not.toContain("x-dev-user-id");
    });

    it("Check 3: preflight OPTIONS response does not expose Set-Cookie in exposed headers", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/auth/login",
        headers: {
          origin: TRUSTED_ORIGIN,
          "access-control-request-method": "POST",
        },
      });

      expect(res.statusCode).toBe(204);
      const exposedHeaders = res.headers["access-control-expose-headers"];
      expect(exposedHeaders).toBeUndefined();
    });

    it("Check 4: rejects duplicate array Referer headers with 403 CSRF_REFERER_INVALID", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          // Pass duplicate referer as array
          referer: ["http://localhost:5173", "http://evil.com"] as any,
          "x-dev-user-id": testUserId,
        },
        payload: { name: "Duplicate Referer Test" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_REFERER_INVALID");
    });

    it("Check 4: accepts mixed-case Origin matching trusted origin after normalization", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: {
          origin: "HTTP://LOCALHOST:5173",
          "x-dev-user-id": testUserId,
        },
        payload: { name: "Mixed Case Origin Test" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().project.name).toBe("Mixed Case Origin Test");
    });

    it("Check 2: rejects browser login request missing Origin/Referer when browser metadata is present (Login-CSRF defense)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_HEADER_MISSING");
    });

    it("Check 2: allows explicit API client contract (X-TrackUp-Client: api) without Origin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          "x-trackup-client": "api",
        },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe(TEST_EMAIL);
    });
  });
});
