import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { SESSION_COOKIE_NAME } from "../src/auth/session.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { goals, users } from "../src/db/schema.js";

describe("Milestone 4: Goals Vertical Slice — Backend API & Security", () => {
  let app: FastifyInstance;

  const userAEmail = `goals_usera_${Date.now()}@example.com`;
  const userBEmail = `goals_userb_${Date.now()}@example.com`;
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
    await db.delete(goals).where(eq(goals.userId, userAId));
    await db.delete(goals).where(eq(goals.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // 1. Create Goal
  it("1. creates a new goal with valid fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: {
        title: "Become Internship Ready",
        description: "Practice DSA and build high quality portfolio projects",
        targetDate: "2026-12-01",
        progress: 10,
        status: "ACTIVE",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.goal).toBeDefined();
    expect(body.goal.title).toBe("Become Internship Ready");
    expect(body.goal.description).toBe("Practice DSA and build high quality portfolio projects");
    expect(body.goal.progress).toBe(10);
    expect(body.goal.status).toBe("ACTIVE");
    expect(body.goal.targetDate).toBe("2026-12-01");
    expect(body.goal.userId).toBe(userAId);
  });

  // 2. List Goals (with and without filter)
  it("2. lists current user goals with optional status filtering", async () => {
    // Create an archived goal for User A
    await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: {
        title: "Old Archived Goal",
        status: "ARCHIVED",
        progress: 100,
      },
    });

    // List all
    const allRes = await app.inject({
      method: "GET",
      url: "/api/goals",
      headers: { Cookie: userACookie },
    });
    expect(allRes.statusCode).toBe(200);
    const allBody = allRes.json();
    expect(allBody.goals.length).toBeGreaterThanOrEqual(2);

    // List with status=ACTIVE filter
    const activeRes = await app.inject({
      method: "GET",
      url: "/api/goals?status=ACTIVE",
      headers: { Cookie: userACookie },
    });
    expect(activeRes.statusCode).toBe(200);
    const activeBody = activeRes.json();
    expect(activeBody.goals.every((g: any) => g.status === "ACTIVE")).toBe(true);

    // List with status=ARCHIVED filter
    const archivedRes = await app.inject({
      method: "GET",
      url: "/api/goals?status=ARCHIVED",
      headers: { Cookie: userACookie },
    });
    expect(archivedRes.statusCode).toBe(200);
    const archivedBody = archivedRes.json();
    expect(archivedBody.goals.every((g: any) => g.status === "ARCHIVED")).toBe(true);
  });

  // 3. Get Goal by ID
  it("3. retrieves a single goal by ID", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Specific Goal to Retrieve" },
    });
    const goalId = createRes.json().goal.id;

    const getRes = await app.inject({
      method: "GET",
      url: `/api/goals/${goalId}`,
      headers: { Cookie: userACookie },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.goal.id).toBe(goalId);
    expect(getBody.goal.title).toBe("Specific Goal to Retrieve");
  });

  // 4. Update Goal
  it("4. updates goal title, description, status, progress, and targetDate", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Initial Goal Title", progress: 0 },
    });
    const goalId = createRes.json().goal.id;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/goals/${goalId}`,
      headers: { Cookie: userACookie },
      payload: {
        title: "Updated Goal Title",
        description: "Updated description text",
        status: "COMPLETED",
        progress: 100,
        targetDate: "2026-11-15",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json();
    expect(patchBody.goal.title).toBe("Updated Goal Title");
    expect(patchBody.goal.description).toBe("Updated description text");
    expect(patchBody.goal.status).toBe("COMPLETED");
    expect(patchBody.goal.progress).toBe(100);
    expect(patchBody.goal.targetDate).toBe("2026-11-15");
  });

  // 5. Delete Goal
  it("5. deletes a goal", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal to Delete" },
    });
    const goalId = createRes.json().goal.id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/goals/${goalId}`,
      headers: { Cookie: userACookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().success).toBe(true);

    // Verify subsequent GET returns 404
    const getAgain = await app.inject({
      method: "GET",
      url: `/api/goals/${goalId}`,
      headers: { Cookie: userACookie },
    });
    expect(getAgain.statusCode).toBe(404);
  });

  // 6. Validation: Invalid Title
  it("6. rejects empty or overly long title with 400 VALIDATION_ERROR", async () => {
    const emptyRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "   " },
    });
    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.json().code).toBe("VALIDATION_ERROR");

    const longRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "A".repeat(501) },
    });
    expect(longRes.statusCode).toBe(400);
    expect(longRes.json().code).toBe("VALIDATION_ERROR");
  });

  // 7. Validation: Invalid Status
  it("7. rejects invalid status values with 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal", status: "NOT_A_VALID_STATUS" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  // 8. Validation: Invalid Progress
  it("8. rejects negative, >100, or non-integer progress with 400 VALIDATION_ERROR", async () => {
    const negRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal", progress: -5 },
    });
    expect(negRes.statusCode).toBe(400);

    const overRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal", progress: 101 },
    });
    expect(overRes.statusCode).toBe(400);

    const floatRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal", progress: 50.5 },
    });
    expect(floatRes.statusCode).toBe(400);
  });

  // 9. Validation: Invalid Target Date
  it("9. rejects invalid or non-existent calendar target dates with 400 VALIDATION_ERROR", async () => {
    const badFormatRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal", targetDate: "12-01-2026" },
    });
    expect(badFormatRes.statusCode).toBe(400);

    const impossibleDateRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "Goal", targetDate: "2026-02-31" },
    });
    expect(impossibleDateRes.statusCode).toBe(400);
  });

  // 10. Unauthenticated Request
  it("10. rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const getRes = await app.inject({ method: "GET", url: "/api/goals" });
    expect(getRes.statusCode).toBe(401);
    expect(getRes.json().code).toBe("UNAUTHENTICATED");

    const postRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      payload: { title: "Sneaky Goal" },
    });
    expect(postRes.statusCode).toBe(401);
    expect(postRes.json().code).toBe("UNAUTHENTICATED");
  });

  // 11. Cross-User GET (IDOR Protection)
  it("11. returns 404 when User B attempts to GET User A's goal", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "User A Confidential Goal" },
    });
    const goalAId = createRes.json().goal.id;

    const crossGet = await app.inject({
      method: "GET",
      url: `/api/goals/${goalAId}`,
      headers: { Cookie: userBCookie },
    });
    expect(crossGet.statusCode).toBe(404);
    expect(crossGet.json().code).toBe("NOT_FOUND");
  });

  // 12. Cross-User PATCH (IDOR Protection)
  it("12. returns 404 when User B attempts to PATCH User A's goal", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "User A Goal to Tamper" },
    });
    const goalAId = createRes.json().goal.id;

    const crossPatch = await app.inject({
      method: "PATCH",
      url: `/api/goals/${goalAId}`,
      headers: { Cookie: userBCookie },
      payload: { title: "Hacked by User B" },
    });
    expect(crossPatch.statusCode).toBe(404);
    expect(crossPatch.json().code).toBe("NOT_FOUND");

    // Verify User A's goal was untouched
    const verifyGet = await app.inject({
      method: "GET",
      url: `/api/goals/${goalAId}`,
      headers: { Cookie: userACookie },
    });
    expect(verifyGet.json().goal.title).toBe("User A Goal to Tamper");
  });

  // 13. Cross-User DELETE (IDOR Protection)
  it("13. returns 404 when User B attempts to DELETE User A's goal", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: { title: "User A Goal Protected from Deletion" },
    });
    const goalAId = createRes.json().goal.id;

    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/api/goals/${goalAId}`,
      headers: { Cookie: userBCookie },
    });
    expect(crossDelete.statusCode).toBe(404);
    expect(crossDelete.json().code).toBe("NOT_FOUND");

    // Verify goal still exists for User A
    const verifyGet = await app.inject({
      method: "GET",
      url: `/api/goals/${goalAId}`,
      headers: { Cookie: userACookie },
    });
    expect(verifyGet.statusCode).toBe(200);
  });

  // 14. Client-supplied userId Cannot Override Session
  it("14. ignores/strips client-supplied userId and assigns strictly to authenticated session user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { Cookie: userACookie },
      payload: {
        title: "Impersonation Attempt Goal",
        userId: userBId, // Maliciously attempting to assign goal to User B
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.goal.userId).toBe(userAId);
    expect(body.goal.userId).not.toBe(userBId);

    // Verify User B cannot see it
    const listB = await app.inject({
      method: "GET",
      url: "/api/goals",
      headers: { Cookie: userBCookie },
    });
    expect(listB.json().goals.some((g: any) => g.id === body.goal.id)).toBe(false);
  });

  // 15. UUID Validation
  it("15. returns 400 INVALID_ID for malformed goal UUID in URL parameter", async () => {
    const getRes = await app.inject({
      method: "GET",
      url: "/api/goals/not-a-valid-uuid",
      headers: { Cookie: userACookie },
    });
    expect(getRes.statusCode).toBe(400);
    expect(getRes.json().code).toBe("INVALID_ID");

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/goals/12345",
      headers: { Cookie: userACookie },
      payload: { title: "New" },
    });
    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().code).toBe("INVALID_ID");

    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/goals/bad-uuid-format",
      headers: { Cookie: userACookie },
    });
    expect(delRes.statusCode).toBe(400);
    expect(delRes.json().code).toBe("INVALID_ID");
  });
});
