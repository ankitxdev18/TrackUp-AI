import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { expenses, monthlyBudgets, users } from "../src/db/schema.js";

describe("Milestone A: Monthly Budget Tracker Backend Integration Suite", () => {
  let app: FastifyInstance;

  const userAEmail = `budget_usera_${Date.now()}@example.com`;
  const userBEmail = `budget_userb_${Date.now()}@example.com`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;
  let authHeadersA: { cookie: string; origin: string };
  let authHeadersB: { cookie: string; origin: string };

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Budget",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Budget",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

    // Login user A
    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password: plainPassword },
    });
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    userACookie = (rawCookieA as string).split(";")[0]!;

    // Login user B
    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password: plainPassword },
    });
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    userBCookie = (rawCookieB as string).split(";")[0]!;

    authHeadersA = { cookie: userACookie, origin: "http://localhost:5173" };
    authHeadersB = { cookie: userBCookie, origin: "http://localhost:5173" };

    // Seed User A expenses in October 2026: Total ₹7,000 (700,000 paise)
    await db.insert(expenses).values([
      {
        userId: userAId,
        amountCents: 450000, // ₹4,500
        date: "2026-10-05",
        categoryId: "housing",
        description: "Rent portion",
      },
      {
        userId: userAId,
        amountCents: 250000, // ₹2,500
        date: "2026-10-18",
        categoryId: "food",
        description: "Monthly staples",
      },
      // Expense outside October 2026 (September 2026)
      {
        userId: userAId,
        amountCents: 300000, // ₹3,000
        date: "2026-09-28",
        categoryId: "transport",
        description: "Past month car repair",
      },
    ]);

    // Seed User B expense in October 2026: Total ₹9,000
    await db.insert(expenses).values([
      {
        userId: userBId,
        amountCents: 900000,
        date: "2026-10-12",
        categoryId: "shopping",
        description: "User B shopping",
      },
    ]);
  });

  afterAll(async () => {
    try {
      await db.delete(expenses).where(eq(expenses.userId, userAId));
      await db.delete(expenses).where(eq(expenses.userId, userBId));
      await db.delete(monthlyBudgets).where(eq(monthlyBudgets.userId, userAId));
      await db.delete(monthlyBudgets).where(eq(monthlyBudgets.userId, userBId));
      await db.delete(users).where(eq(users.id, userAId));
      await db.delete(users).where(eq(users.id, userBId));
    } catch {
      // Best-effort cleanup
    }
    await app.close();
    await closeDatabasePool();
  });

  it("1. enforces authentication on budget endpoints", async () => {
    const getRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
    });
    expect(getRes.statusCode).toBe(401);

    const postRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      payload: { month: "2026-10", amountCents: 1000000 },
    });
    expect(postRes.statusCode).toBe(401);
  });

  it("2. returns null budget and authoritative spending when no budget is configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: { cookie: userACookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.budget).toBeNull();
    expect(body.budgetAmountCents).toBeNull();
    expect(body.month).toBe("2026-10");
    expect(body.spentAmountCents).toBe(700000); // Only User A's Oct expenses: 450000 + 250000
    expect(body.transactionCount).toBe(2);
    expect(body.remainingAmountCents).toBe(0);
    expect(body.overBudgetAmountCents).toBe(0);
    expect(body.utilizationPercent).toBe(0);
    expect(body.isExceeded).toBe(false);
  });

  it("3. validates input: rejects non-positive, non-integer, overflow, and malformed month", async () => {
    // Zero amount
    const zeroRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 0 },
    });
    expect(zeroRes.statusCode).toBe(400);

    // Negative amount
    const negRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: -500 },
    });
    expect(negRes.statusCode).toBe(400);

    // Float cents
    const floatRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 1000.5 },
    });
    expect(floatRes.statusCode).toBe(400);

    // Malformed month
    const badMonthRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-13", amountCents: 500000 },
    });
    expect(badMonthRes.statusCode).toBe(400);

    // Overflow integer
    const overflowRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 2147483648 },
    });
    expect(overflowRes.statusCode).toBe(400);
  });

  it("4. creates a monthly budget and calculates spending < budget (Acceptance Case 1)", async () => {
    // Set budget to ₹10,000 (1,000,000 paise). User A spent ₹7,000 (700,000 paise).
    const createRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 1000000 },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = createRes.json();
    expect(createBody.budget.amountCents).toBe(1000000);
    expect(createBody.budget.month).toBe("2026-10");

    // Fetch budget summary
    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();
    expect(summary.budgetAmountCents).toBe(1000000); // ₹10,000
    expect(summary.spentAmountCents).toBe(700000); // ₹7,000
    expect(summary.remainingAmountCents).toBe(300000); // ₹3,000
    expect(summary.overBudgetAmountCents).toBe(0); // ₹0
    expect(summary.utilizationPercent).toBe(70.0); // 70.0%
    expect(summary.isExceeded).toBe(false);
    expect(summary.transactionCount).toBe(2);
  });

  it("5. prevents duplicate monthly budget creation (409 Conflict)", async () => {
    const dupRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 1200000 },
    });

    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().code).toBe("DUPLICATE_BUDGET");
  });

  it("5a. handles concurrent budget creation requests for the same user/month without returning HTTP 500", async () => {
    // Attempt concurrent creations for a brand-new month (2027-05)
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/expenses/budget",
        headers: authHeadersA,
        payload: { month: "2027-05", amountCents: 600000 },
      }),
      app.inject({
        method: "POST",
        url: "/api/expenses/budget",
        headers: authHeadersA,
        payload: { month: "2027-05", amountCents: 600000 },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // Exactly one must succeed with 201, and the other must receive 409 DUPLICATE_BUDGET (never HTTP 500)
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.statusCode === 409 ? res1 : res2;
    expect(conflictRes.json()).toEqual({
      error: "A budget has already been configured for this month",
      code: "DUPLICATE_BUDGET",
    });

    const successRes = res1.statusCode === 201 ? res1 : res2;
    expect(successRes.json().budget.month).toBe("2027-05");
  });

  it("5b. allows a different user to create a budget for the same month independently", async () => {
    // User A created a budget for 2027-05 in test 5a.
    // User B should be able to create a budget for 2027-05 without conflict.
    const resB = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersB,
      payload: { month: "2027-05", amountCents: 900000 },
    });

    expect(resB.statusCode).toBe(201);
    expect(resB.json().budget.month).toBe("2027-05");
    expect(resB.json().budget.amountCents).toBe(900000);
  });

  it("5c. preserves unexpected database errors as HTTP 500 without mislabeling as DUPLICATE_BUDGET", async () => {
    const insertSpy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw Object.assign(new Error("Database connection failure"), { code: "08006" });
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-12", amountCents: 500000 },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe("INTERNAL_SERVER_ERROR");
    insertSpy.mockRestore();
  });

  it("6. updates monthly budget via PUT /api/expenses/budget", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 800000 }, // update to ₹8,000
    });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().budget.amountCents).toBe(800000);

    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });
    const summary = summaryRes.json();
    expect(summary.budgetAmountCents).toBe(800000);
    expect(summary.remainingAmountCents).toBe(100000); // ₹8,000 - ₹7,000 = ₹1,000
    expect(summary.utilizationPercent).toBe(87.5);
    expect(summary.isExceeded).toBe(false);
  });

  it("7. calculates overspending correctly when spending > budget (Acceptance Case 2)", async () => {
    // Add another expense of ₹5,000 (500,000 paise) to User A in October 2026:
    // Total spent becomes ₹7,000 + ₹5,000 = ₹12,000.
    // Budget is updated to ₹10,000 (1,000,000 paise).
    await db.insert(expenses).values({
      userId: userAId,
      amountCents: 500000,
      date: "2026-10-25",
      categoryId: "entertainment",
      description: "Concert tickets",
    });

    await app.inject({
      method: "PUT",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-10", amountCents: 1000000 }, // Reset to ₹10,000
    });

    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();
    expect(summary.budgetAmountCents).toBe(1000000); // ₹10,000
    expect(summary.spentAmountCents).toBe(1200000); // ₹12,000
    expect(summary.remainingAmountCents).toBe(0); // ₹0 (never negative)
    expect(summary.overBudgetAmountCents).toBe(200000); // ₹2,000
    expect(summary.utilizationPercent).toBe(120.0); // 120.0%
    expect(summary.isExceeded).toBe(true);
  });

  it("8. updates calculations authoritatively when an expense is deleted", async () => {
    // Find the concert tickets expense and delete it
    const [concertExp] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.description, "Concert tickets"))
      .limit(1);

    expect(concertExp).toBeDefined();

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/expenses/${concertExp!.id}`,
      headers: authHeadersA,
    });
    expect(delRes.statusCode).toBe(200);

    // Budget summary immediately recalculates back to ₹7,000 spent out of ₹10,000
    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });
    const summary = summaryRes.json();
    expect(summary.spentAmountCents).toBe(700000);
    expect(summary.remainingAmountCents).toBe(300000);
    expect(summary.overBudgetAmountCents).toBe(0);
    expect(summary.isExceeded).toBe(false);
    expect(summary.utilizationPercent).toBe(70.0);
  });

  it("9. enforces tenant isolation between users", async () => {
    // User B fetches budget for October 2026:
    // Should NOT see User A's budget
    const bRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersB,
    });
    expect(bRes.statusCode).toBe(200);
    const bSummary = bRes.json();
    expect(bSummary.budget).toBeNull();
    // User B's spentAmountCents should be strictly 900,000 (User B's shopping), not User A's 700,000
    expect(bSummary.spentAmountCents).toBe(900000);
    expect(bSummary.transactionCount).toBe(1);

    // User B creates a budget of ₹15,000 for October
    const createB = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersB,
      payload: { month: "2026-10", amountCents: 1500000 },
    });
    expect(createB.statusCode).toBe(201);

    // User A's budget remains ₹10,000
    const aRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });
    expect(aRes.json().budgetAmountCents).toBe(1000000);
  });

  it("10. calculates zero spending with an active budget", async () => {
    // Set budget for November 2026 where User A has zero expenses
    const createRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-11", amountCents: 600000 }, // ₹6,000
    });
    expect(createRes.statusCode).toBe(201);

    const getRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-11",
      headers: authHeadersA,
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.budgetAmountCents).toBe(600000);
    expect(body.spentAmountCents).toBe(0);
    expect(body.remainingAmountCents).toBe(600000);
    expect(body.overBudgetAmountCents).toBe(0);
    expect(body.utilizationPercent).toBe(0.0);
    expect(body.isExceeded).toBe(false);
    expect(body.transactionCount).toBe(0);
  });

  it("11. calculates exact budget exhaustion (spent equals budget)", async () => {
    // User A seeds expense for December 2026 of exactly ₹5,000
    await db.insert(expenses).values({
      userId: userAId,
      amountCents: 500000,
      date: "2026-12-15",
      categoryId: "shopping",
      description: "Holiday shopping exact",
    });

    // Create budget of exactly ₹5,000
    const createRes = await app.inject({
      method: "POST",
      url: "/api/expenses/budget",
      headers: authHeadersA,
      payload: { month: "2026-12", amountCents: 500000 },
    });
    expect(createRes.statusCode).toBe(201);

    const getRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-12",
      headers: authHeadersA,
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.budgetAmountCents).toBe(500000);
    expect(body.spentAmountCents).toBe(500000);
    expect(body.remainingAmountCents).toBe(0);
    expect(body.overBudgetAmountCents).toBe(0);
    expect(body.utilizationPercent).toBe(100.0);
    expect(body.isExceeded).toBe(false);
    expect(body.transactionCount).toBe(1);
  });

  it("12. handles calendar month boundaries and leap year February calculation", async () => {
    // Seed expense on leap day 2024-02-29 and day after 2024-03-01
    await db.insert(expenses).values([
      {
        userId: userAId,
        amountCents: 150000,
        date: "2024-02-29",
        categoryId: "other",
        description: "Leap day special",
      },
      {
        userId: userAId,
        amountCents: 200000,
        date: "2024-03-01",
        categoryId: "other",
        description: "March first expense",
      },
    ]);

    // Query leap month 2024-02: end date should be 2024-02-29 and strictly include leap day
    const leapRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2024-02",
      headers: authHeadersA,
    });
    expect(leapRes.statusCode).toBe(200);
    const leapBody = leapRes.json();
    expect(leapBody.startDate).toBe("2024-02-01");
    expect(leapBody.endDate).toBe("2024-02-29");
    expect(leapBody.spentAmountCents).toBe(150000);
    expect(leapBody.transactionCount).toBe(1);

    // Query non-leap month 2025-02: end date should be 2025-02-28
    const nonLeapRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2025-02",
      headers: authHeadersA,
    });
    expect(nonLeapRes.statusCode).toBe(200);
    const nonLeapBody = nonLeapRes.json();
    expect(nonLeapBody.startDate).toBe("2025-02-01");
    expect(nonLeapBody.endDate).toBe("2025-02-28");
  });

  it("13. validates budget deletion, returns 404 on missing, and enforces tenant isolation", async () => {
    // Attempt deletion with malformed month -> 400
    const badMonthRes = await app.inject({
      method: "DELETE",
      url: "/api/expenses/budget?month=invalid-month",
      headers: authHeadersA,
    });
    expect(badMonthRes.statusCode).toBe(400);

    // Attempt deletion of non-existent budget for User A -> 404
    const notFoundRes = await app.inject({
      method: "DELETE",
      url: "/api/expenses/budget?month=2025-06",
      headers: authHeadersA,
    });
    expect(notFoundRes.statusCode).toBe(404);
    expect(notFoundRes.json().code).toBe("NOT_FOUND");

    // Attempt deletion of User A's November budget by User B -> 404 (User B doesn't own it)
    const crossDeleteRes = await app.inject({
      method: "DELETE",
      url: "/api/expenses/budget?month=2026-11",
      headers: authHeadersB,
    });
    expect(crossDeleteRes.statusCode).toBe(404);
  });

  it("14. deletes monthly budget, returns empty state, and preserves all expense records", async () => {
    // Verify User A has 2 expenses in October 2026 totaling 700000 paise
    const preSummaryRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });
    expect(preSummaryRes.json().budgetAmountCents).toBe(1000000);
    expect(preSummaryRes.json().spentAmountCents).toBe(700000);

    // Delete User A's October budget
    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);
    expect(delRes.json().month).toBe("2026-10");

    // Fetch budget summary again: should now be unconfigured empty state
    const postSummaryRes = await app.inject({
      method: "GET",
      url: "/api/expenses/budget?month=2026-10",
      headers: authHeadersA,
    });
    expect(postSummaryRes.statusCode).toBe(200);
    const postBody = postSummaryRes.json();
    expect(postBody.budget).toBeNull();
    expect(postBody.budgetAmountCents).toBeNull();

    // CRITICAL: Recorded expenses must NOT be deleted!
    expect(postBody.spentAmountCents).toBe(700000);
    expect(postBody.transactionCount).toBe(2);
  });
});
