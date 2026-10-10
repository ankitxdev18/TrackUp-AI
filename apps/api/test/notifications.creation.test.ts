import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createSession, SESSION_COOKIE_NAME } from "../src/auth/session.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import {
  goals,
  habitCompletions,
  habits,
  notifications,
  tasks,
  users,
} from "../src/db/schema.js";
import { triageOverdueTasks } from "../src/notifications/notification.service.js";

describe("Notification Domain Creation Rules & Triage Engine (Phase 2.6)", () => {
  let app: FastifyInstance;

  const TEST_DOMAIN = "notifications_creation_test.trackup.local";
  const userAEmail = `notif_create_usera_${Date.now()}@${TEST_DOMAIN}`;
  const userBEmail = `notif_create_userb_${Date.now()}@${TEST_DOMAIN}`;
  const trustedOrigin = "http://localhost:5173";

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

    const passwordHash = await hashPassword("TestPassword123!");

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Creator",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Creator",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

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

  // ========================================================
  // 1. Goal Completed Event Creation Rules
  // ========================================================
  describe("1. Goal Completed Notifications", () => {
    let goalId: string;

    beforeAll(async () => {
      const [goal] = await db
        .insert(goals)
        .values({
          userId: userAId,
          title: "Launch Phase 2 Product",
          progress: 50,
          status: "ACTIVE",
        })
        .returning();
      goalId = goal.id;
    });

    it("1.1 does NOT create notification when goal progress is under 100", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/goals/${goalId}`,
        headers: { cookie: userACookie, origin: trustedOrigin },
        payload: { progress: 80 },
      });
      expect(res.statusCode).toBe(200);

      const notifs = await db
        .select()
        .from(notifications)
        .where(sql`user_id = ${userAId} AND type = 'GOAL_COMPLETED'`);
      expect(notifs.length).toBe(0);
    });

    it("1.2 creates GOAL_COMPLETED notification when progress reaches 100", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/goals/${goalId}`,
        headers: { cookie: userACookie, origin: trustedOrigin },
        payload: { progress: 100 },
      });
      expect(res.statusCode).toBe(200);

      const notifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'GOAL_COMPLETED' AND resource_id = ${goalId}`
        );
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toBe("Goal Achieved: Launch Phase 2 Product");
      expect(notifs[0].resourceType).toBe("goal");
      expect(notifs[0].dedupeKey).toBe(`goal_completed:${goalId}`);
      expect(notifs[0].isRead).toBe(false);
    });

    it("1.3 deduplication prevents creating duplicate notification on subsequent status/progress update", async () => {
      // Update goal status to COMPLETED
      const res = await app.inject({
        method: "PATCH",
        url: `/api/goals/${goalId}`,
        headers: { cookie: userACookie, origin: trustedOrigin },
        payload: { status: "COMPLETED" },
      });
      expect(res.statusCode).toBe(200);

      // Verify still exactly 1 notification exists
      const notifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'GOAL_COMPLETED' AND resource_id = ${goalId}`
        );
      expect(notifs.length).toBe(1);
    });
  });

  // ========================================================
  // 2. Habit Streak Milestone Creation Rules
  // ========================================================
  describe("2. Habit Streak Milestone Notifications", () => {
    let habitId: string;

    beforeAll(async () => {
      // Create habit created 10 days ago
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Daily Morning Meditation",
          frequency: "DAILY",
          status: "ACTIVE",
          createdAt: tenDaysAgo,
        })
        .returning();
      habitId = habit.id;

      // Seed 6 consecutive completions: today - 6 through today - 1
      const today = new Date();
      for (let i = 6; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        await db.insert(habitCompletions).values({
          habitId,
          completedDate: dateStr,
        });
      }
    });

    it("2.1 generates HABIT_STREAK_MILESTONE notification when reaching 7-day streak", async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      // Complete 7th consecutive day (today)
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { cookie: userACookie, origin: trustedOrigin },
        payload: { date: todayStr },
      });
      expect(res.statusCode).toBe(201);

      // Verify notification was created
      const notifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'HABIT_STREAK_MILESTONE' AND resource_id = ${habitId}`
        );
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toBe("7-Day Streak: Daily Morning Meditation");
      expect(notifs[0].dedupeKey).toBe(`habit_streak:${habitId}:7`);
      expect(notifs[0].resourceType).toBe("habit");
    });

    it("2.2 repeated completion request does not generate duplicate notification", async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      // Repeated completion request on the same day
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { cookie: userACookie, origin: trustedOrigin },
        payload: { date: todayStr },
      });
      expect(res.statusCode).toBe(200); // 200 OK for already-completed

      const notifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'HABIT_STREAK_MILESTONE' AND resource_id = ${habitId}`
        );
      expect(notifs.length).toBe(1);
    });
  });

  // ========================================================
  // 3. Overdue Task Triage Engine
  // ========================================================
  describe("3. Overdue Task Triage Engine", () => {
    let overdueTaskId: string;
    let futureTaskId: string;
    let completedTaskId: string;

    beforeAll(async () => {
      const pastDate = "2026-10-01";
      const futureDate = "2099-12-31";

      // 1. Incomplete task with past due date -> MUST be triaged
      const [t1] = await db
        .insert(tasks)
        .values({
          userId: userAId,
          title: "File Q3 Tax Returns",
          status: "TODO",
          dueDate: pastDate,
        })
        .returning();
      overdueTaskId = t1.id;

      // 2. Incomplete task with future due date -> must NOT be triaged
      const [t2] = await db
        .insert(tasks)
        .values({
          userId: userAId,
          title: "File Q4 Tax Returns",
          status: "TODO",
          dueDate: futureDate,
        })
        .returning();
      futureTaskId = t2.id;

      // 3. Completed task with past due date -> must NOT be triaged
      const [t3] = await db
        .insert(tasks)
        .values({
          userId: userAId,
          title: "Old Completed Task",
          status: "COMPLETED",
          dueDate: pastDate,
        })
        .returning();
      completedTaskId = t3.id;
    });

    it("3.1 triages only incomplete past-due tasks", async () => {
      const createdCount = await triageOverdueTasks(userAId, "2026-10-11");
      expect(createdCount).toBeGreaterThanOrEqual(1);

      // Verify overdue task has notification
      const overdueNotifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'TASK_OVERDUE' AND resource_id = ${overdueTaskId}`
        );
      expect(overdueNotifs.length).toBe(1);
      expect(overdueNotifs[0].title).toBe("Task Overdue: File Q3 Tax Returns");
      expect(overdueNotifs[0].dedupeKey).toBe(
        `task_overdue:${overdueTaskId}:2026-10-01`
      );

      // Verify future task does NOT have notification
      const futureNotifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'TASK_OVERDUE' AND resource_id = ${futureTaskId}`
        );
      expect(futureNotifs.length).toBe(0);

      // Verify completed task does NOT have notification
      const completedNotifs = await db
        .select()
        .from(notifications)
        .where(
          sql`user_id = ${userAId} AND type = 'TASK_OVERDUE' AND resource_id = ${completedTaskId}`
        );
      expect(completedNotifs.length).toBe(0);
    });

    it("3.2 running triage again is idempotent (createdCount is 0)", async () => {
      const createdCountSecond = await triageOverdueTasks(userAId, "2026-10-11");
      expect(createdCountSecond).toBe(0);
    });

    it("3.3 POST /api/notifications/triage endpoint triggers triage over HTTP", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/triage",
        headers: { cookie: userACookie, origin: trustedOrigin },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(typeof body.createdCount).toBe("number");
    });

    it("3.4 GET /api/notifications automatically runs triage before returning feed", async () => {
      // Create another overdue task
      const [anotherOverdue] = await db
        .insert(tasks)
        .values({
          userId: userBId,
          title: "Bob Urgent Action Item",
          status: "TODO",
          dueDate: "2026-10-05",
        })
        .returning();

      // Bob fetches notifications; should trigger triage and immediately return the new notification
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: userBCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const notifTitles = body.notifications.map((n: any) => n.title);
      expect(notifTitles).toContain("Task Overdue: Bob Urgent Action Item");
    });
  });
});
