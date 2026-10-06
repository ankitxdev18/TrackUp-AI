import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { habitCompletions, habits, users } from "../src/db/schema.js";

describe("Milestone H01-B: Habit CRUD API, Validation & Authorization Suite", () => {
  let app: FastifyInstance;

  const userAEmail = `habit_api_usera_${Date.now()}@example.com`;
  const userBEmail = `habit_api_userb_${Date.now()}@example.com`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Habit",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Habit",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

    // Login user A to acquire session cookie
    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password: plainPassword },
    });
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    userACookie = (rawCookieA as string).split(";")[0];

    // Login user B to acquire session cookie
    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password: plainPassword },
    });
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    userBCookie = (rawCookieB as string).split(";")[0];
  });

  afterAll(async () => {
    await db.delete(habits).where(eq(habits.userId, userAId));
    await db.delete(habits).where(eq(habits.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. AUTHENTICATION ENFORCEMENT
  // ==========================================
  describe("Authentication", () => {
    it("1. GET /api/habits without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("2. POST /api/habits without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        payload: { title: "Unauthenticated Habit" },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("3. GET /api/habits/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits/00000000-0000-0000-0000-000000000000",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("4. PATCH /api/habits/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/habits/00000000-0000-0000-0000-000000000000",
        payload: { title: "Updated Title" },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("5. DELETE /api/habits/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/habits/00000000-0000-0000-0000-000000000000",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });
  });

  // ==========================================
  // 2. CREATE HABIT
  // ==========================================
  describe("Create Habit (POST /api/habits)", () => {
    let createdHabitId: string;

    it("6. creates a valid habit with title and description", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: {
          title: "Drink 2L Water",
          description: "Keep hydration high throughout the workday",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.habit).toBeDefined();
      expect(body.habit.title).toBe("Drink 2L Water");
      expect(body.habit.description).toBe("Keep hydration high throughout the workday");
      createdHabitId = body.habit.id;
    });

    it("7. assigns habit strictly to authenticated user", async () => {
      const [dbHabit] = await db
        .select()
        .from(habits)
        .where(eq(habits.id, createdHabitId));

      expect(dbHabit).toBeDefined();
      expect(dbHabit.userId).toBe(userAId);
    });

    it("8. defaults frequency to DAILY", async () => {
      const [dbHabit] = await db
        .select()
        .from(habits)
        .where(eq(habits.id, createdHabitId));

      expect(dbHabit.frequency).toBe("DAILY");
    });

    it("9. defaults status to ACTIVE", async () => {
      const [dbHabit] = await db
        .select()
        .from(habits)
        .where(eq(habits.id, createdHabitId));

      expect(dbHabit.status).toBe("ACTIVE");
    });

    it("10. rejects empty title or whitespace-only title with HTTP 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "   " },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("11. rejects title exceeding 255 characters with HTTP 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "A".repeat(256) },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("12. rejects description exceeding 1000 characters with HTTP 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: {
          title: "Valid Title",
          description: "D".repeat(1001),
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("13. rejects invalid frequency (e.g. WEEKLY) with HTTP 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: {
          title: "Weekly Habit",
          frequency: "WEEKLY",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("14. rejects client attempting to spoof or assign userId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: {
          title: "Spoofed User Habit",
          userId: userBId,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("15. rejects disallowed/unknown fields via strict schema validation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: {
          title: "Extra Fields Habit",
          id: "00000000-0000-0000-0000-000000000000",
          createdAt: new Date().toISOString(),
          randomField: "malicious",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 3. LIST HABITS
  // ==========================================
  describe("List Habits (GET /api/habits)", () => {
    let habitAId: string;
    let habitBId: string;

    beforeAll(async () => {
      // Create habit for User A
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "User A Morning Run" },
      });
      habitAId = resA.json().habit.id;

      // Create habit for User B
      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "User B Evening Reading" },
      });
      habitBId = resB.json().habit.id;
    });

    it("16. returns only habits belonging to the authenticated user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits",
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.habits)).toBe(true);

      const ids = body.habits.map((h: any) => h.id);
      expect(ids).toContain(habitAId);
      expect(ids).not.toContain(habitBId);
    });

    it("17. ensures user does not see another user's habits (User B isolation)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const ids = body.habits.map((h: any) => h.id);
      expect(ids).toContain(habitBId);
      expect(ids).not.toContain(habitAId);
    });

    it("18. supports status filtering (ACTIVE vs ARCHIVED) and rejects invalid status", async () => {
      // Archive User A's habit
      await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { status: "ARCHIVED" },
      });

      // Filter ACTIVE → habitAId should not be in list
      const resActive = await app.inject({
        method: "GET",
        url: "/api/habits?status=ACTIVE",
        headers: { Cookie: userACookie },
      });
      expect(resActive.statusCode).toBe(200);
      const activeIds = resActive.json().habits.map((h: any) => h.id);
      expect(activeIds).not.toContain(habitAId);

      // Filter ARCHIVED → habitAId should be in list
      const resArchived = await app.inject({
        method: "GET",
        url: "/api/habits?status=ARCHIVED",
        headers: { Cookie: userACookie },
      });
      expect(resArchived.statusCode).toBe(200);
      const archivedIds = resArchived.json().habits.map((h: any) => h.id);
      expect(archivedIds).toContain(habitAId);

      // Invalid status filter → 400
      const resInvalid = await app.inject({
        method: "GET",
        url: "/api/habits?status=COMPLETED",
        headers: { Cookie: userACookie },
      });
      expect(resInvalid.statusCode).toBe(400);
      expect(resInvalid.json().code).toBe("INVALID_STATUS");

      // Restore habitA to ACTIVE
      await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { status: "ACTIVE" },
      });
    });
  });

  // ==========================================
  // 4. GET HABIT BY ID
  // ==========================================
  describe("Get Habit by ID (GET /api/habits/:id)", () => {
    let habitAId: string;
    let habitBId: string;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "Get Test Habit A" },
      });
      habitAId = resA.json().habit.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "Get Test Habit B" },
      });
      habitBId = resB.json().habit.id;
    });

    it("19. retrieves own habit by ID successfully", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.habit).toBeDefined();
      expect(body.habit.id).toBe(habitAId);
      expect(body.habit.title).toBe("Get Test Habit A");
    });

    it("20. returns 404 for non-existent habit ID", async () => {
      const nonExistentId = "ffffffff-ffff-4fff-bfff-ffffffffffff";
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${nonExistentId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("21. returns 404 when attempting to get another user's habit (IDOR defense)", async () => {
      // User A attempts to access Habit B (owned by User B)
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitBId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("22. rejects malformed non-UUID ID with HTTP 400 INVALID_ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits/not-a-valid-uuid",
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ID");
    });
  });

  // ==========================================
  // 5. UPDATE HABIT
  // ==========================================
  describe("Update Habit (PATCH /api/habits/:id)", () => {
    let habitAId: string;
    let habitBId: string;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "Original Title A", description: "Original Description" },
      });
      habitAId = resA.json().habit.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "Original Title B" },
      });
      habitBId = resB.json().habit.id;
    });

    it("23. updates own habit title", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { title: "Updated Title A" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().habit.title).toBe("Updated Title A");
    });

    it("24. updates habit description and supports setting to null", async () => {
      // Update description text
      const res1 = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { description: "Updated Notes" },
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json().habit.description).toBe("Updated Notes");

      // Nullify description
      const res2 = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { description: null },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().habit.description).toBeNull();
    });

    it("25. transitions lifecycle from ACTIVE → ARCHIVED", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { status: "ARCHIVED" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().habit.status).toBe("ARCHIVED");
    });

    it("26. transitions lifecycle from ARCHIVED → ACTIVE (restore)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { status: "ACTIVE" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().habit.status).toBe("ACTIVE");
    });

    it("27. prevents updating another user's habit (returns 404 NOT_FOUND)", async () => {
      // User A attempts to update User B's habit
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitBId}`,
        headers: { Cookie: userACookie },
        payload: { title: "Hacked Title" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");

      // Verify User B's habit in DB was unchanged
      const [dbHabitB] = await db
        .select()
        .from(habits)
        .where(eq(habits.id, habitBId));
      expect(dbHabitB.title).toBe("Original Title B");
    });

    it("28. rejects invalid update data (empty title, empty object, or invalid status)", async () => {
      // Empty title
      const resEmptyTitle = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { title: "   " },
      });
      expect(resEmptyTitle.statusCode).toBe(400);

      // Empty object
      const resEmptyObj = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: {},
      });
      expect(resEmptyObj.statusCode).toBe(400);

      // Disallowed status like COMPLETED
      const resBadStatus = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { status: "COMPLETED" },
      });
      expect(resBadStatus.statusCode).toBe(400);
    });

    it("29. rejects client attempt to modify userId", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { userId: userBId },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("30. rejects client attempt to modify id", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/habits/${habitAId}`,
        headers: { Cookie: userACookie },
        payload: { id: "00000000-0000-0000-0000-000000000000" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 6. DELETE HABIT
  // ==========================================
  describe("Delete Habit (DELETE /api/habits/:id)", () => {
    let habitToDeleteId: string;
    let habitBId: string;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "Habit To Be Deleted" },
      });
      habitToDeleteId = resA.json().habit.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "User B Preserved Habit" },
      });
      habitBId = resB.json().habit.id;
    });

    it("31. allows user to delete own habit", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitToDeleteId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe(habitToDeleteId);
    });

    it("32. returns 404 when deleting a non-existent habit", async () => {
      const nonExistentId = "ffffffff-ffff-4fff-bfff-ffffffffffff";
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${nonExistentId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("33. returns 404 when attempting to delete another user's habit (IDOR defense)", async () => {
      // User A attempts to delete User B's habit
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitBId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");

      // Verify User B's habit still exists
      const [dbHabitB] = await db
        .select()
        .from(habits)
        .where(eq(habits.id, habitBId));
      expect(dbHabitB).toBeDefined();
    });

    it("34. ensures deletion permanently removes the habit", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitToDeleteId}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);

      const [dbHabit] = await db
        .select()
        .from(habits)
        .where(eq(habits.id, habitToDeleteId));
      expect(dbHabit).toBeUndefined();
    });

    it("35. ensures database cascade deletes completions when habit is deleted", async () => {
      // Create habit
      const resHabit = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "Cascade Test Habit" },
      });
      const cascadeHabitId = resHabit.json().habit.id;

      // Insert completion fixture directly into database
      await db.insert(habitCompletions).values({
        habitId: cascadeHabitId,
        userId: userAId,
        completedDate: "2026-10-06",
      });

      // Verify completion exists in DB
      const completionsBefore = await db
        .select()
        .from(habitCompletions)
        .where(eq(habitCompletions.habitId, cascadeHabitId));
      expect(completionsBefore.length).toBe(1);

      // Delete habit via API
      const resDel = await app.inject({
        method: "DELETE",
        url: `/api/habits/${cascadeHabitId}`,
        headers: { Cookie: userACookie },
      });
      expect(resDel.statusCode).toBe(200);

      // Verify completion was cascaded away
      const completionsAfter = await db
        .select()
        .from(habitCompletions)
        .where(eq(habitCompletions.habitId, cascadeHabitId));
      expect(completionsAfter.length).toBe(0);
    });
  });

  // ==========================================
  // 7. COMPLETION & HISTORY AUTHENTICATION
  // ==========================================
  describe("Completion & History Authentication", () => {
    it("36. POST /api/habits/:id/completions without auth → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/habits/00000000-0000-0000-0000-000000000000/completions",
        payload: { date: "2026-10-06" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("37. DELETE /api/habits/:id/completions/:date without auth → 401", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/habits/00000000-0000-0000-0000-000000000000/completions/2026-10-06",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("38. GET /api/habits/:id/history without auth → 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/habits/00000000-0000-0000-0000-000000000000/history",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });
  });

  // ==========================================
  // 8. CREATE COMPLETION
  // ==========================================
  describe("Create Habit Completion (POST /api/habits/:id/completions)", () => {
    let habitAId: string;
    let habitBId: string;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - 3);
    const pastDateStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}-${String(pastDate.getDate()).padStart(2, "0")}`;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "Complete Habit Test A" },
      });
      habitAId = resA.json().habit.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "Complete Habit Test B" },
      });
      habitBId = resB.json().habit.id;
    });

    it("39. rejects completion request when date is missing or omitted with HTTP 400", async () => {
      // Empty body payload
      const resEmpty = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: {},
      });
      expect(resEmpty.statusCode).toBe(400);
      expect(resEmpty.json().code).toBe("VALIDATION_ERROR");
      expect(resEmpty.json().details.some((d: any) => d.field === "date")).toBe(true);

      // No payload provided
      const resNoPayload = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
      });
      expect(resNoPayload.statusCode).toBe(400);
      expect(resNoPayload.json().code).toBe("VALIDATION_ERROR");
    });

    it("40. creates completion for own habit on today's date with explicit date", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: todayStr },
      });

      expect([200, 201]).toContain(res.statusCode);
      const body = res.json();
      expect(body.completion).toBeDefined();
      expect(body.completion.completedDate).toBe(todayStr);
      expect(body.completion.habitId).toBe(habitAId);
      expect(body.completion.userId).toBe(userAId);
    });

    it("40. creates completion for own habit on a valid past date", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: pastDateStr },
      });

      expect([200, 201]).toContain(res.statusCode);
      const body = res.json();
      expect(body.completion).toBeDefined();
      expect(body.completion.completedDate).toBe(pastDateStr);
    });

    it("41. rejects malformed dates (e.g. 2026-1-6, 06-10-2026, 2026/10/06, timestamps) with HTTP 400", async () => {
      const malformedExamples = [
        "2026-1-6",
        "06-10-2026",
        "2026/10/06",
        "2026-10-06T10:30:00Z",
        "random-string",
      ];

      for (const malformed of malformedExamples) {
        const res = await app.inject({
          method: "POST",
          url: `/api/habits/${habitAId}/completions`,
          headers: { Cookie: userACookie },
          payload: { date: malformed },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("VALIDATION_ERROR");
      }
    });

    it("42. rejects impossible dates (e.g. 2026-02-30) with HTTP 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: "2026-02-30" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("42b. rejects non-leap year Feb 29 (2025-02-29) and 30-day month April 31 (2026-04-31) with HTTP 400", async () => {
      const resNonLeap = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: "2025-02-29" },
      });
      expect(resNonLeap.statusCode).toBe(400);
      expect(resNonLeap.json().code).toBe("VALIDATION_ERROR");

      const resApril31 = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: "2026-04-31" },
      });
      expect(resApril31.statusCode).toBe(400);
      expect(resApril31.json().code).toBe("VALIDATION_ERROR");
    });

    it("42c. accepts valid leap year Feb 29 (2024-02-29) as a valid past calendar date", async () => {
      const resLeap = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: "2024-02-29" },
      });
      expect([200, 201]).toContain(resLeap.statusCode);
      expect(resLeap.json().completion.completedDate).toBe("2024-02-29");
    });

    it("43. rejects future dates with HTTP 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: "2099-12-31" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("44. rejects client attempting to pass userId in completion payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: todayStr, userId: userBId },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("45. rejects client attempting to pass habitId in completion payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: todayStr, habitId: habitBId },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("46. duplicate completion request does not create duplicate row (idempotent)", async () => {
      // First attempt
      const res1 = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: todayStr },
      });
      expect([200, 201]).toContain(res1.statusCode);

      // Second attempt on the same habit and date
      const res2 = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: todayStr },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().completion).toBeDefined();

      // Database verification: exactly 1 row exists
      const rows = await db
        .select()
        .from(habitCompletions)
        .where(
          sql`habit_id = ${habitAId} AND completed_date = ${todayStr}`
        );
      expect(rows.length).toBe(1);
    });

    it("47. User B cannot complete User A's habit (IDOR defense returns 404)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userBCookie },
        payload: { date: todayStr },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 9. DELETE COMPLETION (UNCHECK)
  // ==========================================
  describe("Delete Habit Completion (DELETE /api/habits/:id/completions/:date)", () => {
    let habitAId: string;
    let habitBId: string;
    const testDate = "2026-10-01";

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "Uncheck Habit Test A" },
      });
      habitAId = resA.json().habit.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "Uncheck Habit Test B" },
      });
      habitBId = resB.json().habit.id;

      // Complete habit A for testDate
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: testDate },
      });

      // Complete habit B for testDate
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitBId}/completions`,
        headers: { Cookie: userBCookie },
        payload: { date: testDate },
      });
    });

    it("48. deletes existing completion successfully", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitAId}/completions/${testDate}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.habitId).toBe(habitAId);
      expect(body.completedDate).toBe(testDate);
    });

    it("49. ensures completion no longer exists in database after deletion", async () => {
      const rows = await db
        .select()
        .from(habitCompletions)
        .where(
          sql`habit_id = ${habitAId} AND completed_date = ${testDate}`
        );
      expect(rows.length).toBe(0);
    });

    it("50. returns 404 when attempting to delete non-existent completion", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitAId}/completions/${testDate}`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("51. User B cannot delete User A's completion (IDOR defense returns 404)", async () => {
      // Re-create completion on habit A
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: testDate },
      });

      // User B attempts to delete User A's completion
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitAId}/completions/${testDate}`,
        headers: { Cookie: userBCookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");

      // Verify User A's completion was not deleted
      const rows = await db
        .select()
        .from(habitCompletions)
        .where(
          sql`habit_id = ${habitAId} AND completed_date = ${testDate}`
        );
      expect(rows.length).toBe(1);
    });

    it("52. rejects malformed completion date in DELETE path with HTTP 400", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/habits/${habitAId}/completions/invalid-date`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_DATE");
    });
  });

  // ==========================================
  // 10. HABIT COMPLETION HISTORY
  // ==========================================
  describe("Habit Completion History (GET /api/habits/:id/history)", () => {
    let habitAId: string;
    let habitBId: string;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(twoDaysAgo.getDate()).padStart(2, "0")}`;

    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const tenDaysAgoStr = `${tenDaysAgo.getFullYear()}-${String(tenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(tenDaysAgo.getDate()).padStart(2, "0")}`;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userACookie },
        payload: { title: "History Habit Test A" },
      });
      habitAId = resA.json().habit.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/habits",
        headers: { Cookie: userBCookie },
        payload: { title: "History Habit Test B" },
      });
      habitBId = resB.json().habit.id;

      // Create completions for Habit A on today, 2 days ago, and 10 days ago (outside 7-day window)
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: todayStr },
      });
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: twoDaysAgoStr },
      });
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitAId}/completions`,
        headers: { Cookie: userACookie },
        payload: { date: tenDaysAgoStr },
      });

      // Create completion for Habit B on today
      await app.inject({
        method: "POST",
        url: `/api/habits/${habitBId}/completions`,
        headers: { Cookie: userBCookie },
        payload: { date: todayStr },
      });
    });

    it("53. returns 7-day bounded history window by default with deterministic descending date order", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}/history`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.habitId).toBe(habitAId);
      expect(body.days).toBe(7);
      expect(Array.isArray(body.history)).toBe(true);
      expect(body.history.length).toBe(7);

      // Verify descending date order
      for (let i = 0; i < body.history.length - 1; i++) {
        expect(body.history[i].date > body.history[i + 1].date).toBe(true);
      }

      // Today's entry is completed
      const todayEntry = body.history.find((h: any) => h.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.completed).toBe(true);
      expect(todayEntry.completedAt).toBeDefined();

      // 2 days ago entry is completed
      const twoDaysAgoEntry = body.history.find((h: any) => h.date === twoDaysAgoStr);
      expect(twoDaysAgoEntry).toBeDefined();
      expect(twoDaysAgoEntry.completed).toBe(true);

      // 10 days ago entry is NOT in the 7-day history window
      const tenDaysAgoEntry = body.history.find((h: any) => h.date === tenDaysAgoStr);
      expect(tenDaysAgoEntry).toBeUndefined();

      // Verify startDate and endDate
      expect(body.startDate).toBeDefined();
      expect(body.endDate).toBeDefined();
      expect(body.startDate <= body.endDate).toBe(true);

      // Verify completions array is NOT returned (simplified response contract)
      expect(body.completions).toBeUndefined();
    });

    it("54. supports custom bounded history window up to allowed limit (e.g. ?days=14)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}/history?days=14`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.days).toBe(14);
      expect(body.history.length).toBe(14);
      expect(body.completions).toBeUndefined();

      // 10 days ago is within the 14-day window
      const tenDaysAgoEntry = body.history.find((h: any) => h.date === tenDaysAgoStr);
      expect(tenDaysAgoEntry).toBeDefined();
      expect(tenDaysAgoEntry.completed).toBe(true);
    });

    it("55. User B cannot retrieve User A's history (IDOR defense returns 404)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}/history`,
        headers: { Cookie: userBCookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("56. history excludes another user's completions completely", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${habitAId}/history`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.completions).toBeUndefined();

      // Habit A history reflects only User A's completions on Habit A
      const todayEntry = body.history.find((h: any) => h.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.completed).toBe(true);
    });

    it("57. returns 404 for non-existent habit history", async () => {
      const nonExistentId = "ffffffff-ffff-4fff-bfff-ffffffffffff";
      const res = await app.inject({
        method: "GET",
        url: `/api/habits/${nonExistentId}/history`,
        headers: { Cookie: userACookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });
  });
});
