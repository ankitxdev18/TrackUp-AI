import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { habitCompletions, habits, users } from "../src/db/schema.js";
import { createSession } from "../src/auth/session.js";
import { addCalendarDays, formatCalendarDateInTimeZone, getUserLocalToday } from "../src/habits/habit.date.js";

describe("Habit API & Domain Engine Test Suite (Milestone H03)", () => {
  const app = buildApp({ logger: false });
  const TEST_DOMAIN = "habits_api_h03.trackup.local";

  let userAId: string;
  let userACookie: string;
  let userBId: string;
  let userBCookie: string;

  let kolkataUserId: string;
  let kolkataUserCookie: string;
  let nyUserId: string;
  let nyUserCookie: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await app.ready();
    await cleanup();

    // 1. User A (UTC default)
    const [userA] = await db
      .insert(users)
      .values({
        email: `usera_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "User Alpha",
        timezone: "UTC",
      })
      .returning();
    userAId = userA.id;
    const sessionA = await createSession(userAId);
    userACookie = `trackup_session=${sessionA.rawToken}`;

    // 2. User B (UTC default) for IDOR isolation
    const [userB] = await db
      .insert(users)
      .values({
        email: `userb_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "User Beta",
        timezone: "UTC",
      })
      .returning();
    userBId = userB.id;
    const sessionB = await createSession(userBId);
    userBCookie = `trackup_session=${sessionB.rawToken}`;

    // 3. User Kolkata (Asia/Kolkata = UTC+5:30)
    const [userKolkata] = await db
      .insert(users)
      .values({
        email: `user_kolkata_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "User Kolkata",
        timezone: "Asia/Kolkata",
      })
      .returning();
    kolkataUserId = userKolkata.id;
    const sessionKolkata = await createSession(kolkataUserId);
    kolkataUserCookie = `trackup_session=${sessionKolkata.rawToken}`;

    // 4. User New York (America/New_York = UTC-4 / UTC-5)
    const [userNY] = await db
      .insert(users)
      .values({
        email: `user_ny_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "User New York",
        timezone: "America/New_York",
      })
      .returning();
    nyUserId = userNY.id;
    const sessionNY = await createSession(nyUserId);
    nyUserCookie = `trackup_session=${sessionNY.rawToken}`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await closeDatabasePool();
  });

  // ========================================================
  // A. AUTHENTICATION (ALL ENDPOINTS RETURN 401)
  // ========================================================
  describe("A. Authentication Guards", () => {
    it("A1. GET /api/habits without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({ method: "GET", url: "/api/habits" });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A2. GET /api/habits/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({ method: "GET", url: "/api/habits/00000000-0000-0000-0000-000000000000" });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A3. POST /api/habits without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        payload: { title: "Unauth Habit" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A4. PATCH /api/habits/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/habits/00000000-0000-0000-0000-000000000000",
        payload: { title: "New Title" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A5. DELETE /api/habits/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/habits/00000000-0000-0000-0000-000000000000",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A6. POST /api/habits/:id/completions without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits/00000000-0000-0000-0000-000000000000/completions",
        payload: { date: "2026-10-08" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A7. DELETE /api/habits/:id/completions/:date without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/habits/00000000-0000-0000-0000-000000000000/completions/2026-10-08",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("A8. GET /api/habits/:id/history without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits/00000000-0000-0000-0000-000000000000/history",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });
  });

  // ========================================================
  // B. CRUD & LIFECYCLE (CREATE, GET, UPDATE, ARCHIVE, RESTORE, DELETE)
  // ========================================================
  describe("B. Habit CRUD & Lifecycle", () => {
    let createdHabitId: string;

    it("B1. creates a valid habit with title and description (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Morning Meditation",
          description: "10 minutes of mindfulness",
          frequency: "DAILY",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.habit).toBeDefined();
      expect(body.habit.title).toBe("Morning Meditation");
      expect(body.habit.description).toBe("10 minutes of mindfulness");
      expect(body.habit.frequency).toBe("DAILY");
      expect(body.habit.status).toBe("ACTIVE");
      expect(body.habit.currentStreak).toBe(0);
      expect(body.habit.longestStreak).toBe(0);
      expect(body.habit.todayCompleted).toBe(false);
      createdHabitId = body.habit.id;
    });

    it("B2. retrieves the created habit by ID (200 OK)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${createdHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.habit.id).toBe(createdHabitId);
      expect(body.habit.title).toBe("Morning Meditation");
    });

    it("B3. lists active habits for the authenticated user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.habits)).toBe(true);
      const habit = body.habits.find((h: any) => h.id === createdHabitId);
      expect(habit).toBeDefined();
    });

    it("B4. updates title and description via PATCH (200 OK)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${createdHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Mindful Meditation & Breathing",
          description: "15 minutes deep breathing",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.habit.title).toBe("Mindful Meditation & Breathing");
      expect(body.habit.description).toBe("15 minutes deep breathing");
    });

    it("B5. archives habit via PATCH status ARCHIVED", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${createdHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { status: "ARCHIVED" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().habit.status).toBe("ARCHIVED");

      // Verify excluded from default ACTIVE list
      const resListActive = await app.inject({
        method: "GET",
        url: "/api/habits?status=ACTIVE",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      const activeIds = resListActive.json().habits.map((h: any) => h.id);
      expect(activeIds).not.toContain(createdHabitId);

      // Verify included in ARCHIVED list
      const resListArchived = await app.inject({
        method: "GET",
        url: "/api/habits?status=ARCHIVED",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      const archivedIds = resListArchived.json().habits.map((h: any) => h.id);
      expect(archivedIds).toContain(createdHabitId);
    });

    it("B6. restores habit via PATCH status ACTIVE", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${createdHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { status: "ACTIVE" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().habit.status).toBe("ACTIVE");
    });

    it("B7. permanently deletes habit (204 No Content)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${createdHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(204);

      // Subsequent GET returns 404
      const resGet = await app.inject({
        method: "GET",
        url: `/api/habits/${createdHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(resGet.statusCode).toBe(404);
    });
  });

  // ========================================================
  // C. VALIDATION
  // ========================================================
  describe("C. Strict Request Validation", () => {
    it("C1. rejects empty title on creation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "   " },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("C2. rejects title exceeding 255 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "a".repeat(256) },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("C3. rejects description exceeding 1000 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Valid Title", description: "b".repeat(1001) },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("C4. rejects client-supplied userId or status on creation (strict schema)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Spoofed Habit",
          userId: "00000000-0000-0000-0000-000000000000",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("C5. rejects malformed UUID parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits/invalid-uuid-format",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ID");
    });
  });

  // ========================================================
  // D. TENANT ISOLATION & IDOR DEFENSE
  // ========================================================
  describe("D. Tenant Isolation & IDOR Defense", () => {
    let habitAId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "User A Confidential Habit" },
      });
      habitAId = res.json().habit.id;
    });

    it("D1. User B cannot GET User A's habit (returns 404 NOT_FOUND)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userBCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("D2. User B cannot PATCH User A's habit (returns 404 NOT_FOUND)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userBCookie, origin: "http://localhost:5173" },
        payload: { title: "Hacked Title" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("D3. User B cannot DELETE User A's habit (returns 404 NOT_FOUND)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userBCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("D4. User B cannot complete User A's habit (returns 404 NOT_FOUND)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userBCookie, origin: "http://localhost:5173" },
        payload: { date: "2026-10-08" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("D5. User B cannot delete completion on User A's habit (returns 404 NOT_FOUND)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitAId}/completions/2026-10-08`,
        headers: { Cookie: userBCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("D6. User B cannot view history for User A's habit (returns 404 NOT_FOUND)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}/history`,
        headers: { Cookie: userBCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });
  });

  // ========================================================
  // E. COMPLETION, IDEMPOTENCY & DATE RULES
  // ========================================================
  describe("E. Completion & Date Invariants", () => {
    let habitId: string;
    const userToday = getUserLocalToday("UTC");

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Daily Exercise" },
      });
      habitId = res.json().habit.id;
    });

    it("E1. records completion for today (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { date: userToday },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.completion).toBeDefined();
      expect(body.completion.completedDate).toBe(userToday);
      expect(body.completion.habitId).toBe(habitId);
      expect(body.completion.completedAt).toBeDefined();
    });

    it("E2. duplicate completion for same date succeeds idempotently (200 OK)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { date: userToday },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.completion.completedDate).toBe(userToday);
      expect(body.completion.habitId).toBe(habitId);
    });

    it("E3. rejects future calendar dates with 400 CANNOT_COMPLETE_FUTURE_DATE", async () => {
      const tomorrow = addCalendarDays(userToday, 1);
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { date: tomorrow },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("CANNOT_COMPLETE_FUTURE_DATE");
    });

    it("E4. rejects dates before habit eligibility start date with 400 CANNOT_COMPLETE_BEFORE_HABIT_CREATION", async () => {
      const yesterday = addCalendarDays(userToday, -1);
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { date: yesterday },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("CANNOT_COMPLETE_BEFORE_HABIT_CREATION");
    });

    it("E5. rejects completion on archived habit with 400 HABIT_ARCHIVED", async () => {
      // Archive habit
      await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { status: "ARCHIVED" },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { date: userToday },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("HABIT_ARCHIVED");

      // Restore habit
      await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
        payload: { status: "ACTIVE" },
      });
    });

    it("E6. deletes completion idempotently (204 No Content)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitId}/completions/${userToday}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(204);

      // Verify row is deleted
      const rows = await db
        .select()
        .from(habitCompletions)
        .where(sql`habit_id = ${habitId} AND completed_date = ${userToday}`);
      expect(rows.length).toBe(0);

      // Repeated delete still succeeds idempotently with 204
      const resRepeated = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitId}/completions/${userToday}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(resRepeated.statusCode).toBe(204);
    });
  });

  // ========================================================
  // F. TIMEZONE & SERVER-SIDE LOCAL TODAY
  // ========================================================
  describe("F. Timezone & Server-Side Date Authority", () => {
    it("F1. evaluates local today in user's authoritative timezone (Asia/Kolkata vs UTC)", async () => {
      const kolkataToday = getUserLocalToday("Asia/Kolkata");
      const utcToday = getUserLocalToday("UTC");

      // Create habit for Kolkata user
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: kolkataUserCookie, origin: "http://localhost:5173" },
        payload: { title: "Kolkata Timezone Habit" },
      });
      const habitId = res.json().habit.id;

      // Completion on Kolkata today succeeds
      const resComp = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: kolkataUserCookie, origin: "http://localhost:5173" },
        payload: { date: kolkataToday },
      });
      expect([200, 201]).toContain(resComp.statusCode);

      // GET /api/habits evaluates todayCompleted based on user's timezone
      const resList = await app.inject({
        method: "GET",
        url: "/api/habits",
        headers: { Cookie: kolkataUserCookie, origin: "http://localhost:5173" },
      });
      const found = resList.json().habits.find((h: any) => h.id === habitId);
      expect(found.todayCompleted).toBe(true);
    });

    it("F2. evaluates America/New_York local today correctly", async () => {
      const nyToday = getUserLocalToday("America/New_York");

      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: nyUserCookie, origin: "http://localhost:5173" },
        payload: { title: "New York Timezone Habit" },
      });
      const habitId = res.json().habit.id;

      const resComp = await app.inject({
        method: "POST",
        url: `/api/habits/${habitId}/completions`,
        headers: { Cookie: nyUserCookie, origin: "http://localhost:5173" },
        payload: { date: nyToday },
      });
      expect([200, 201]).toContain(resComp.statusCode);
    });
  });

  // ========================================================
  // G. HABIT ELIGIBILITY START DATE
  // ========================================================
  describe("G. Eligibility Start Date", () => {
    it("G1. derives eligibility start date strictly from habit.createdAt in user's timezone", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: kolkataUserId,
          title: "Boundary Timezone Habit",
          createdAt: new Date("2026-10-08T20:00:00.000Z"), // 20:00 UTC = 01:30 Oct 9 in Kolkata
        })
        .returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habit.id}/history?days=7`,
        headers: { Cookie: kolkataUserCookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.eligibilityStartDate).toBe("2026-10-09");
    });
  });

  // ========================================================
  // H. CURRENT STREAK INVARIANTS
  // ========================================================
  describe("H. Current Streak Invariants", () => {
    let streakHabitId: string;
    const today = getUserLocalToday("UTC");
    const y1 = addCalendarDays(today, -1);
    const y2 = addCalendarDays(today, -2);
    const y3 = addCalendarDays(today, -3);

    beforeAll(async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Streak Habit",
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Created 30 days ago
        })
        .returning();
      streakHabitId = habit.id;
    });

    it("H1. 0 completions → currentStreak = 0", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${streakHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.json().habit.currentStreak).toBe(0);
    });

    it("H2. today only → currentStreak = 1", async () => {
      await db.insert(habitCompletions).values({ habitId: streakHabitId, completedDate: today });

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${streakHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.json().habit.currentStreak).toBe(1);
    });

    it("H3. yesterday only (today pending) → currentStreak = 1", async () => {
      // Remove today, add yesterday
      await db.delete(habitCompletions).where(sql`habit_id = ${streakHabitId}`);
      await db.insert(habitCompletions).values({ habitId: streakHabitId, completedDate: y1 });

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${streakHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.json().habit.currentStreak).toBe(1);
      expect(res.json().habit.todayCompleted).toBe(false);
    });

    it("H4. today + yesterday → currentStreak = 2", async () => {
      await db.insert(habitCompletions).values({ habitId: streakHabitId, completedDate: today });

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${streakHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.json().habit.currentStreak).toBe(2);
      expect(res.json().habit.todayCompleted).toBe(true);
    });

    it("H5. contiguous chain (today, yesterday, 2 days ago, 3 days ago) → currentStreak = 4", async () => {
      await db.insert(habitCompletions).values({ habitId: streakHabitId, completedDate: y2 });
      await db.insert(habitCompletions).values({ habitId: streakHabitId, completedDate: y3 });

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${streakHabitId}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.json().habit.currentStreak).toBe(4);
    });

    it("H6. missing both today and yesterday → currentStreak = 0 (gap breaks streak)", async () => {
      // Create habit with 4 completions ending 2 days ago (y2, y3, y4, y5)
      const [gapHabit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Gap Streak Habit",
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        })
        .returning();

      const y4 = addCalendarDays(today, -4);
      const y5 = addCalendarDays(today, -5);
      await db.insert(habitCompletions).values([
        { habitId: gapHabit.id, completedDate: y2 },
        { habitId: gapHabit.id, completedDate: y3 },
        { habitId: gapHabit.id, completedDate: y4 },
        { habitId: gapHabit.id, completedDate: y5 },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${gapHabit.id}`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.json().habit.currentStreak).toBe(0);
      expect(res.json().habit.longestStreak).toBe(4);
    });
  });

  // ========================================================
  // I. LONGEST STREAK (> 30 DAYS LIFETIME STREAK)
  // ========================================================
  describe("I. Longest Streak (Lifetime Independency)", () => {
    it("I1. calculates longest streak exceeding 30 days independently of history window", async () => {
      const today = getUserLocalToday("UTC");
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Centurion Lifetime Habit",
          createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // Created 100 days ago
        })
        .returning();

      // Insert 45 consecutive completions ending 10 days ago (run of 45 days)
      const values = [];
      for (let i = 10; i < 55; i++) {
        values.push({
          habitId: habit.id,
          completedDate: addCalendarDays(today, -i),
        });
      }
      await db.insert(habitCompletions).values(values);

      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habit.id}/history?days=30`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Mandatory test verification:
      // History array is bounded to requested 30 days
      expect(body.history.length).toBe(30);

      // Longest streak represents full lifetime (45 days > 30 days history window)
      expect(body.longestStreak).toBe(45);
      expect(body.currentStreak).toBe(0); // Ended 10 days ago, so current streak is 0
    });
  });

  // ========================================================
  // J. HISTORY PRESENTATION (BOUNDED 7–30 DAYS)
  // ========================================================
  describe("J. History Presentation", () => {
    let histHabitId: string;
    const today = getUserLocalToday("UTC");

    beforeAll(async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "History Details Habit",
          createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        })
        .returning();
      histHabitId = habit.id;

      await db.insert(habitCompletions).values({
        habitId: histHabitId,
        completedDate: today,
      });
      await db.insert(habitCompletions).values({
        habitId: histHabitId,
        completedDate: addCalendarDays(today, -2),
      });
    });

    it("J1. defaults to 30 days history window when query parameter is omitted", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${histHabitId}/history`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.days).toBe(30);
      expect(body.history.length).toBe(30);
      expect(body.history[0].date).toBe(today);
      expect(body.history[0].completed).toBe(true);
    });

    it("J2. supports custom days parameter (e.g. ?days=7)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${histHabitId}/history?days=7`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.days).toBe(7);
      expect(body.history.length).toBe(7);
    });

    it("J3. rejects days < 7 with 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${histHabitId}/history?days=6`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("J4. rejects days > 30 with 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${histHabitId}/history?days=31`,
        headers: { Cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });
  });

  // ========================================================
  // K. RACE CONDITIONS & CONCURRENCY
  // ========================================================
  describe("K. Race Conditions & Concurrency", () => {
    it("K1. handles simultaneous rapid completion requests safely without duplicate rows or 500 error", async () => {
      const today = getUserLocalToday("UTC");
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Concurrent Completion Habit",
        })
        .returning();

      // Issue 5 simultaneous completion requests for the exact same habit and date
      const promises = Array.from({ length: 5 }).map(() =>
        app.inject({
          method: "POST",
          url: `/api/habits/${habit.id}/completions`,
          headers: { Cookie: userACookie, origin: "http://localhost:5173" },
          payload: { date: today },
        })
      );

      const results = await Promise.all(promises);

      // Every request must succeed with 200 or 201 (no 500 or uncaught errors)
      results.forEach((res) => {
        expect([200, 201]).toContain(res.statusCode);
      });

      // Verify database contains exactly 1 row
      const rows = await db
        .select()
        .from(habitCompletions)
        .where(sql`habit_id = ${habit.id} AND completed_date = ${today}`);
      expect(rows.length).toBe(1);
    });
  });
});
