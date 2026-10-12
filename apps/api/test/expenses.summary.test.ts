import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { expenses, users } from "../src/db/schema.js";

describe("Milestone 5.7: Expenses Spending Summary & Category Aggregations", () => {
  let app: FastifyInstance;

  const userAEmail = `expenses_summary_usera_${Date.now()}@example.com`;
  const userBEmail = `expenses_summary_userb_${Date.now()}@example.com`;
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
        name: "Alice Summary",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Summary",
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

    // Seed User A expenses across different dates and categories
    await db.insert(expenses).values([
      // Inside target period (2026-10-01 to 2026-10-31)
      {
        userId: userAId,
        amountCents: 5000, // $50.00
        date: "2026-10-02",
        categoryId: "food",
        description: "Dinner out",
      },
      {
        userId: userAId,
        amountCents: 2500, // $25.00
        date: "2026-10-15",
        categoryId: "food",
        description: "Groceries",
      },
      {
        userId: userAId,
        amountCents: 10000, // $100.00
        date: "2026-10-10",
        categoryId: "housing",
        description: "Electricity bill",
      },
      {
        userId: userAId,
        amountCents: 2500, // $25.00
        date: "2026-10-20",
        categoryId: "transport",
        description: "Gas fill-up",
      },
      // Outside target period (before Oct 1)
      {
        userId: userAId,
        amountCents: 8000,
        date: "2026-09-28",
        categoryId: "food",
        description: "Past month food",
      },
      // Outside target period (after Oct 31)
      {
        userId: userAId,
        amountCents: 6000,
        date: "2026-11-05",
        categoryId: "entertainment",
        description: "Future concert",
      },
    ]);

    // Seed User B expenses during same period
    await db.insert(expenses).values([
      {
        userId: userBId,
        amountCents: 99999,
        date: "2026-10-10",
        categoryId: "shopping",
        description: "Bob private purchase",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(expenses).where(eq(expenses.userId, userAId));
    await db.delete(expenses).where(eq(expenses.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. AUTHENTICATION & VALIDATION
  // ==========================================
  describe("Authentication & Input Validation", () => {
    it("1. rejects unauthenticated summary requests with HTTP 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2026-10-01&endDate=2026-10-31",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("2. rejects missing startDate or endDate with HTTP 400 VALIDATION_ERROR", async () => {
      const resMissingEnd = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2026-10-01",
        headers: { cookie: userACookie },
      });
      expect(resMissingEnd.statusCode).toBe(400);
      expect(resMissingEnd.json().code).toBe("VALIDATION_ERROR");

      const resMissingStart = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?endDate=2026-10-31",
        headers: { cookie: userACookie },
      });
      expect(resMissingStart.statusCode).toBe(400);
      expect(resMissingStart.json().code).toBe("VALIDATION_ERROR");
    });

    it("3. rejects invalid date formats with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=10-01-2026&endDate=2026-10-31",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("4. rejects inverted date range (startDate > endDate) with HTTP 400 INVALID_PERIOD", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2026-10-31&endDate=2026-10-01",
        headers: { cookie: userACookie },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_PERIOD");
    });
  });

  // ==========================================
  // 2. PERIOD AGGREGATION & CATEGORY BREAKDOWN
  // ==========================================
  describe("Period Aggregation & Mathematical Precision", () => {
    it("5. computes accurate period totals and category breakdown for October 2026", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2026-10-01&endDate=2026-10-31",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data.startDate).toBe("2026-10-01");
      expect(data.endDate).toBe("2026-10-31");

      // Expected total: $50 + $25 + $100 + $25 = $200 = 20000 cents
      expect(data.totalAmountCents).toBe(20000);
      expect(data.transactionCount).toBe(4);

      // Verify category breakdown is sorted by spend descending:
      // 1. housing: 10000 cents (50.0%)
      // 2. food: 7500 cents (37.5%)
      // 3. transport: 2500 cents (12.5%)
      expect(data.byCategory.length).toBe(3);

      expect(data.byCategory[0]).toEqual({
        categoryId: "housing",
        totalAmountCents: 10000,
        transactionCount: 1,
        percentage: 50,
      });

      expect(data.byCategory[1]).toEqual({
        categoryId: "food",
        totalAmountCents: 7500,
        transactionCount: 2,
        percentage: 37.5,
      });

      expect(data.byCategory[2]).toEqual({
        categoryId: "transport",
        totalAmountCents: 2500,
        transactionCount: 1,
        percentage: 12.5,
      });

      // Sum of percentages equals exactly 100.0%
      const sumPercentage = data.byCategory.reduce(
        (acc: number, item: any) => acc + item.percentage,
        0
      );
      expect(sumPercentage).toBe(100);
    });

    it("6. strictly excludes transactions falling outside the requested date range", async () => {
      // Query narrow window: 2026-10-01 to 2026-10-05 (only the $50.00 food expense on 2026-10-02)
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2026-10-01&endDate=2026-10-05",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data.totalAmountCents).toBe(5000);
      expect(data.transactionCount).toBe(1);
      expect(data.byCategory.length).toBe(1);
      expect(data.byCategory[0]).toEqual({
        categoryId: "food",
        totalAmountCents: 5000,
        transactionCount: 1,
        percentage: 100,
      });
    });

    it("7. handles periods with zero expenses cleanly without NaN or division by zero", async () => {
      // Query empty window: 2025-01-01 to 2025-01-31
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2025-01-01&endDate=2025-01-31",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data.totalAmountCents).toBe(0);
      expect(data.transactionCount).toBe(0);
      expect(data.byCategory).toEqual([]);
    });
  });

  // ==========================================
  // 3. MULTI-TENANT ISOLATION
  // ==========================================
  describe("Multi-Tenant Isolation", () => {
    it("8. guarantees User B's summary reflects only User B's expenses with zero crosstalk", async () => {
      const resB = await app.inject({
        method: "GET",
        url: "/api/expenses/summary?startDate=2026-10-01&endDate=2026-10-31",
        headers: { cookie: userBCookie },
      });

      expect(resB.statusCode).toBe(200);
      const dataB = resB.json();

      // User B has only 1 expense: $999.99 shopping
      expect(dataB.totalAmountCents).toBe(99999);
      expect(dataB.transactionCount).toBe(1);
      expect(dataB.byCategory).toEqual([
        {
          categoryId: "shopping",
          totalAmountCents: 99999,
          transactionCount: 1,
          percentage: 100,
        },
      ]);
    });
  });
});
