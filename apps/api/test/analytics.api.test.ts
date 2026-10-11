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
  journalEntries,
  projects,
  tasks,
  users,
} from "../src/db/schema.js";

describe("Analytics API Endpoint Integration & Security (Phase 3.6)", () => {
  let app: FastifyInstance;

  const TEST_DOMAIN = "analytics_api_integration.trackup.local";
  const userAEmail = `analytics_api_a_${Date.now()}@${TEST_DOMAIN}`;
  const userBEmail = `analytics_api_b_${Date.now()}@${TEST_DOMAIN}`;
  const userCEmail = `analytics_api_c_${Date.now()}@${TEST_DOMAIN}`; // Clean empty user

  let userAId: string;
  let userBId: string;
  let userCId: string;

  let userACookie: string;
  let userBCookie: string;
  let userCCookie: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword("SecurePass123!");

    // 1. User A (Active user with comprehensive records)
    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Analytics API",
        passwordHash,
        timezone: "America/New_York",
      })
      .returning();
    userAId = userA.id;
    const sessionA = await createSession(userAId);
    userACookie = `${SESSION_COOKIE_NAME}=${sessionA.rawToken}`;

    // 2. User B (Secondary user for isolation check)
    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Analytics API",
        passwordHash,
        timezone: "America/New_York",
      })
      .returning();
    userBId = userB.id;
    const sessionB = await createSession(userBId);
    userBCookie = `${SESSION_COOKIE_NAME}=${sessionB.rawToken}`;

    // 3. User C (Brand new user with zero records)
    const [userC] = await db
      .insert(users)
      .values({
        email: userCEmail,
        name: "Charlie Empty",
        passwordHash,
        timezone: "UTC",
      })
      .returning();
    userCId = userC.id;
    const sessionC = await createSession(userCId);
    userCCookie = `${SESSION_COOKIE_NAME}=${sessionC.rawToken}`;

    // Seed User A Data
    const [projA] = await db
      .insert(projects)
      .values({ userId: userAId, name: "Core Platform", status: "ACTIVE" })
      .returning();

    await db.insert(tasks).values([
      {
        userId: userAId,
        projectId: projA.id,
        title: "Platform Task 1",
        status: "COMPLETED",
        priority: "HIGH",
        dueDate: "2026-10-10",
        completedAt: new Date(),
      },
      {
        userId: userAId,
        projectId: projA.id,
        title: "Platform Task 2",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: "2026-10-01", // Past due -> overdue
      },
    ]);

    const [habitA] = await db
      .insert(habits)
      .values({ userId: userAId, title: "Deep Work", status: "ACTIVE" })
      .returning();

    await db.insert(habitCompletions).values({
      habitId: habitA.id,
      completedDate: "2026-10-10",
    });

    await db.insert(goals).values({
      userId: userAId,
      title: "Reach Milestones",
      status: "ACTIVE",
      progress: 60,
    });

    await db.insert(journalEntries).values({
      userId: userAId,
      entryDate: "2026-10-10",
      title: "Daily Reflections",
      content: "Sensitive internal user thought.",
    });

    // Seed User B Data
    await db.insert(tasks).values({
      userId: userBId,
      title: "User B Private Task",
      status: "COMPLETED",
      priority: "LOW",
      completedAt: new Date(),
    });
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  // ========================================================
  // 1. AUTHENTICATION & ACCESS CONTROL
  // ========================================================
  describe("Authentication & Authorization", () => {
    it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("rejects unauthenticated requests on root alias /api/analytics with 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ========================================================
  // 2. QUERY PARAMETER VALIDATION
  // ========================================================
  describe("Query Parameter Validation", () => {
    it("rejects unsupported period values with 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview?period=yearly",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details[0].field).toBe("period");
    });

    it("rejects unknown query parameters with 400 strict error", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview?period=7d&unauthorizedParam=test",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  // ========================================================
  // 3. PERIOD EXECUTION & DATA CONTRACT CONFORMANCE
  // ========================================================
  describe("Period Handling & Response Contract", () => {
    it("defaults to 7d when no period is passed and returns 200 OK", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);

      expect(body.period.code).toBe("7d");
      expect(body.period.daysCount).toBe(7);
      expect(body.period.timeZone).toBe("America/New_York");

      // Verify structure conformance
      expect(body.summary).toBeDefined();
      expect(body.summary.tasksCompleted).toBeDefined();
      expect(body.summary.taskCompletionRate).toBeDefined();
      expect(body.summary.habitConsistency).toBeDefined();
      expect(body.summary.activeGoals).toBeDefined();
      expect(body.summary.journalReflections).toBeDefined();
      expect(body.tasks.byPriority).toBeDefined();
      expect(body.habits.dailyGrid.length).toBe(7);
    });

    it("accepts 30d period and returns 30 days grid", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview?period=30d",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.period.code).toBe("30d");
      expect(body.period.daysCount).toBe(30);
      expect(body.habits.dailyGrid.length).toBe(30);
    });

    it("accepts month period and returns month-to-date data", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview?period=month",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.period.code).toBe("month");
      expect(body.period.daysCount).toBeGreaterThan(0);
    });

    it("serves identical data via the root alias /api/analytics", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics?period=7d",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.period.code).toBe("7d");
    });
  });

  // ========================================================
  // 4. TENANT ISOLATION & PRIVACY
  // ========================================================
  describe("Tenant Isolation & Data Privacy", () => {
    it("ensures User A cannot see User B's metrics", async () => {
      const resA = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userACookie },
      });
      const resB = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userBCookie },
      });

      const bodyA = JSON.parse(resA.payload);
      const bodyB = JSON.parse(resB.payload);

      // User A has 1 project, User B has 0
      expect(bodyA.projects.length).toBe(1);
      expect(bodyB.projects.length).toBe(0);

      // User A has 1 habit, User B has 0
      expect(bodyA.habits.habitsList.length).toBe(1);
      expect(bodyB.habits.habitsList.length).toBe(0);

      // User B only has 1 completed task
      expect(bodyB.summary.tasksCompleted.current).toBe(1);
    });

    it("handles zero-record user gracefully without errors", async () => {
      const resC = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userCCookie },
      });

      expect(resC.statusCode).toBe(200);
      const bodyC = JSON.parse(resC.payload);

      expect(bodyC.summary.tasksCompleted.current).toBe(0);
      expect(bodyC.summary.tasksCompleted.prior).toBe(0);
      expect(bodyC.summary.tasksCompleted.deltaPercent).toBe(null);
      expect(bodyC.summary.taskCompletionRate.rate).toBe(null);
      expect(bodyC.summary.habitConsistency.rate).toBe(null);
      expect(bodyC.summary.activeGoals.activeCount).toBe(0);
      expect(bodyC.summary.journalReflections.daysJournaled).toBe(0);
      expect(bodyC.tasks.currentOverdueCount).toBe(0);
      expect(bodyC.goals.length).toBe(0);
      expect(bodyC.projects.length).toBe(0);
    });

    it("strictly omits sensitive journal body text from responses", async () => {
      const resA = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userACookie },
      });

      expect(resA.statusCode).toBe(200);
      expect(resA.payload).not.toContain("Sensitive internal user thought");
    });
  });

  // ========================================================
  // 5. IDEMPOTENCE & NON-MUTATION
  // ========================================================
  describe("Idempotence & Non-Mutation", () => {
    it("confirms repeated queries never mutate underlying database state", async () => {
      // Query 3 times consecutively
      await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userACookie },
      });
      await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userACookie },
      });
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/overview",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.summary.tasksCompleted.current).toBe(1);
    });
  });
});
