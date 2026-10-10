import { and, eq, sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createSession, SESSION_COOKIE_NAME } from "../src/auth/session.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { notifications, users } from "../src/db/schema.js";
import {
  createNotification,
  getUnreadNotificationCount,
} from "../src/notifications/notification.service.js";

describe("Notifications Security, Tenant Isolation & Reliability Hardening (Phase 2.9)", () => {
  let app: FastifyInstance;

  const TEST_DOMAIN = "notifications_security_test.trackup.local";
  const userAEmail = `notif_sec_usera_${Date.now()}@${TEST_DOMAIN}`;
  const userBEmail = `notif_sec_userb_${Date.now()}@${TEST_DOMAIN}`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  const TRUSTED_ORIGIN = "http://localhost:5173";
  const MALICIOUS_ORIGIN = "https://malicious-attacker-website.com";

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Security Alice",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Security Bob",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

    // Issue authentic sessions
    const sessionA = await createSession(userAId);
    userACookie = `${SESSION_COOKIE_NAME}=${sessionA.rawToken}`;

    const sessionB = await createSession(userBId);
    userBCookie = `${SESSION_COOKIE_NAME}=${sessionB.rawToken}`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. Multi-Tenant Authorization Boundaries
  // ==========================================
  describe("1. Multi-Tenant Authorization Boundaries", () => {
    it("1.1 ensures User B cannot view User A's notifications", async () => {
      // Create a private notification for User A
      const notifA = await createNotification(userAId, {
        type: "GOAL_COMPLETED",
        title: "Alice Confidential Milestone",
        body: "Confidential payload for User A",
        dedupeKey: `sec_test_goal_${Date.now()}`,
      });
      expect(notifA).toBeDefined();

      // User B requests their notifications
      const resB = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: userBCookie },
      });
      expect(resB.statusCode).toBe(200);
      const dataB = JSON.parse(resB.body);

      // Verify none of User A's notifications appear for User B
      const containsAlice = dataB.notifications.some(
        (n: { id: string }) => n.id === notifA!.id
      );
      expect(containsAlice).toBe(false);
    });

    it("1.2 prevents User B from reading User A's unread badge count", async () => {
      // User A has at least 1 unread notification
      const countA = await getUnreadNotificationCount(userAId);
      expect(countA).toBeGreaterThan(0);

      // User B's unread count should strictly be 0
      const resB = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: userBCookie },
      });
      expect(resB.statusCode).toBe(200);
      const dataB = JSON.parse(resB.body);
      expect(dataB.count).toBe(0);
    });

    it("1.3 prevents User B from marking User A's notification as read (Cross-Tenant Modification Attack)", async () => {
      // User A creates an unread notification
      const notifA = await createNotification(userAId, {
        type: "TASK_OVERDUE",
        title: "Alice Private Task Overdue",
        body: "Review before tomorrow",
        dedupeKey: `sec_test_task_${Date.now()}`,
      });
      expect(notifA).toBeDefined();

      // User B attempts to mark User A's notification ID as read
      const attackRes = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${notifA!.id}/read`,
        headers: {
          cookie: userBCookie,
          origin: TRUSTED_ORIGIN,
        },
      });

      // Must return 404 Not Found to prevent ID confirmation or unauthorized modification
      expect(attackRes.statusCode).toBe(404);
      const attackBody = JSON.parse(attackRes.body);
      expect(attackBody.code).toBe("NOT_FOUND");

      // Verify in DB that User A's notification remains unread
      const [persistedA] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notifA!.id));
      expect(persistedA.isRead).toBe(false);
      expect(persistedA.readAt).toBeNull();
    });

    it("1.4 ensures bulk mark-all-read is strictly tenant-scoped", async () => {
      // User A has unread notifications
      const beforeCountA = await getUnreadNotificationCount(userAId);
      expect(beforeCountA).toBeGreaterThan(0);

      // User B triggers bulk mark-all-read
      const resB = await app.inject({
        method: "POST",
        url: "/api/notifications/mark-all-read",
        headers: {
          cookie: userBCookie,
          origin: TRUSTED_ORIGIN,
        },
      });
      expect(resB.statusCode).toBe(200);
      const dataB = JSON.parse(resB.body);
      expect(dataB.markedCount).toBe(0);

      // Verify User A's unread count is unchanged
      const afterCountA = await getUnreadNotificationCount(userAId);
      expect(afterCountA).toBe(beforeCountA);
    });
  });

  // ==========================================
  // 2. CSRF & Cross-Site Origin Protection
  // ==========================================
  describe("2. CSRF & Cross-Site Origin Protection", () => {
    it("2.1 blocks PATCH /api/notifications/:id/read from untrusted origin", async () => {
      const notifA = await createNotification(userAId, {
        type: "GOAL_COMPLETED",
        title: "Alice CSRF Target",
        dedupeKey: `csrf_test_${Date.now()}`,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${notifA!.id}/read`,
        headers: {
          cookie: userACookie,
          origin: MALICIOUS_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("2.2 blocks POST /api/notifications/mark-all-read without origin or referer header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/mark-all-read",
        headers: {
          cookie: userACookie,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("2.3 allows state mutations with legitimate origin header", async () => {
      const notifA = await createNotification(userAId, {
        type: "GOAL_COMPLETED",
        title: "Alice Legitimate State Mutation",
        dedupeKey: `legit_csrf_${Date.now()}`,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${notifA!.id}/read`,
        headers: {
          cookie: userACookie,
          origin: TRUSTED_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notification.isRead).toBe(true);
    });
  });

  // ==========================================
  // 3. Authentication & Session Tampering Guards
  // ==========================================
  describe("3. Authentication & Session Tampering Guards", () => {
    it("3.1 rejects requests with forged session cookie tokens", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=forged_session_token_123456`,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("3.2 rejects requests with malformed cookie format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: {
          cookie: "garbage-cookie-value",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==========================================
  // 4. Query Bounds & Malicious Input Hardening
  // ==========================================
  describe("4. Query Bounds & Malicious Input Hardening", () => {
    it("4.1 rejects limit > 50 to prevent query amplification DoS", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications?limit=5000",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("4.2 rejects negative or zero limit", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications?limit=-10",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
    });

    it("4.3 rejects invalid unreadOnly values (injection resistance)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications?unreadOnly=not_a_boolean",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("4.4 rejects invalid UUID in route parameters", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/';--drop table/read",
        headers: {
          cookie: userACookie,
          origin: TRUSTED_ORIGIN,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("INVALID_ID");
    });
  });

  // ==========================================
  // 5. Concurrency & Deduplication Integrity
  // ==========================================
  describe("5. Concurrency & Deduplication Integrity", () => {
    it("5.1 handles 15 concurrent identical creations with zero duplicate key exceptions", async () => {
      const sharedDedupeKey = `race_condition_dedupe_${Date.now()}`;

      // Launch 15 concurrent creations simultaneously
      const results = await Promise.all(
        Array.from({ length: 15 }).map(() =>
          createNotification(userAId, {
            type: "HABIT_STREAK_MILESTONE",
            title: "Simultaneous Streak Event",
            body: "Testing atomic upsert / ON CONFLICT DO NOTHING",
            dedupeKey: sharedDedupeKey,
          })
        )
      );

      // Exactly 1 insert should have returned a newly inserted record
      const createdCount = results.filter((r) => r !== null).length;
      expect(createdCount).toBe(1);

      // Check the database table directly: exactly 1 record exists with this dedupeKey
      const records = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userAId),
            eq(notifications.dedupeKey, sharedDedupeKey)
          )
        );
      expect(records).toHaveLength(1);
    });

    it("5.2 defensively truncates long titles and bodies without throwing PostgreSQL string length exceptions", async () => {
      const excessiveTitle = "A".repeat(350); // exceeds varchar(255)
      const excessiveBody = "B".repeat(2000); // exceeds varchar(1000)
      const dedupeKey = `oversized_${Date.now()}`;

      // createNotification should not crash; it truncates safely
      const created = await createNotification(userAId, {
        type: "GOAL_COMPLETED",
        title: excessiveTitle,
        body: excessiveBody,
        dedupeKey,
      });

      expect(created).toBeDefined();
      expect(created!.title.length).toBe(255);
      expect(created!.body!.length).toBe(1000);
    });
  });
});
