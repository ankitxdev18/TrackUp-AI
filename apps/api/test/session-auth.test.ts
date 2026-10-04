import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/auth/session.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { sessions, users } from "../src/db/schema.js";

describe("M2.5 Production Authentication & Session Slice", () => {
  let app: FastifyInstance;

  const userAEmail = `auth_usera_${Date.now()}@example.com`;
  const userBEmail = `auth_userb_${Date.now()}@example.com`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    // Seed test users with Argon2id hashed passwords
    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "User Alice",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "User Bob",
        passwordHash,
      })
      .returning();
    userBId = userB.id;
  });

  afterAll(async () => {
    // Cleanup sessions, users and close database pool
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // Helper to extract session cookie from set-cookie header
  function extractSessionCookie(setCookieHeaders: string | string[] | undefined): string | null {
    if (!setCookieHeaders) return null;
    const headerStr = Array.isArray(setCookieHeaders) ? setCookieHeaders.join("; ") : setCookieHeaders;
    const match = headerStr.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    return match ? match[1] : null;
  }

  describe("Phase 5: Login (POST /api/auth/login)", () => {
    it("1. valid credentials → 200 with safe user payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: plainPassword,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe(userAId);
      expect(body.user.email).toBe(userAEmail.toLowerCase());
      expect(body.user.name).toBe("User Alice");
      // Security checks: NEVER return passwordHash or raw tokens in JSON
      expect(body.user.passwordHash).toBeUndefined();
      expect(body.token).toBeUndefined();
      expect(body.session).toBeUndefined();
    });

    it("2. wrong password → 401 UNAUTHENTICATED with generic message", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: "WrongPassword456!",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(body.error).toBe("Invalid email or password");
    });

    it("3. nonexistent email → 401 UNAUTHENTICATED with generic message", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nonexistent_email_123456@example.com",
          password: plainPassword,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(body.error).toBe("Invalid email or password");
    });

    it("4. invalid payload → 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "not-an-email",
          password: "",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("5 & 6. successful login creates session in DB and sets HttpOnly cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: plainPassword,
        },
      });

      expect(res.statusCode).toBe(200);
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();

      const rawToken = extractSessionCookie(setCookie);
      expect(rawToken).toBeDefined();
      expect(rawToken!.length).toBe(64); // 32-byte hex

      // Cookie attributes
      const cookieStr = String(setCookie);
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("Path=/");
      expect(cookieStr).toContain("SameSite=Lax");

      // Verify session token hash stored in PostgreSQL
      const tokenHash = hashSessionToken(rawToken!);
      const [dbSession] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);

      expect(dbSession).toBeDefined();
      expect(dbSession.userId).toBe(userAId);
      expect(dbSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("7. failed login does not create session", async () => {
      const sessionsBefore = await db.select().from(sessions);

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: "IncorrectPassword!",
        },
      });

      expect(res.statusCode).toBe(401);
      const sessionsAfter = await db.select().from(sessions);
      expect(sessionsAfter.length).toBe(sessionsBefore.length);
    });
  });

  describe("Phase 10 & Session Verification: /api/auth/me", () => {
    it("8. /me with valid session cookie → 200", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: plainPassword,
        },
      });
      const cookie = loginRes.headers["set-cookie"];

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: String(cookie),
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.id).toBe(userAId);
      expect(body.user.email).toBe(userAEmail.toLowerCase());
      expect(body.user.name).toBe("User Alice");
    });

    it("9. /me without session cookie → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("10. /me with forged / invalid session cookie → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=forged_random_session_token_1234567890abcdef`,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("11. expired session → 401 UNAUTHENTICATED", async () => {
      // Create an expired session directly in DB
      const expiredRawToken = "expired_raw_token_test_1234567890abcdef";
      const tokenHash = hashSessionToken(expiredRawToken);

      await db.insert(sessions).values({
        userId: userAId,
        tokenHash,
        expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour in the past
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${expiredRawToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("13 & 14. session token is hashed in DB; raw token is never returned or persisted", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: plainPassword,
        },
      });
      const rawToken = extractSessionCookie(loginRes.headers["set-cookie"]);
      expect(rawToken).toBeDefined();

      // Check DB: rawToken MUST NOT appear in token_hash column
      const allSessions = await db.select().from(sessions);
      const matchesRaw = allSessions.some((s) => s.tokenHash === rawToken);
      expect(matchesRaw).toBe(false);

      // Check that SHA-256 hash exists
      const expectedHash = hashSessionToken(rawToken!);
      const matchesHash = allSessions.some((s) => s.tokenHash === expectedHash);
      expect(matchesHash).toBe(true);
    });
  });

  describe("Phase 11: Logout (POST /api/auth/logout)", () => {
    it("12, 15, 16, 17. logout clears cookie, invalidates server session, and prevents reuse", async () => {
      // 1. Login
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userAEmail,
          password: plainPassword,
        },
      });
      const cookie = loginRes.headers["set-cookie"];
      const rawToken = extractSessionCookie(cookie);

      // Verify /me works
      const meBefore = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: String(cookie) },
      });
      expect(meBefore.statusCode).toBe(200);

      // 2. Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie: String(cookie) },
      });
      expect(logoutRes.statusCode).toBe(200);

      // Verify cookie clear header
      const clearCookie = logoutRes.headers["set-cookie"];
      expect(clearCookie).toBeDefined();
      expect(String(clearCookie)).toContain(`${SESSION_COOKIE_NAME}=;`);

      // Verify session was deleted from DB
      const tokenHash = hashSessionToken(rawToken!);
      const [dbSession] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      expect(dbSession).toBeUndefined();

      // 3. Attempt reuse of old session token → MUST BE 401
      const meAfter = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: String(cookie) },
      });
      expect(meAfter.statusCode).toBe(401);
    });
  });

  describe("Phase 12 & 13: Protected Routes (Tasks & Projects)", () => {
    it("18. GET /api/tasks without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/tasks",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("19. POST /api/tasks without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          title: "Unauthorized task",
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("20. GET /api/projects without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("21. POST /api/projects without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "Unauthorized project",
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });
  });

  describe("Phase 8 & Dev Bypass Hardening", () => {
    it("22. x-dev-user-id in production mode without session → 401 UNAUTHENTICATED", async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";

        const res = await app.inject({
          method: "GET",
          url: "/api/tasks",
          headers: {
            "x-dev-user-id": userAId,
          },
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe("UNAUTHENTICATED");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("23. x-dev-user-id cannot impersonate another user when authenticated", async () => {
      // Login as User B
      const loginB = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: userBEmail, password: plainPassword },
      });
      const cookieB = loginB.headers["set-cookie"];

      // User B attempts to impersonate User A by passing x-dev-user-id: userAId
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: String(cookieB),
          "x-dev-user-id": userAId,
        },
      });

      expect(res.statusCode).toBe(200);
      // Identity MUST remain User B!
      expect(res.json().user.id).toBe(userBId);
      expect(res.json().user.id).not.toBe(userAId);
    });

    it("24 & 25. no-auth request never falls back to Alex Mercer or first DB user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/tasks",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
      expect(res.json().tasks).toBeUndefined();
    });
  });

  describe("Phase 19: Multi-User Real-Session Authorization & IDOR", () => {
    it("User A and User B operate with full data isolation via real session cookies", async () => {
      // 1. Login User A
      const loginA = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: userAEmail, password: plainPassword },
      });
      const cookieA = String(loginA.headers["set-cookie"]);

      // 2. Login User B
      const loginB = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: userBEmail, password: plainPassword },
      });
      const cookieB = String(loginB.headers["set-cookie"]);

      // 3. User A creates Task A and Project A
      const createProjectARes = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie: cookieA },
        payload: { name: "Project Alpha" },
      });
      expect(createProjectARes.statusCode).toBe(201);
      const projectA = createProjectARes.json().project;

      const createTaskARes = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { cookie: cookieA },
        payload: { title: "Task Alpha", projectId: projectA.id },
      });
      expect(createTaskARes.statusCode).toBe(201);
      const taskA = createTaskARes.json().task;

      // 4. User B creates Task B and Project B
      const createProjectBRes = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie: cookieB },
        payload: { name: "Project Beta" },
      });
      expect(createProjectBRes.statusCode).toBe(201);
      const projectB = createProjectBRes.json().project;

      const createTaskBRes = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { cookie: cookieB },
        payload: { title: "Task Beta", projectId: projectB.id },
      });
      expect(createTaskBRes.statusCode).toBe(201);
      const taskB = createTaskBRes.json().task;

      // 5. User A cannot see User B's project or task in list
      const listProjectsA = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { cookie: cookieA },
      });
      const projectIdsA = listProjectsA.json().projects.map((p: any) => p.id);
      expect(projectIdsA).toContain(projectA.id);
      expect(projectIdsA).not.toContain(projectB.id);

      const listTasksA = await app.inject({
        method: "GET",
        url: "/api/tasks",
        headers: { cookie: cookieA },
      });
      const taskIdsA = listTasksA.json().tasks.map((t: any) => t.id);
      expect(taskIdsA).toContain(taskA.id);
      expect(taskIdsA).not.toContain(taskB.id);

      // 6. User B cannot read User A's task or project directly by ID (IDOR) → 404
      const getTaskAAsB = await app.inject({
        method: "GET",
        url: `/api/tasks/${taskA.id}`,
        headers: { cookie: cookieB },
      });
      expect(getTaskAAsB.statusCode).toBe(404);

      const getProjectAAsB = await app.inject({
        method: "GET",
        url: `/api/projects/${projectA.id}`,
        headers: { cookie: cookieB },
      });
      expect(getProjectAAsB.statusCode).toBe(404);

      // 7. User B cannot update User A's task or project → 404
      const patchTaskAAsB = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${taskA.id}`,
        headers: { cookie: cookieB },
        payload: { title: "Hacked Title" },
      });
      expect(patchTaskAAsB.statusCode).toBe(404);

      const patchProjectAAsB = await app.inject({
        method: "PATCH",
        url: `/api/projects/${projectA.id}`,
        headers: { cookie: cookieB },
        payload: { name: "Hacked Project" },
      });
      expect(patchProjectAAsB.statusCode).toBe(404);

      // 8. User B cannot delete User A's task or project → 404
      const deleteTaskAAsB = await app.inject({
        method: "DELETE",
        url: `/api/tasks/${taskA.id}`,
        headers: { cookie: cookieB },
      });
      expect(deleteTaskAAsB.statusCode).toBe(404);

      const deleteProjectAAsB = await app.inject({
        method: "DELETE",
        url: `/api/projects/${projectA.id}`,
        headers: { cookie: cookieB },
      });
      expect(deleteProjectAAsB.statusCode).toBe(404);

      // 9. Clean up User A and B tasks/projects via their own authorized sessions
      const cleanTaskA = await app.inject({
        method: "DELETE",
        url: `/api/tasks/${taskA.id}`,
        headers: { cookie: cookieA },
      });
      expect(cleanTaskA.statusCode).toBe(200);

      const cleanProjectA = await app.inject({
        method: "DELETE",
        url: `/api/projects/${projectA.id}`,
        headers: { cookie: cookieA },
      });
      expect(cleanProjectA.statusCode).toBe(200);

      const cleanTaskB = await app.inject({
        method: "DELETE",
        url: `/api/tasks/${taskB.id}`,
        headers: { cookie: cookieB },
      });
      expect(cleanTaskB.statusCode).toBe(200);

      const cleanProjectB = await app.inject({
        method: "DELETE",
        url: `/api/projects/${projectB.id}`,
        headers: { cookie: cookieB },
      });
      expect(cleanProjectB.statusCode).toBe(200);
    });
  });
});
