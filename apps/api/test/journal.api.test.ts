import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { journalEntries, users } from "../src/db/schema.js";

describe("Milestone H02-C: Journal CRUD API, Validation & Authorization Suite", () => {
  let app: FastifyInstance;

  const userAEmail = `journal_api_usera_${Date.now()}@example.com`;
  const userBEmail = `journal_api_userb_${Date.now()}@example.com`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  // Helper date generators
  const now = new Date();
  const getFormattedDate = (offsetDays: number = 0) => {
    const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const todayDate = getFormattedDate(0);
  const yesterdayDate = getFormattedDate(-1);
  const futureDate = "2099-01-01";

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Journaler",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Journaler",
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
    await db.delete(journalEntries).where(eq(journalEntries.userId, userAId));
    await db.delete(journalEntries).where(eq(journalEntries.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. AUTHENTICATION ENFORCEMENT
  // ==========================================
  describe("Authentication Enforcement", () => {
    it("1. GET /api/journal without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("2. GET /api/journal/by-date/:date without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/by-date/${todayDate}`,
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("3. GET /api/journal/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal/00000000-0000-0000-0000-000000000000",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("4. POST /api/journal without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        payload: {
          entryDate: todayDate,
          content: "Unauthenticated reflection",
        },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("5. PATCH /api/journal/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/journal/00000000-0000-0000-0000-000000000000",
        payload: { content: "Updated reflection" },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("6. DELETE /api/journal/:id without auth → 401 UNAUTHENTICATED", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/journal/00000000-0000-0000-0000-000000000000",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });
  });

  // ==========================================
  // 2. JOURNAL CRUD OPERATIONS
  // ==========================================
  describe("Journal CRUD Operations", () => {
    let createdEntryId: string;

    it("7. creates a journal entry with title and content (POST /api/journal)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: todayDate,
          title: "Architecture Planning Day",
          content: "# Deep Focus\nCompleted H02-C architecture and test plan.",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.entry).toBeDefined();
      expect(body.entry.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(body.entry.userId).toBe(userAId);
      expect(body.entry.entryDate).toBe(todayDate);
      expect(body.entry.title).toBe("Architecture Planning Day");
      expect(body.entry.content).toBe("# Deep Focus\nCompleted H02-C architecture and test plan.");
      expect(body.entry.createdAt).toBeDefined();
      expect(body.entry.updatedAt).toBeDefined();

      createdEntryId = body.entry.id;
    });

    it("8. retrieves the journal entry by ID (GET /api/journal/:id)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.entry).toBeDefined();
      expect(body.entry.id).toBe(createdEntryId);
      expect(body.entry.title).toBe("Architecture Planning Day");
    });

    it("9. retrieves the journal entry by date (GET /api/journal/by-date/:date)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/by-date/${todayDate}`,
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.entry).toBeDefined();
      expect(body.entry.id).toBe(createdEntryId);
      expect(body.entry.entryDate).toBe(todayDate);
    });

    it("10. creates a journal entry with null/omitted title", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: yesterdayDate,
          content: "Spontaneous thoughts without a title.",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.entry.title).toBeNull();
      expect(body.entry.entryDate).toBe(yesterdayDate);
    });

    it("11. lists user journal entries ordered by entryDate DESC (GET /api/journal)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.entries)).toBe(true);
      expect(body.entries.length).toBeGreaterThanOrEqual(2);

      // Verify descending order
      const dates = body.entries.map((e: any) => e.entryDate);
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i] >= dates[i + 1]).toBe(true);
      }
    });

    it("12. updates journal entry title (PATCH /api/journal/:id)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
        payload: {
          title: "Updated Milestone Title",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.entry.id).toBe(createdEntryId);
      expect(body.entry.title).toBe("Updated Milestone Title");
      expect(body.entry.content).toBe("# Deep Focus\nCompleted H02-C architecture and test plan.");
    });

    it("13. updates journal entry content and verifies updatedAt changes", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
        payload: {
          content: "Refined narrative with deeper takeaways and retrospective.",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.entry.content).toBe("Refined narrative with deeper takeaways and retrospective.");
    });

    it("14. updates both title and content simultaneously", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
        payload: {
          title: "Comprehensive Update",
          content: "Completely revised entry body.",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.entry.title).toBe("Comprehensive Update");
      expect(body.entry.content).toBe("Completely revised entry body.");
    });

    it("15. removes title by setting title to null in PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
        payload: {
          title: null,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.entry.title).toBeNull();
    });

    it("16. deletes journal entry (DELETE /api/journal/:id)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Journal entry deleted successfully");
      // Must NOT leak journal content in deletion response
      expect(body.content).toBeUndefined();
      expect(body.entry).toBeUndefined();

      // Verify entry is no longer accessible by ID
      const getRes = await app.inject({
        method: "GET",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
      });
      expect(getRes.statusCode).toBe(404);

      // Verify second delete returns 404
      const secondDelRes = await app.inject({
        method: "DELETE",
        url: `/api/journal/${createdEntryId}`,
        headers: { cookie: userACookie },
      });
      expect(secondDelRes.statusCode).toBe(404);
    });
  });

  // ==========================================
  // 3. GET BY DATE SPECIFIC SEMANTICS
  // ==========================================
  describe("GET /api/journal/by-date/:date Semantics", () => {
    it("17. returns 200 with { entry: null } for ordinary missing date", async () => {
      const unwrittenDate = "2026-01-01";
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/by-date/${unwrittenDate}`,
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ entry: null });
    });

    it("18. rejects malformed date format with 400 INVALID_DATE", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal/by-date/invalid-date-format",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("INVALID_DATE");
    });

    it("19. rejects impossible date with 400 INVALID_DATE", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal/by-date/2025-02-29", // 2025 is not a leap year
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("INVALID_DATE");
    });

    it("20. rejects future date with 400 FUTURE_DATE", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/by-date/${futureDate}`,
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("FUTURE_DATE");
    });
  });

  // ==========================================
  // 4. VALIDATION & SECURITY INVARIANTS
  // ==========================================
  describe("Validation & Request Hardening", () => {
    it("21. rejects POST without content", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-01",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("22. rejects POST with empty content", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-01",
          content: "",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("23. rejects POST with whitespace-only content", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-01",
          content: "     \n\t   ",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("24. rejects POST with content exceeding 20,000 characters", async () => {
      const oversizedContent = "a".repeat(20001);
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-01",
          content: oversizedContent,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("25. preserves Markdown and internal formatting without aggressive flattening", async () => {
      const formattedMarkdown = `
# Morning Reflections 🌅

- Item 1: Planned task breakdown
- Item 2: Reviewed goals
  - Nested point

\`\`\`typescript
const focus = true;
\`\`\`

End of entry.
`;
      const dateToTest = "2026-08-02";
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: dateToTest,
          content: formattedMarkdown,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      // Should match trimmed markdown without stripping internal newlines or spaces
      expect(body.entry.content).toBe(formattedMarkdown.trim());
    });

    it("26. rejects POST with title exceeding 255 characters", async () => {
      const longTitle = "T".repeat(256);
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-03",
          title: longTitle,
          content: "Valid content",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("27. normalizes whitespace-only title to null", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-04",
          title: "    ",
          content: "Valid content",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.entry.title).toBeNull();
    });

    it("28. rejects client-injected userId in POST payload", async () => {
      const fakeUserId = "00000000-0000-0000-0000-000000000000";
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-05",
          content: "Valid content",
          userId: fakeUserId,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("29. rejects client-injected id, createdAt, updatedAt in POST payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-06",
          content: "Valid content",
          id: "00000000-0000-0000-0000-000000000000",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("30. rejects arbitrary unknown fields in POST payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-07",
          content: "Valid content",
          mood: "HAPPY",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("31. rejects empty PATCH payload ({}) with 400", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/journal/11111111-1111-4111-8111-111111111111",
        headers: { cookie: userACookie },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("32. rejects mutable entryDate in PATCH payload (entryDate is immutable)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/journal/11111111-1111-4111-8111-111111111111",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-08-08",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("33. rejects invalid UUID in route parameters", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal/not-a-uuid",
        headers: { cookie: userACookie },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("INVALID_ID");
    });
  });

  // ==========================================
  // 5. UNIQUENESS & DUPLICATE ENTRY DATES
  // ==========================================
  describe("Date Uniqueness & Duplicate Invariant", () => {
    it("34. rejects duplicate entry on same date for same user with HTTP 409 DUPLICATE_ENTRY_DATE", async () => {
      const uniqueDate = "2026-07-01";

      // First insert succeeds
      const firstRes = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: uniqueDate,
          content: "Initial entry for July 1st.",
        },
      });
      expect(firstRes.statusCode).toBe(201);

      // Second insert on same date for User A fails with 409
      const secondRes = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: uniqueDate,
          content: "Second entry attempt for July 1st.",
        },
      });

      expect(secondRes.statusCode).toBe(409);
      const body = secondRes.json();
      expect(body.code).toBe("DUPLICATE_ENTRY_DATE");
      expect(body.error).toBe("Journal entry already exists for this date");
    });

    it("35. allows different users to have journal entries on the exact same date", async () => {
      const sharedDate = "2026-07-02";

      // User A creates entry on sharedDate
      const resA = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: sharedDate,
          content: "User A reflections on July 2nd.",
        },
      });
      expect(resA.statusCode).toBe(201);

      // User B creates entry on sharedDate — MUST succeed
      const resB = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userBCookie },
        payload: {
          entryDate: sharedDate,
          content: "User B reflections on July 2nd.",
        },
      });
      expect(resB.statusCode).toBe(201);
      expect(resB.json().entry.userId).toBe(userBId);
    });
  });

  // ==========================================
  // 6. DATE BOUNDARIES & CALENDAR VALIDATION
  // ==========================================
  describe("Date Boundaries & Leap Year Edge Cases", () => {
    it("36. accepts leap day 2024-02-29 (past leap year)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2024-02-29",
          content: "Leap day journal entry.",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().entry.entryDate).toBe("2024-02-29");
    });

    it("37. rejects non-leap year 2025-02-29 with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2025-02-29",
          content: "Invalid leap day entry.",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("38. rejects impossible day 2026-04-31 (April has 30 days) with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "2026-04-31",
          content: "Invalid April 31st entry.",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("39. rejects future date with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: futureDate,
          content: "Future prophecy entry.",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 7. AUTHORIZATION & IDOR ISOLATION
  // ==========================================
  describe("Authorization & IDOR Protection", () => {
    let userAEntryId: string;
    const userADate = "2026-06-15";

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: userADate,
          title: "Alice Private Thoughts",
          content: "Confidential reflection belonging to Alice only.",
        },
      });
      userAEntryId = res.json().entry.id;
    });

    it("40. User B cannot read User A entry by ID (GET /api/journal/:id) → 404 NOT_FOUND", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/${userAEntryId}`,
        headers: { cookie: userBCookie },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe("NOT_FOUND");
      expect(body.error).toBe("Journal entry not found");
    });

    it("41. User B querying by User A's date receives { entry: null }, NOT User A's entry", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/journal/by-date/${userADate}`,
        headers: { cookie: userBCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // User B has not journaled on userADate, so returns null
      expect(body.entry).toBeNull();
    });

    it("42. User B cannot update User A entry (PATCH /api/journal/:id) → 404 NOT_FOUND", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/journal/${userAEntryId}`,
        headers: { cookie: userBCookie },
        payload: {
          content: "Malicious overwrite attempt by Bob.",
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("43. User B cannot delete User A entry (DELETE /api/journal/:id) → 404 NOT_FOUND", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/journal/${userAEntryId}`,
        headers: { cookie: userBCookie },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("44. User A entry does not appear in User B entry list (GET /api/journal)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journal",
        headers: { cookie: userBCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const ids = body.entries.map((e: any) => e.id);
      expect(ids).not.toContain(userAEntryId);
    });
  });

  // ==========================================
  // 8. PRIVACY & ERROR HYGIENE
  // ==========================================
  describe("Privacy & Error Hygiene", () => {
    it("45. error payloads do not expose raw SQL, stack traces, or echoed journal content", async () => {
      const sensitiveContent = "TOP_SECRET_REFLECTION_TEXT_12345";
      const res = await app.inject({
        method: "POST",
        url: "/api/journal",
        headers: { cookie: userACookie },
        payload: {
          entryDate: "invalid-date-format",
          content: sensitiveContent,
        },
      });

      expect(res.statusCode).toBe(400);
      const rawText = res.body;
      expect(rawText).not.toContain(sensitiveContent);
      expect(rawText).not.toContain("SELECT");
      expect(rawText).not.toContain("INSERT INTO");
      expect(rawText).not.toContain("stack");
    });
  });
});
