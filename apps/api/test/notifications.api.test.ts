import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createSession, SESSION_COOKIE_NAME } from "../src/auth/session.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import {
  createNotification,
  getUnreadNotificationCount,
} from "../src/notifications/notification.service.js";

describe("Notifications API & Multi-Tenant State Management (Phase 2.5)", () => {
  let app: FastifyInstance;

  const TEST_DOMAIN = "notifications_api_test.trackup.local";
  const userAEmail = `notif_api_usera_${Date.now()}@${TEST_DOMAIN}`;
  const userBEmail = `notif_api_userb_${Date.now()}@${TEST_DOMAIN}`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

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
        name: "Alice Notif",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Notif",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

    // Issue authentic sessions directly for User A and User B
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
  // 1. Authentication Guards
  // ==========================================
  describe("1. Authentication Guards", () => {
    it("1.1 rejects GET /api/notifications without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("1.2 rejects GET /api/notifications/unread-count without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("1.3 rejects PATCH /api/notifications/:id/read without authentication", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${crypto.randomUUID()}/read`,
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("1.4 rejects POST /api/notifications/mark-all-read without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/mark-all-read",
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("UNAUTHENTICATED");
    });
  });

  // ==========================================
  // 2. Listing & Query Validation
  // ==========================================
  describe("2. Listing & Filtering", () => {
    beforeAll(async () => {
      // Seed notifications for User A
      await createNotification(userAId, {
        type: "GOAL_COMPLETED",
        title: "Alice Goal 1",
        body: "First completed goal.",
        dedupeKey: `alice_goal_1:${crypto.randomUUID()}`,
      });
      await createNotification(userAId, {
        type: "TASK_OVERDUE",
        title: "Alice Overdue Task",
        body: "Due yesterday.",
        dedupeKey: `alice_task_1:${crypto.randomUUID()}`,
      });

      // Seed notification for User B
      await createNotification(userBId, {
        type: "HABIT_STREAK_MILESTONE",
        title: "Bob Habit Streak",
        body: "7-day streak.",
        dedupeKey: `bob_habit_1:${crypto.randomUUID()}`,
      });
    });

    it("2.1 lists authenticated user's notifications", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notifications).toBeInstanceOf(Array);
      expect(body.notifications.length).toBeGreaterThanOrEqual(2);
      expect(body.total).toBe(body.notifications.length);

      // Verify shape
      const first = body.notifications[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("type");
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("isRead");
      expect(first).toHaveProperty("createdAt");
    });

    it("2.2 enforces tenant isolation in listing (User A cannot see User B's notifications)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const titles = body.notifications.map((n: any) => n.title);
      expect(titles).not.toContain("Bob Habit Streak");
    });

    it("2.3 rejects invalid query limit (validation error)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications?limit=100",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("2.4 respects valid query limit parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications?limit=1",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notifications.length).toBe(1);
    });
  });

  // ==========================================
  // 3. Unread Count Management
  // ==========================================
  describe("3. Unread Count", () => {
    it("3.1 returns exact unread count for authenticated user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.count).toBe("number");
      expect(body.count).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================
  // 4. Mark As Read Mutations & IDOR Protection
  // ==========================================
  describe("4. Read State Transitions & Security", () => {
    const trustedOrigin = "http://localhost:5173";
    let aliceNotifId: string;

    beforeAll(async () => {
      const notif = await createNotification(userAId, {
        type: "GOAL_COMPLETED",
        title: "Target for Read Test",
        dedupeKey: `alice_read_test:${crypto.randomUUID()}`,
      });
      aliceNotifId = notif!.id;
    });

    it("4.1 rejects invalid UUID parameter format with 400", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/invalid-uuid-123/read",
        headers: { cookie: userACookie, origin: trustedOrigin },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("INVALID_ID");
    });

    it("4.2 returns 404 for non-existent notification ID", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${crypto.randomUUID()}/read`,
        headers: { cookie: userACookie, origin: trustedOrigin },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("4.3 returns 404 when User B attempts to mark User A's notification as read (IDOR protection)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${aliceNotifId}/read`,
        headers: { cookie: userBCookie, origin: trustedOrigin },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("4.4 allows owner User A to mark notification as read and decrements count", async () => {
      // Get count before
      const countBeforeRes = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: userACookie },
      });
      const countBefore = JSON.parse(countBeforeRes.body).count;

      // Mark as read
      const markRes = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${aliceNotifId}/read`,
        headers: { cookie: userACookie, origin: trustedOrigin },
      });
      expect(markRes.statusCode).toBe(200);
      const markBody = JSON.parse(markRes.body);
      expect(markBody.notification.id).toBe(aliceNotifId);
      expect(markBody.notification.isRead).toBe(true);
      expect(markBody.notification.readAt).not.toBeNull();

      // Get count after
      const countAfterRes = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: userACookie },
      });
      const countAfter = JSON.parse(countAfterRes.body).count;
      expect(countAfter).toBe(countBefore - 1);
    });

    it("4.5 is idempotent when repeated on already-read notification", async () => {
      const markRes = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${aliceNotifId}/read`,
        headers: { cookie: userACookie, origin: trustedOrigin },
      });
      expect(markRes.statusCode).toBe(200);
      const markBody = JSON.parse(markRes.body);
      expect(markBody.notification.isRead).toBe(true);
    });
  });

  // ==========================================
  // 5. Bulk Mark All Read
  // ==========================================
  describe("5. Bulk Mark All Read", () => {
    const trustedOrigin = "http://localhost:5173";

    it("5.1 marks all unread notifications as read for current user", async () => {
      // Ensure User A has unread notifications
      await createNotification(userAId, {
        type: "TASK_OVERDUE",
        title: "Bulk Alice Task 1",
        dedupeKey: `bulk_alice_1:${crypto.randomUUID()}`,
      });
      await createNotification(userAId, {
        type: "TASK_OVERDUE",
        title: "Bulk Alice Task 2",
        dedupeKey: `bulk_alice_2:${crypto.randomUUID()}`,
      });

      const countBefore = await getUnreadNotificationCount(userAId);
      expect(countBefore).toBeGreaterThanOrEqual(2);

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/mark-all-read",
        headers: { cookie: userACookie, origin: trustedOrigin },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.markedCount).toBe(countBefore);

      // Verify unread count is now 0 for User A
      const countAfterRes = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: userACookie },
      });
      expect(JSON.parse(countAfterRes.body).count).toBe(0);
    });

    it("5.2 bulk mark all read does not affect User B's unread items", async () => {
      // User B should still have their unread notification
      const countBRes = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: userBCookie },
      });
      expect(JSON.parse(countBRes.body).count).toBeGreaterThanOrEqual(1);
    });
  });
});
