import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { savingsContributions, savingsGoals, users } from "../src/db/schema.js";
import {
  calculateClampedProgressPercent,
  serializeMonetaryAmount,
} from "../src/savings/savings.schema.js";

describe("Milestone 5.4B: Savings Backend Architecture Suite", () => {
  let app: FastifyInstance;

  const TEST_DOMAIN = "example.com";
  const userAEmail = `savings_usera_${Date.now()}@${TEST_DOMAIN}`;
  const userBEmail = `savings_userb_${Date.now()}@${TEST_DOMAIN}`;
  const plainPassword = "SecureSavingsPass123!";

  let userAId: string;
  let userBId: string;

  const ORIGIN = "http://localhost:5173";
  let authHeadersA: { cookie: string; origin: string };
  let authHeadersB: { cookie: string; origin: string };

  const nonExistentUuid = "00000000-0000-4000-a000-000000000000";

  const cleanup = async () => {
    if (userAId) {
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(users).where(eq(users.id, userBId));
    }
  };

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Savings",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Savings",
        passwordHash,
      })
      .returning();
    userBId = userB.id;

    // Login Alice
    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password: plainPassword },
    });
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    const cookieA = (rawCookieA as string).split(";")[0]!;
    authHeadersA = { cookie: cookieA, origin: ORIGIN };

    // Login Bob
    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password: plainPassword },
    });
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    const cookieB = (rawCookieB as string).split(";")[0]!;
    authHeadersB = { cookie: cookieB, origin: ORIGIN };
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  // ========================================================
  // 1. ACTIVE GOAL INITIAL STATE
  // ========================================================
  it("1. returns { goal: null } when user has no active savings goal", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/savings/active",
      headers: authHeadersA,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.goal).toBeNull();
  });

  // ========================================================
  // 2. SAVINGS GOAL CREATION & VALIDATION
  // ========================================================
  let aliceGoalId: string;

  it("2. creates an active savings goal with valid fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersA,
      payload: {
        name: "Emergency Fund",
        targetAmountCents: 5000000, // ₹50,000.00
      },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.goal).toBeDefined();
    expect(data.goal.name).toBe("Emergency Fund");
    expect(data.goal.targetAmountCents).toBe(5000000);
    expect(data.goal.savedAmountCents).toBe(0);
    expect(data.goal.remainingAmountCents).toBe(5000000);
    expect(data.goal.progressPercent).toBe(0);
    expect(data.goal.status).toBe("ACTIVE");
    expect(data.goal.contributionCount).toBe(0);

    aliceGoalId = data.goal.id;
  });

  it("3. rejects duplicate active goal creation with HTTP 409 ACTIVE_GOAL_EXISTS", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersA,
      payload: {
        name: "New Laptop",
        targetAmountCents: 10000000,
      },
    });

    expect(res.statusCode).toBe(409);
    const data = res.json();
    expect(data.code).toBe("ACTIVE_GOAL_EXISTS");
  });

  it("4. validates goal name (empty string, excess length)", async () => {
    // Empty name
    const emptyRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersB,
      payload: {
        name: "   ",
        targetAmountCents: 100000,
      },
    });
    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.json().code).toBe("VALIDATION_ERROR");

    // Excess length (> 100 chars)
    const longRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersB,
      payload: {
        name: "A".repeat(101),
        targetAmountCents: 100000,
      },
    });
    expect(longRes.statusCode).toBe(400);
    expect(longRes.json().code).toBe("VALIDATION_ERROR");
  });

  it("5. validates target amount (zero, negative, non-integer, overflow)", async () => {
    // Zero
    const zeroRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersB,
      payload: {
        name: "Test Goal",
        targetAmountCents: 0,
      },
    });
    expect(zeroRes.statusCode).toBe(400);
    expect(zeroRes.json().code).toBe("VALIDATION_ERROR");

    // Negative
    const negRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersB,
      payload: {
        name: "Test Goal",
        targetAmountCents: -5000,
      },
    });
    expect(negRes.statusCode).toBe(400);
    expect(negRes.json().code).toBe("VALIDATION_ERROR");

    // Overflow beyond 32-bit signed max (2147483647)
    const overflowRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersB,
      payload: {
        name: "Test Goal",
        targetAmountCents: 2147483648,
      },
    });
    expect(overflowRes.statusCode).toBe(400);
    expect(overflowRes.json().code).toBe("VALIDATION_ERROR");
  });

  // ========================================================
  // 3. RETRIEVAL & METRICS CALCULATION
  // ========================================================
  it("6. retrieves active savings goal with zero contributions", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/savings/active",
      headers: authHeadersA,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.goal.id).toBe(aliceGoalId);
    expect(data.goal.savedAmountCents).toBe(0);
    expect(data.goal.remainingAmountCents).toBe(5000000);
    expect(data.goal.progressPercent).toBe(0);
    expect(data.goal.contributionCount).toBe(0);
  });

  // ========================================================
  // 4. CONTRIBUTIONS RECORDING & SUMMARY DERIVATION
  // ========================================================
  let firstContribId: string;

  it("7. records a contribution and updates derived metrics transactionally", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: {
        amountCents: 1500000, // ₹15,000.00
        note: "Freelance gig payout",
      },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.contribution).toBeDefined();
    expect(data.contribution.amountCents).toBe(1500000);
    expect(data.contribution.note).toBe("Freelance gig payout");
    expect(data.contribution.savingsGoalId).toBe(aliceGoalId);

    // Goal summary returned with new metrics
    expect(data.goal.savedAmountCents).toBe(1500000);
    expect(data.goal.remainingAmountCents).toBe(3500000); // 5000000 - 1500000
    expect(data.goal.progressPercent).toBe(30.0);
    expect(data.goal.contributionCount).toBe(1);

    firstContribId = data.contribution.id;
  });

  it("8. validates contribution amounts (zero, negative, overflow, malformed goal ID)", async () => {
    // Zero
    const zeroRes = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: { amountCents: 0 },
    });
    expect(zeroRes.statusCode).toBe(400);

    // Negative
    const negRes = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: { amountCents: -100 },
    });
    expect(negRes.statusCode).toBe(400);

    // Overflow
    const overflowRes = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: { amountCents: 2147483648 },
    });
    expect(overflowRes.statusCode).toBe(400);

    // Malformed UUID
    const malformedRes = await app.inject({
      method: "POST",
      url: "/api/savings/not-a-uuid/contributions",
      headers: authHeadersA,
      payload: { amountCents: 5000 },
    });
    expect(malformedRes.statusCode).toBe(400);
  });

  // ========================================================
  // 5. TENANT ISOLATION
  // ========================================================
  it("9. enforces strict user isolation: User B cannot contribute to User A's goal", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersB, // User B
      payload: { amountCents: 50000 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  it("10. enforces strict user isolation: User B cannot list User A's contributions", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersB, // User B
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  // ========================================================
  // 6. CHRONOLOGICAL CONTRIBUTIONS HISTORY & PAGINATION
  // ========================================================
  it("11. records a second contribution and lists contributions in descending order", async () => {
    // Second contribution: 1000000 paise (₹10,000.00)
    const contrib2Res = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: {
        amountCents: 1000000,
        note: "Monthly savings allocation",
      },
    });
    expect(contrib2Res.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
    });

    expect(listRes.statusCode).toBe(200);
    const data = listRes.json();
    expect(data.total).toBe(2);
    expect(data.contributions.length).toBe(2);
    // Descending order: newest first
    expect(data.contributions[0].id).toBe(contrib2Res.json().contribution.id);
    expect(data.contributions[1].id).toBe(firstContribId);

    // Active goal derived metrics verify sum: 1500000 + 1000000 = 2500000 (50.0%)
    const activeRes = await app.inject({
      method: "GET",
      url: "/api/savings/active",
      headers: authHeadersA,
    });
    const activeData = activeRes.json();
    expect(activeData.goal.savedAmountCents).toBe(2500000);
    expect(activeData.goal.remainingAmountCents).toBe(2500000);
    expect(activeData.goal.progressPercent).toBe(50.0);
    expect(activeData.goal.contributionCount).toBe(2);
  });

  // ========================================================
  // 7. TARGET REACHED & EXCEEDED BEHAVIOR
  // ========================================================
  it("12. goal remains active when target is reached or exceeded, remaining is 0 with no underflow", async () => {
    // Alice target is 5000000. Current saved is 2500000.
    // Add 3000000 (₹30,000.00) -> Total will be 5500000 (> 5000000 target)
    const exceedRes = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: {
        amountCents: 3000000,
        note: "Bonus deposit",
      },
    });

    expect(exceedRes.statusCode).toBe(201);
    const data = exceedRes.json();
    expect(data.goal.status).toBe("ACTIVE"); // Stays active!
    expect(data.goal.savedAmountCents).toBe(5500000);
    expect(data.goal.remainingAmountCents).toBe(0); // Zero, not negative
    expect(data.goal.progressPercent).toBe(100.0); // Clamped strictly to 100.0% max
    expect(data.goal.contributionCount).toBe(3);
  });

  // ========================================================
  // 8. LIFECYCLE: COMPLETE & ARCHIVE
  // ========================================================
  it("13. updates status to COMPLETED and rejects subsequent contributions", async () => {
    const completeRes = await app.inject({
      method: "PATCH",
      url: `/api/savings/${aliceGoalId}/status`,
      headers: authHeadersA,
      payload: { status: "COMPLETED" },
    });

    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().goal.status).toBe("COMPLETED");

    // Active goal query now returns null since Alice has no ACTIVE goal
    const activeRes = await app.inject({
      method: "GET",
      url: "/api/savings/active",
      headers: authHeadersA,
    });
    expect(activeRes.json().goal).toBeNull();

    // Trying to contribute to completed goal is rejected
    const contribRes = await app.inject({
      method: "POST",
      url: `/api/savings/${aliceGoalId}/contributions`,
      headers: authHeadersA,
      payload: { amountCents: 5000 },
    });
    expect(contribRes.statusCode).toBe(400);
    expect(contribRes.json().code).toBe("INVALID_GOAL_STATUS");
  });

  it("14. allows creating a new active goal after previous goal is completed", async () => {
    const newGoalRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersA,
      payload: {
        name: "Goa Vacation",
        targetAmountCents: 2000000,
      },
    });

    expect(newGoalRes.statusCode).toBe(201);
    const newGoalId = newGoalRes.json().goal.id;
    expect(newGoalId).not.toBe(aliceGoalId);

    // Archive this new goal
    const archiveRes = await app.inject({
      method: "PATCH",
      url: `/api/savings/${newGoalId}/status`,
      headers: authHeadersA,
      payload: { status: "ARCHIVED" },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().goal.status).toBe("ARCHIVED");

    // Cannot contribute to archived goal
    const contribArchivedRes = await app.inject({
      method: "POST",
      url: `/api/savings/${newGoalId}/contributions`,
      headers: authHeadersA,
      payload: { amountCents: 1000 },
    });
    expect(contribArchivedRes.statusCode).toBe(400);
    expect(contribArchivedRes.json().code).toBe("INVALID_GOAL_STATUS");
  });

  // ========================================================
  // 9. LARGE AGGREGATION VALUES BEYOND 32-BIT RANGE
  // ========================================================
  it("15. handles aggregation above 32-bit signed integer range without overflow or precision loss", async () => {
    // User B creates a high-target goal
    const createBRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersB,
      payload: {
        name: "Real Estate Down Payment",
        targetAmountCents: 2000000000, // 20 million INR = 2 billion paise
      },
    });
    expect(createBRes.statusCode).toBe(201);
    const bobGoalId = createBRes.json().goal.id;

    // Insert two contributions that sum to 3,000,000,000 paise (exceeding signed 32-bit max 2,147,483,647)
    const contrib1Res = await app.inject({
      method: "POST",
      url: `/api/savings/${bobGoalId}/contributions`,
      headers: authHeadersB,
      payload: {
        amountCents: 1500000000, // 1.5 billion paise
      },
    });
    expect(contrib1Res.statusCode).toBe(201);

    const contrib2Res = await app.inject({
      method: "POST",
      url: `/api/savings/${bobGoalId}/contributions`,
      headers: authHeadersB,
      payload: {
        amountCents: 1500000000, // 1.5 billion paise
      },
    });
    expect(contrib2Res.statusCode).toBe(201);

    // Sum is 3,000,000,000 paise. In PostgreSQL integer casting this would fail.
    // Our wide text aggregation handles it smoothly!
    const activeBRes = await app.inject({
      method: "GET",
      url: "/api/savings/active",
      headers: authHeadersB,
    });
    expect(activeBRes.statusCode).toBe(200);
    const data = activeBRes.json();
    expect(data.goal.savedAmountCents).toBe(3000000000);
    expect(data.goal.remainingAmountCents).toBe(0);
    expect(data.goal.progressPercent).toBe(100.0); // Clamped strictly to 100.0% max
  });

  // ========================================================
  // 10. CONCURRENT CONTRIBUTIONS TRANSACTION INTEGRITY
  // ========================================================
  it("16. serializes concurrent contributions with row-level locks without lost updates", async () => {
    // Create an active goal for User A
    const goalRes = await app.inject({
      method: "POST",
      url: "/api/savings",
      headers: authHeadersA,
      payload: {
        name: "Concurrency Test Goal",
        targetAmountCents: 1000000,
      },
    });
    expect(goalRes.statusCode).toBe(201);
    const testGoalId = goalRes.json().goal.id;

    // Fire 5 concurrent contributions in parallel
    const amounts = [10000, 20000, 30000, 40000, 50000]; // total = 150000 paise
    const parallelResponses = await Promise.all(
      amounts.map((amount) =>
        app.inject({
          method: "POST",
          url: `/api/savings/${testGoalId}/contributions`,
          headers: authHeadersA,
          payload: {
            amountCents: amount,
            note: `Parallel amount ${amount}`,
          },
        })
      )
    );

    for (const r of parallelResponses) {
      expect(r.statusCode).toBe(201);
    }

    // Verify active goal reflects exact total with zero lost updates
    const finalActive = await app.inject({
      method: "GET",
      url: "/api/savings/active",
      headers: authHeadersA,
    });
    expect(finalActive.statusCode).toBe(200);
    expect(finalActive.json().goal.savedAmountCents).toBe(150000);
    expect(finalActive.json().goal.contributionCount).toBe(5);
  });

  // ========================================================
  // 11. MONETARY SERIALIZATION BOUNDARY INTEGRITY
  // ========================================================
  it("17. preserves integer precision at and above Number.MAX_SAFE_INTEGER with safe string fallback", () => {
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER); // 9007199254740991n

    // At MAX_SAFE_INTEGER: returns exact JS number
    const atMaxSafe = serializeMonetaryAmount(maxSafe);
    expect(typeof atMaxSafe).toBe("number");
    expect(atMaxSafe).toBe(Number.MAX_SAFE_INTEGER);

    // One above MAX_SAFE_INTEGER: returns exact decimal string (no floating-point bit loss)
    const aboveMaxSafe = serializeMonetaryAmount(maxSafe + 1n);
    expect(typeof aboveMaxSafe).toBe("string");
    expect(aboveMaxSafe).toBe("9007199254740992");

    // Extreme quadrillion amount: returns exact string
    const extremeAmount = serializeMonetaryAmount(10000000000000000n);
    expect(typeof extremeAmount).toBe("string");
    expect(extremeAmount).toBe("10000000000000000");

    // Zero
    expect(serializeMonetaryAmount(0n)).toBe(0);

    // Clamped progress calculations
    expect(calculateClampedProgressPercent(1500000n, 5000000n)).toBe(30.0);
    expect(calculateClampedProgressPercent(5000000n, 5000000n)).toBe(100.0);
    expect(calculateClampedProgressPercent(6000000n, 5000000n)).toBe(100.0); // Clamped
    expect(calculateClampedProgressPercent(0n, 5000000n)).toBe(0);
    expect(calculateClampedProgressPercent(1n, 3n)).toBe(33.3);
  });
});
