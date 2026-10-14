import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { expenses, users } from "../src/db/schema.js";
import { listExpensesQuerySchema } from "../src/expenses/expense.schema.js";
import {
  MonetaryAggregateError,
  parseSafeMonetaryAggregate,
} from "../src/routes/expense.routes.js";

describe("Milestone 5.6: Expenses CRUD API & Tenant Isolation Suite", () => {
  let app: FastifyInstance;

  const userAEmail = `expenses_api_usera_${Date.now()}@example.com`;
  const userBEmail = `expenses_api_userb_${Date.now()}@example.com`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  const ORIGIN = "http://localhost:5173";
  let authHeadersA: { cookie: string; origin: string };
  let authHeadersB: { cookie: string; origin: string };

  const nonExistentUuid = "00000000-0000-4000-a000-000000000000";

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Expenses",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Expenses",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

    // Login user A to obtain session cookie
    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password: plainPassword },
    });
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    userACookie = (rawCookieA as string).split(";")[0]!;
    authHeadersA = { cookie: userACookie, origin: ORIGIN };

    // Login user B to obtain session cookie
    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password: plainPassword },
    });
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    userBCookie = (rawCookieB as string).split(";")[0]!;
    authHeadersB = { cookie: userBCookie, origin: ORIGIN };
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
  // 1. AUTHENTICATION ENFORCEMENT
  // ==========================================
  describe("Authentication Enforcement", () => {
    it("1. rejects unauthenticated requests with HTTP 401", async () => {
      const endpoints = [
        { method: "GET" as const, url: "/api/expenses" },
        { method: "POST" as const, url: "/api/expenses" },
        { method: "GET" as const, url: `/api/expenses/${nonExistentUuid}` },
        { method: "PATCH" as const, url: `/api/expenses/${nonExistentUuid}` },
        { method: "DELETE" as const, url: `/api/expenses/${nonExistentUuid}` },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe("UNAUTHENTICATED");
      }
    });
  });

  // ==========================================
  // 2. CREATE EXPENSE (POST /api/expenses)
  // ==========================================
  describe("POST /api/expenses — Create Expense", () => {
    it("2. creates an expense successfully with valid payload (HTTP 201)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 4250,
          date: "2026-10-12",
          categoryId: "food",
          description: "Whole Foods groceries",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.expense).toBeDefined();
      expect(data.expense.id).toBeDefined();
      expect(data.expense.userId).toBe(userAId);
      expect(data.expense.amountCents).toBe(4250);
      expect(data.expense.date).toBe("2026-10-12");
      expect(data.expense.categoryId).toBe("food");
      expect(data.expense.description).toBe("Whole Foods groceries");
      expect(data.expense.createdAt).toBeDefined();
      expect(data.expense.updatedAt).toBeDefined();
    });

    it("3. creates an expense with optional null description", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 1500,
          date: "2026-10-11",
          categoryId: "transport",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.expense.amountCents).toBe(1500);
      expect(data.expense.description).toBeNull();
    });

    it("4. rejects zero or negative amountCents with HTTP 400 VALIDATION_ERROR", async () => {
      const resZero = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 0,
          date: "2026-10-12",
          categoryId: "food",
        },
      });
      expect(resZero.statusCode).toBe(400);
      expect(resZero.json().code).toBe("VALIDATION_ERROR");

      const resNegative = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: -1250,
          date: "2026-10-12",
          categoryId: "food",
        },
      });
      expect(resNegative.statusCode).toBe(400);
      expect(resNegative.json().code).toBe("VALIDATION_ERROR");
    });

    it("5. rejects invalid categoryId with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 2000,
          date: "2026-10-12",
          categoryId: "cryptocurrency_speculation",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("6. rejects malformed date format with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 2000,
          date: "12-10-2026",
          categoryId: "food",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("7. rejects description exceeding 500 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 2000,
          date: "2026-10-12",
          categoryId: "food",
          description: "x".repeat(501),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 3. LIST EXPENSES (GET /api/expenses)
  // ==========================================
  describe("GET /api/expenses — List & Filter", () => {
    let expenseA1Id: string;
    let expenseA2Id: string;
    let expenseA3Id: string;

    beforeAll(async () => {
      // Clear existing expenses for deterministic testing
      await db.delete(expenses).where(eq(expenses.userId, userAId));
      await db.delete(expenses).where(eq(expenses.userId, userBId));

      // Seed User A expenses
      const [e1] = await db
        .insert(expenses)
        .values({
          userId: userAId,
          amountCents: 5000,
          date: "2026-10-05",
          categoryId: "housing",
          description: "Home internet bill",
        })
        .returning();
      expenseA1Id = e1.id;

      const [e2] = await db
        .insert(expenses)
        .values({
          userId: userAId,
          amountCents: 3500,
          date: "2026-10-10",
          categoryId: "food",
          description: "Italian dinner",
        })
        .returning();
      expenseA2Id = e2.id;

      const [e3] = await db
        .insert(expenses)
        .values({
          userId: userAId,
          amountCents: 1200,
          date: "2026-10-12",
          categoryId: "food",
          description: "Coffee and croissant",
        })
        .returning();
      expenseA3Id = e3.id;

      // Seed User B expense for tenant isolation
      await db.insert(expenses).values({
        userId: userBId,
        amountCents: 9999,
        date: "2026-10-10",
        categoryId: "shopping",
        description: "User B Secret Expense",
      });
    });

    it("8. lists expenses ordered by date DESC and strictly scoped to current user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(3);
      expect(data.expenses.length).toBe(3);
      // Newest date first
      expect(data.expenses[0].id).toBe(expenseA3Id); // 2026-10-12
      expect(data.expenses[1].id).toBe(expenseA2Id); // 2026-10-10
      expect(data.expenses[2].id).toBe(expenseA1Id); // 2026-10-05
      // Zero leakage of User B's expense
      expect(data.expenses.every((e: any) => e.userId === userAId)).toBe(true);
    });

    it("9. filters expenses by date range (startDate & endDate)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?startDate=2026-10-08&endDate=2026-10-11",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(1);
      expect(data.expenses.length).toBe(1);
      expect(data.expenses[0].id).toBe(expenseA2Id); // 2026-10-10
    });

    it("10. filters expenses by categoryId", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?categoryId=housing",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(1);
      expect(data.expenses[0].categoryId).toBe("housing");
      expect(data.expenses[0].id).toBe(expenseA1Id);
    });

    it("11. filters expenses by search text matching description", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?search=dinner",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(1);
      expect(data.expenses[0].description).toBe("Italian dinner");
    });

    it("12. respects pagination parameters limit and offset", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=1&offset=1",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(3); // Total count remains 3
      expect(data.expenses.length).toBe(1);
      expect(data.expenses[0].id).toBe(expenseA2Id); // 2nd item
    });

    it("12a. applies default limit (50) and offset (0) when omitted", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(3);
      expect(data.expenses.length).toBe(3);
    });

    it("12b. accepts maximum permitted limit (200)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=200&offset=0",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.expenses.length).toBe(3);
    });

    it("12c. rejects malformed string pagination parameters (limit=abc, offset=abc) with HTTP 400 VALIDATION_ERROR", async () => {
      const resLimit = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=abc",
        headers: authHeadersA,
      });
      expect(resLimit.statusCode).toBe(400);
      const bodyLimit = resLimit.json();
      expect(bodyLimit.code).toBe("VALIDATION_ERROR");
      expect(bodyLimit.details[0].field).toBe("limit");
      expect(bodyLimit.details[0].message).toBe("Limit must be a valid integer");

      const resOffset = await app.inject({
        method: "GET",
        url: "/api/expenses?offset=abc",
        headers: authHeadersA,
      });
      expect(resOffset.statusCode).toBe(400);
      const bodyOffset = resOffset.json();
      expect(bodyOffset.code).toBe("VALIDATION_ERROR");
      expect(bodyOffset.details[0].field).toBe("offset");
      expect(bodyOffset.details[0].message).toBe("Offset must be a valid integer");
    });

    it("12d. rejects empty string pagination parameters with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=",
        headers: authHeadersA,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");

      const resOffset = await app.inject({
        method: "GET",
        url: "/api/expenses?offset=",
        headers: authHeadersA,
      });
      expect(resOffset.statusCode).toBe(400);
      expect(resOffset.json().code).toBe("VALIDATION_ERROR");
    });

    it("12e. rejects decimal pagination parameters (limit=1.5, offset=2.5) with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=1.5",
        headers: authHeadersA,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");

      const resOffset = await app.inject({
        method: "GET",
        url: "/api/expenses?offset=2.5",
        headers: authHeadersA,
      });
      expect(resOffset.statusCode).toBe(400);
      expect(resOffset.json().code).toBe("VALIDATION_ERROR");
    });

    it("12f. rejects zero or negative limit and negative offset with HTTP 400 VALIDATION_ERROR", async () => {
      const resZero = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=0",
        headers: authHeadersA,
      });
      expect(resZero.statusCode).toBe(400);
      expect(resZero.json().details[0].message).toBe("Limit must be at least 1");

      const resNeg = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=-10",
        headers: authHeadersA,
      });
      expect(resNeg.statusCode).toBe(400);
      expect(resNeg.json().details[0].message).toBe("Limit must be at least 1");

      const resNegOffset = await app.inject({
        method: "GET",
        url: "/api/expenses?offset=-5",
        headers: authHeadersA,
      });
      expect(resNegOffset.statusCode).toBe(400);
      expect(resNegOffset.json().details[0].message).toBe("Offset cannot be negative");
    });

    it("12g. rejects limit exceeding maximum permitted value (limit=201) with HTTP 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses?limit=201",
        headers: authHeadersA,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().details[0].message).toBe("Limit cannot exceed 200");
    });

    it("12h. validates schema boundaries directly without producing NaN", () => {
      // Default fallback verification
      const defaultParsed = listExpensesQuerySchema.parse({});
      expect(defaultParsed.limit).toBe(50);
      expect(defaultParsed.offset).toBe(0);

      // Boundaries
      expect(listExpensesQuerySchema.parse({ limit: "1" }).limit).toBe(1);
      expect(listExpensesQuerySchema.parse({ limit: "200" }).limit).toBe(200);
      expect(listExpensesQuerySchema.parse({ offset: "0" }).offset).toBe(0);
      expect(listExpensesQuerySchema.parse({ offset: "999" }).offset).toBe(999);

      // Malformed inputs never return NaN and always fail safeParse
      expect(listExpensesQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ offset: "abc" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ offset: "" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "1.5" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "-1" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "Infinity" }).success).toBe(false);
      expect(listExpensesQuerySchema.safeParse({ limit: "NaN" }).success).toBe(false);
    });
  });

  // ==========================================
  // 4. GET SINGLE EXPENSE (GET /api/expenses/:id)
  // ==========================================
  describe("GET /api/expenses/:id — Single Expense & IDOR Protection", () => {
    let userAExpenseId: string;

    beforeAll(async () => {
      const [created] = await db
        .insert(expenses)
        .values({
          userId: userAId,
          amountCents: 2500,
          date: "2026-10-12",
          categoryId: "entertainment",
          description: "Movie tickets",
        })
        .returning();
      userAExpenseId = created.id;
    });

    it("13. retrieves single expense for owner with HTTP 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/expenses/${userAExpenseId}`,
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.expense.id).toBe(userAExpenseId);
      expect(data.expense.amountCents).toBe(2500);
    });

    it("14. returns HTTP 404 NOT_FOUND for non-existent expense ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/expenses/${nonExistentUuid}`,
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("15. returns HTTP 404 NOT_FOUND when User B attempts to access User A expense (IDOR immunity)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/expenses/${userAExpenseId}`,
        headers: authHeadersB,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("16. returns HTTP 400 INVALID_ID for malformed UUID param", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/expenses/not-a-uuid",
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ID");
    });
  });

  // ==========================================
  // 5. UPDATE EXPENSE (PATCH /api/expenses/:id)
  // ==========================================
  describe("PATCH /api/expenses/:id — Update Expense", () => {
    let expenseToUpdateId: string;

    beforeAll(async () => {
      const [created] = await db
        .insert(expenses)
        .values({
          userId: userAId,
          amountCents: 3000,
          date: "2026-10-09",
          categoryId: "shopping",
          description: "New shoes",
        })
        .returning();
      expenseToUpdateId = created.id;
    });

    it("17. updates amount and category successfully with HTTP 200", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/expenses/${expenseToUpdateId}`,
        headers: authHeadersA,
        payload: {
          amountCents: 3500,
          categoryId: "other",
          description: "Sneakers on sale",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.expense.id).toBe(expenseToUpdateId);
      expect(data.expense.amountCents).toBe(3500);
      expect(data.expense.categoryId).toBe("other");
      expect(data.expense.description).toBe("Sneakers on sale");
    });

    it("18. rejects empty update payload with HTTP 400", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/expenses/${expenseToUpdateId}`,
        headers: authHeadersA,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("19. rejects invalid update data (negative amount) with HTTP 400", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/expenses/${expenseToUpdateId}`,
        headers: authHeadersA,
        payload: { amountCents: -50 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("20. returns HTTP 404 when User B attempts to mutate User A expense", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/expenses/${expenseToUpdateId}`,
        headers: authHeadersB,
        payload: { amountCents: 100 },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 6. DELETE EXPENSE (DELETE /api/expenses/:id)
  // ==========================================
  describe("DELETE /api/expenses/:id — Delete Expense", () => {
    let expenseToDeleteId: string;

    beforeAll(async () => {
      const [created] = await db
        .insert(expenses)
        .values({
          userId: userAId,
          amountCents: 800,
          date: "2026-10-12",
          categoryId: "food",
          description: "Temporary snack",
        })
        .returning();
      expenseToDeleteId = created.id;
    });

    it("21. returns HTTP 404 when User B attempts to delete User A expense", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/expenses/${expenseToDeleteId}`,
        headers: authHeadersB,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("22. successfully deletes owner's expense with HTTP 200", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/expenses/${expenseToDeleteId}`,
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      // Verify row is physically gone from database
      const [found] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseToDeleteId));
      expect(found).toBeUndefined();
    });

    it("23. returns HTTP 404 when attempting to delete already deleted expense", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/expenses/${expenseToDeleteId}`,
        headers: authHeadersA,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // F-02: MONETARY AGGREGATE OVERFLOW & CONVERSION SAFETY
  // ==========================================
  describe("F-02: Monetary Aggregate Overflow & Conversion Safety", () => {
    describe("parseSafeMonetaryAggregate conversion unit safety", () => {
      it("accepts zero as number, string, null, and undefined", () => {
        expect(parseSafeMonetaryAggregate(0)).toBe(0);
        expect(parseSafeMonetaryAggregate("0")).toBe(0);
        expect(parseSafeMonetaryAggregate(null)).toBe(0);
        expect(parseSafeMonetaryAggregate(undefined)).toBe(0);
      });

      it("accepts valid values above the 32-bit integer limit (2,147,483,647)", () => {
        expect(parseSafeMonetaryAggregate("2147483648")).toBe(2147483648);
        expect(parseSafeMonetaryAggregate("2500000000")).toBe(2500000000);
      });

      it("accepts a value at Number.MAX_SAFE_INTEGER", () => {
        expect(parseSafeMonetaryAggregate(String(Number.MAX_SAFE_INTEGER))).toBe(
          Number.MAX_SAFE_INTEGER
        );
      });

      it("rejects values above Number.MAX_SAFE_INTEGER", () => {
        const beyondMaxSafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
        expect(() => parseSafeMonetaryAggregate(beyondMaxSafe.toString())).toThrow(
          MonetaryAggregateError
        );
      });

      it("rejects invalid, negative, or malformed aggregate text", () => {
        expect(() => parseSafeMonetaryAggregate("not-a-number")).toThrow(
          MonetaryAggregateError
        );
        expect(() => parseSafeMonetaryAggregate("-100")).toThrow(
          MonetaryAggregateError
        );
        expect(() => parseSafeMonetaryAggregate("12.34")).toThrow(
          MonetaryAggregateError
        );
        expect(() => parseSafeMonetaryAggregate("Infinity")).toThrow(
          MonetaryAggregateError
        );
        expect(() => parseSafeMonetaryAggregate("NaN")).toThrow(
          MonetaryAggregateError
        );
        expect(() => parseSafeMonetaryAggregate("")).toThrow(
          MonetaryAggregateError
        );
      });
    });

    it("aggregates expense summary totals exceeding 2,147,483,647 paise without 32-bit overflow", async () => {
      const startDate = "2029-02-01";
      const endDate = "2029-02-28";
      const categoryId = "shopping";

      // Expense A: 1,500,000,000 paise
      const resA = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 1500000000,
          date: "2029-02-10",
          categoryId,
          description: "High value expense A",
        },
      });
      expect(resA.statusCode).toBe(201);

      // Expense B: 1,000,000,000 paise
      const resB = await app.inject({
        method: "POST",
        url: "/api/expenses",
        headers: authHeadersA,
        payload: {
          amountCents: 1000000000,
          date: "2029-02-15",
          categoryId,
          description: "High value expense B",
        },
      });
      expect(resB.statusCode).toBe(201);

      // Query GET /api/expenses/summary
      const summaryRes = await app.inject({
        method: "GET",
        url: `/api/expenses/summary?startDate=${startDate}&endDate=${endDate}`,
        headers: authHeadersA,
      });

      expect(summaryRes.statusCode).toBe(200);
      const data = summaryRes.json();
      expect(data.startDate).toBe(startDate);
      expect(data.endDate).toBe(endDate);
      expect(typeof data.totalAmountCents).toBe("number");
      expect(data.totalAmountCents).toBe(2500000000);
      expect(data.transactionCount).toBe(2);

      const matchingCategory = data.byCategory.find(
        (c: { categoryId: string }) => c.categoryId === categoryId
      );
      expect(matchingCategory).toBeDefined();
      expect(typeof matchingCategory.totalAmountCents).toBe("number");
      expect(matchingCategory.totalAmountCents).toBe(2500000000);
      expect(matchingCategory.transactionCount).toBe(2);
      expect(matchingCategory.percentage).toBe(100);
    });
  });
});
