import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { calendarEvents, users } from "../src/db/schema.js";

describe("Milestone C03: Calendar API, Temporal Range Query Engine & Test Suite", () => {
  let app: FastifyInstance;

  const userAEmail = `calendar_api_usera_${Date.now()}@example.com`;
  const userBEmail = `calendar_api_userb_${Date.now()}@example.com`;
  const plainPassword = "SecurePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  const validUuidMissing = "00000000-0000-4000-a000-000000000000";

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    const passwordHash = await hashPassword(plainPassword);

    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Calendar",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Calendar",
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
    userACookie = (rawCookieA as string).split(";")[0];

    // Login user B to obtain session cookie
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
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, userAId));
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. AUTHENTICATION (1–5)
  // ==========================================
  describe("1. Authentication Enforcement (1–5)", () => {
    it("1. GET range without authentication → 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00.000Z&end=2026-11-01T00:00:00.000Z",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("2. GET detail without authentication → 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${validUuidMissing}`,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("3. POST without authentication → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        payload: {
          title: "Unauthenticated Event",
          startTime: "2026-10-15T09:00:00.000Z",
          endTime: "2026-10-15T10:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("4. PATCH without authentication → 401", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${validUuidMissing}`,
        payload: { title: "Hacked Title" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });

    it("5. DELETE without authentication → 401", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${validUuidMissing}`,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("UNAUTHENTICATED");
    });
  });

  // ==========================================
  // 2. CREATE VALID & METADATA (6–24)
  // ==========================================
  describe("2. Event Creation & Validation (6–24)", () => {
    it("6. Create valid timed event", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Team Standup",
          startTime: "2026-10-15T09:00:00.000Z",
          endTime: "2026-10-15T09:30:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      const { event } = res.json();
      expect(event.id).toBeDefined();
      expect(event.title).toBe("Team Standup");
      expect(event.isAllDay).toBe(false);
      expect(event.startTime).toBeDefined();
      expect(event.endTime).toBeDefined();
      expect(event.startDate).toBeNull();
      expect(event.endDate).toBeNull();
    });

    it("7. Create valid all-day event", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Annual Leave",
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-22",
        },
      });
      expect(res.statusCode).toBe(201);
      const { event } = res.json();
      expect(event.isAllDay).toBe(true);
      expect(event.startDate).toBe("2026-10-20");
      expect(event.endDate).toBe("2026-10-22");
      expect(event.startTime).toBeNull();
      expect(event.endTime).toBeNull();
    });

    it("8. Default color = indigo", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Default Color Check",
          startTime: "2026-10-15T10:00:00.000Z",
          endTime: "2026-10-15T11:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.color).toBe("indigo");
    });

    it("9. Unicode title", async () => {
      const unicodeTitle = "전략 기획 회의 🎯 (Strategy & Café)";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: unicodeTitle,
          startTime: "2026-10-15T11:00:00.000Z",
          endTime: "2026-10-15T12:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.title).toBe(unicodeTitle);
    });

    it("10. Unicode description", async () => {
      const unicodeDesc = "वार्षिक समीक्षा और जीवन लक्ष्य (Hindi & Emoji 🌟)";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Review",
          description: unicodeDesc,
          startTime: "2026-10-15T12:00:00.000Z",
          endTime: "2026-10-15T13:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.description).toBe(unicodeDesc);
    });

    it("11. Unicode location", async () => {
      const unicodeLoc = "कमरा 402, 渋谷スクランブルスクエア (Shibuya)";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Meeting",
          location: unicodeLoc,
          startTime: "2026-10-15T13:00:00.000Z",
          endTime: "2026-10-15T14:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.location).toBe(unicodeLoc);
    });

    it("12. Multiline description", async () => {
      const multiline = "Line 1: Objectives\nLine 2: Action Items\nLine 3: Conclusion";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Multiline Event",
          description: multiline,
          startTime: "2026-10-15T14:00:00.000Z",
          endTime: "2026-10-15T15:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.description).toBe(multiline);
    });

    it("13. Valid IANA timezone", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Timezone Event",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
          timeZone: "Asia/Kolkata",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.timeZone).toBe("Asia/Kolkata");
    });

    it("14. Invalid IANA timezone", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Bad TZ Event",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
          timeZone: "Mars/Olympus_Mons",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("15. Whitespace-only title rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "    ",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("16. Title >255 rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "A".repeat(256),
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("17. Description >5000 rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Long Desc",
          description: "D".repeat(5001),
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("18. Location >500 rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Long Loc",
          location: "L".repeat(501),
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("19. Invalid color rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Bad Color",
          color: "#ff0000",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("20. Unknown field rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Unknown Field",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
          extraField: "hack",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("21. userId spoof attempt rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Spoof User",
          userId: userBId,
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("22. id supplied by client rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          id: validUuidMissing,
          title: "Client ID",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("23. createdAt supplied rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Client CreatedAt",
          createdAt: new Date().toISOString(),
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("24. updatedAt supplied rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Client UpdatedAt",
          updatedAt: new Date().toISOString(),
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ==========================================
  // 3. TIMED VALIDATION (25–30)
  // ==========================================
  describe("3. Timed Event Validation (25–30)", () => {
    it("25. Missing startTime rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Missing Start",
          endTime: "2026-10-15T16:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("26. Missing endTime rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Missing End",
          startTime: "2026-10-15T15:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("27. Equal start/end rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Zero Duration",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T15:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("28. End before start rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Negative Duration",
          startTime: "2026-10-15T16:00:00.000Z",
          endTime: "2026-10-15T15:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("29. Timed event with startDate rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Timed With startDate",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
          startDate: "2026-10-15",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("30. Timed event with endDate rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Timed With endDate",
          startTime: "2026-10-15T15:00:00.000Z",
          endTime: "2026-10-15T16:00:00.000Z",
          endDate: "2026-10-15",
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ==========================================
  // 4. ALL-DAY VALIDATION (31–41)
  // ==========================================
  describe("4. All-Day Event Validation (31–41)", () => {
    it("31. Missing startDate rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Missing startDate",
          isAllDay: true,
          endDate: "2026-10-20",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("32. Missing endDate rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Missing endDate",
          isAllDay: true,
          startDate: "2026-10-20",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("33. End date before start date rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Inverted Dates",
          isAllDay: true,
          startDate: "2026-10-25",
          endDate: "2026-10-20",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("34. All-day with startTime rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay With startTime",
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          startTime: "2026-10-20T09:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("35. All-day with endTime rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay With endTime",
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          endTime: "2026-10-20T10:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("36. Invalid date format rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Bad Format Date",
          isAllDay: true,
          startDate: "2026/10/20",
          endDate: "2026/10/20",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("37. Impossible date rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Feb 30",
          isAllDay: true,
          startDate: "2026-02-30",
          endDate: "2026-02-30",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("38. Leap-year valid date accepted", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Leap Day 2028",
          isAllDay: true,
          startDate: "2028-02-29",
          endDate: "2028-02-29",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.startDate).toBe("2028-02-29");
    });

    it("39. Non-leap-year invalid date rejected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Non-Leap Feb 29",
          isAllDay: true,
          startDate: "2027-02-29",
          endDate: "2027-02-29",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("40. Same start/end date accepted", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Single Day Event",
          isAllDay: true,
          startDate: "2026-11-05",
          endDate: "2026-11-05",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.startDate).toBe("2026-11-05");
      expect(res.json().event.endDate).toBe("2026-11-05");
    });

    it("41. Multi-day inclusive range accepted", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Conference Multi-Day",
          isAllDay: true,
          startDate: "2026-11-10",
          endDate: "2026-11-14",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.startDate).toBe("2026-11-10");
      expect(res.json().event.endDate).toBe("2026-11-14");
    });
  });

  // ==========================================
  // 5. READ & IDOR (42–45)
  // ==========================================
  describe("5. Read Details & Ownership Isolation (42–45)", () => {
    let userAEventId: string;
    let userBEventId: string;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "User A Detail Target",
          startTime: "2026-10-16T09:00:00.000Z",
          endTime: "2026-10-16T10:00:00.000Z",
        },
      });
      userAEventId = resA.json().event.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
        payload: {
          title: "User B Secret Event",
          startTime: "2026-10-16T10:00:00.000Z",
          endTime: "2026-10-16T11:00:00.000Z",
        },
      });
      userBEventId = resB.json().event.id;
    });

    it("42. Owned event returned", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.id).toBe(userAEventId);
      expect(res.json().event.title).toBe("User A Detail Target");
    });

    it("43. Nonexistent event → 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${validUuidMissing}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("44. Malformed UUID → validation error", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events/not-a-uuid",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ID");
    });

    it("45. Cross-user GET → 404 (IDOR protected)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${userBEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 6. PATCH BASIC (46–55)
  // ==========================================
  describe("6. PATCH Basic Operations (46–55)", () => {
    let eventId: string;
    let alldayId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Initial Patch Target",
          description: "Initial description",
          location: "Room 101",
          color: "indigo",
          startTime: "2026-10-17T09:00:00.000Z",
          endTime: "2026-10-17T10:00:00.000Z",
          timeZone: "Asia/Kolkata",
        },
      });
      eventId = res.json().event.id;

      const resAllday = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Patch Target",
          isAllDay: true,
          startDate: "2026-10-18",
          endDate: "2026-10-19",
        },
      });
      alldayId = resAllday.json().event.id;
    });

    it("46. Update title", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Updated Title" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.title).toBe("Updated Title");
    });

    it("47. Update description", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { description: "Updated new description" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.description).toBe("Updated new description");
    });

    it("48. Clear description", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { description: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.description).toBeNull();
    });

    it("49. Update location", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { location: "Zoom Meeting URL: https://zoom.us/j/123" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.location).toContain("zoom.us");
    });

    it("50. Clear location", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { location: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.location).toBeNull();
    });

    it("51. Update color", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { color: "rose" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.color).toBe("rose");
    });

    it("52. Update timezone", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { timeZone: "America/New_York" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.timeZone).toBe("America/New_York");
    });

    it("53. Clear timezone", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { timeZone: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.timeZone).toBeNull();
    });

    it("54. Update timed start/end", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          startTime: "2026-10-17T11:00:00.000Z",
          endTime: "2026-10-17T12:30:00.000Z",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(new Date(res.json().event.startTime).toISOString()).toBe(
        "2026-10-17T11:00:00.000Z"
      );
      expect(new Date(res.json().event.endTime).toISOString()).toBe(
        "2026-10-17T12:30:00.000Z"
      );
    });

    it("55. Update all-day dates", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${alldayId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          startDate: "2026-10-25",
          endDate: "2026-10-27",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.startDate).toBe("2026-10-25");
      expect(res.json().event.endDate).toBe("2026-10-27");
    });
  });

  // ==========================================
  // 7. PATCH TYPE CONVERSION & INVARIANTS (56–65)
  // ==========================================
  describe("7. PATCH Type Conversion & Invariant Enforcement (56–65)", () => {
    let convertTargetId: string;

    beforeEach(async () => {
      // Create fresh timed event for conversion tests
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Type Conversion Target",
          startTime: "2026-10-20T09:00:00.000Z",
          endTime: "2026-10-20T10:00:00.000Z",
        },
      });
      convertTargetId = res.json().event.id;
    });

    it("56. Valid timed → all-day conversion", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          startTime: null,
          endTime: null,
        },
      });
      expect(res.statusCode).toBe(200);
      const { event } = res.json();
      expect(event.isAllDay).toBe(true);
      expect(event.startDate).toBe("2026-10-20");
      expect(event.startTime).toBeNull();
      expect(event.endTime).toBeNull();
    });

    it("57. Valid all-day → timed conversion", async () => {
      // First convert to all-day
      await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          startTime: null,
          endTime: null,
        },
      });

      // Now convert back to timed
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: false,
          startTime: "2026-10-20T14:00:00.000Z",
          endTime: "2026-10-20T15:00:00.000Z",
          startDate: null,
          endDate: null,
        },
      });
      expect(res.statusCode).toBe(200);
      const { event } = res.json();
      expect(event.isAllDay).toBe(false);
      expect(event.startDate).toBeNull();
      expect(event.endDate).toBeNull();
      expect(event.startTime).toBeDefined();
      expect(event.endTime).toBeDefined();
    });

    it("58. Invalid timed → all-day without valid dates", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startTime: null,
          endTime: null,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("59. Invalid all-day → timed without valid times", async () => {
      // Convert to all-day first
      await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          startTime: null,
          endTime: null,
        },
      });

      // Try switching to timed without supplying start/endTime
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: false,
          startDate: null,
          endDate: null,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("60. Invalid mixed timed/all-day state rejected", async () => {
      // Try setting isAllDay = true but leaving timed start/end untouched without nullifying
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-20",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("61. startTime moved after endTime rejected", async () => {
      // Existing timed is 09:00 to 10:00
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          startTime: "2026-10-20T11:00:00.000Z", // Existing endTime is 10:00!
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("62. endTime moved before startTime rejected", async () => {
      // Existing timed is 09:00 to 10:00
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          endTime: "2026-10-20T08:00:00.000Z", // Existing startTime is 09:00!
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("63. endDate moved before startDate rejected", async () => {
      // Convert to all-day first: 2026-10-20 to 2026-10-25
      await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-25",
          startTime: null,
          endTime: null,
        },
      });

      // Move endDate before startDate
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          endDate: "2026-10-18",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("64. forbidden startDate on timed event rejected", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          startDate: "2026-10-20",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("65. forbidden startTime on all-day event rejected", async () => {
      // Convert to all-day first
      await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-25",
          startTime: null,
          endTime: null,
        },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${convertTargetId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          startTime: "2026-10-20T09:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 8. PATCH SECURITY & TIMESTAMPS (66–71)
  // ==========================================
  describe("8. PATCH Security & Timestamps (66–71)", () => {
    let userAEventId: string;
    let userBEventId: string;
    let originalCreatedAt: string;
    let originalUpdatedAt: string;

    beforeAll(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "User A Security Patch",
          startTime: "2026-10-21T09:00:00.000Z",
          endTime: "2026-10-21T10:00:00.000Z",
        },
      });
      const eventA = resA.json().event;
      userAEventId = eventA.id;
      originalCreatedAt = eventA.createdAt;
      originalUpdatedAt = eventA.updatedAt;

      const resB = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
        payload: {
          title: "User B Private Event",
          startTime: "2026-10-21T10:00:00.000Z",
          endTime: "2026-10-21T11:00:00.000Z",
        },
      });
      userBEventId = resB.json().event.id;
    });

    it("66. Cross-user PATCH → 404 (IDOR protected)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${userBEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Hijacked Title" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("67. userId modification rejected", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { userId: userBId },
      });
      expect(res.statusCode).toBe(400);
    });

    it("68. id modification rejected", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { id: validUuidMissing },
      });
      expect(res.statusCode).toBe(400);
    });

    it("69. createdAt modification rejected", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { createdAt: new Date().toISOString() },
      });
      expect(res.statusCode).toBe(400);
    });

    it("70. createdAt remains unchanged", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Title After Timestamp Verification" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.createdAt).toBe(originalCreatedAt);
    });

    it("71. updatedAt changes after successful update", async () => {
      // Small pause to guarantee timestamp tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { location: "New Location Room 505" },
      });
      expect(res.statusCode).toBe(200);
      expect(new Date(res.json().event.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });

  // ==========================================
  // 9. DELETE (72–75)
  // ==========================================
  describe("9. DELETE Operations & IDOR Protection (72–75)", () => {
    let userAEventId: string;
    let userBEventId: string;

    beforeEach(async () => {
      const resA = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Delete Target A",
          startTime: "2026-10-22T09:00:00.000Z",
          endTime: "2026-10-22T10:00:00.000Z",
        },
      });
      userAEventId = resA.json().event.id;

      const resB = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
        payload: {
          title: "Delete Target B",
          startTime: "2026-10-22T10:00:00.000Z",
          endTime: "2026-10-22T11:00:00.000Z",
        },
      });
      userBEventId = resB.json().event.id;
    });

    it("72. Owned event deleted", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it("73. Deleted event subsequently returns 404", async () => {
      await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${userAEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("74. Cross-user DELETE → 404", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${userBEventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("75. Malformed UUID → validation error", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/calendar/events/bad-uuid",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ID");
    });
  });

  // ==========================================
  // 10. RANGE QUERY PARAMETERS (76–81)
  // ==========================================
  describe("10. Range Query Validation (76–81)", () => {
    it("76. Missing start → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?end=2026-11-01T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("77. Missing end → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("78. Invalid start → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=invalid-date&end=2026-11-01T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("79. Invalid end → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00.000Z&end=invalid-date",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("80. end == start → 400", async () => {
      const same = "2026-10-01T00:00:00.000Z";
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${same}&end=${same}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("81. end < start → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-11-01T00:00:00.000Z&end=2026-10-01T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ==========================================
  // 11. TIMED EVENT OVERLAP SEMANTICS (82–89)
  // Query Window: [10:00, 11:00)
  // Overlap Rule: event.startTime < query.end AND event.endTime > query.start
  // ==========================================
  describe("11. Timed Event Overlap Semantics (82–89)", () => {
    const qStart = "2026-10-25T10:00:00.000Z";
    const qEnd = "2026-10-25T11:00:00.000Z";

    let insideId: string;
    let containingId: string;
    let overlapStartId: string;
    let overlapEndId: string;
    let exactEndBoundaryId: string;
    let exactStartBoundaryId: string;
    let completelyBeforeId: string;
    let completelyAfterId: string;

    beforeAll(async () => {
      // 82. Fully inside: 10:15 → 10:45
      const res1 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Fully Inside",
          startTime: "2026-10-25T10:15:00.000Z",
          endTime: "2026-10-25T10:45:00.000Z",
        },
      });
      insideId = res1.json().event.id;

      // 83. Fully containing: 09:30 → 11:30
      const res2 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Fully Containing",
          startTime: "2026-10-25T09:30:00.000Z",
          endTime: "2026-10-25T11:30:00.000Z",
        },
      });
      containingId = res2.json().event.id;

      // 84. Overlaps query start: 09:30 → 10:30
      const res3 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Overlaps Start",
          startTime: "2026-10-25T09:30:00.000Z",
          endTime: "2026-10-25T10:30:00.000Z",
        },
      });
      overlapStartId = res3.json().event.id;

      // 85. Overlaps query end: 10:30 → 11:30
      const res4 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Overlaps End",
          startTime: "2026-10-25T10:30:00.000Z",
          endTime: "2026-10-25T11:30:00.000Z",
        },
      });
      overlapEndId = res4.json().event.id;

      // 86. Starts exactly at query end: 11:00 → 12:00 (excluded)
      const res5 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Starts At Query End",
          startTime: "2026-10-25T11:00:00.000Z",
          endTime: "2026-10-25T12:00:00.000Z",
        },
      });
      exactEndBoundaryId = res5.json().event.id;

      // 87. Ends exactly at query start: 09:00 → 10:00 (excluded)
      const res6 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Ends At Query Start",
          startTime: "2026-10-25T09:00:00.000Z",
          endTime: "2026-10-25T10:00:00.000Z",
        },
      });
      exactStartBoundaryId = res6.json().event.id;

      // 88. Completely before: 08:00 → 09:00 (excluded)
      const res7 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Completely Before",
          startTime: "2026-10-25T08:00:00.000Z",
          endTime: "2026-10-25T09:00:00.000Z",
        },
      });
      completelyBeforeId = res7.json().event.id;

      // 89. Completely after: 12:00 → 13:00 (excluded)
      const res8 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Completely After",
          startTime: "2026-10-25T12:00:00.000Z",
          endTime: "2026-10-25T13:00:00.000Z",
        },
      });
      completelyAfterId = res8.json().event.id;
    });

    it("82. Event fully inside query → included", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(insideId);
    });

    it("83. Event fully containing query → included", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(containingId);
    });

    it("84. Event overlaps query start → included", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(overlapStartId);
    });

    it("85. Event overlaps query end → included", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(overlapEndId);
    });

    it("86. Event starts exactly at query end → excluded", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(exactEndBoundaryId);
    });

    it("87. Event ends exactly at query start → excluded", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(exactStartBoundaryId);
    });

    it("88. Event completely before query → excluded", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(completelyBeforeId);
    });

    it("89. Event completely after query → excluded", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(completelyAfterId);
    });
  });

  // ==========================================
  // 12. ALL-DAY RANGE SEMANTICS (90–98)
  // Query Date Range: [2026-10-10, 2026-10-20]
  // ==========================================
  describe("12. All-Day Range Semantics (90–98)", () => {
    const qStart = "2026-10-10T00:00:00.000Z";
    const qEnd = "2026-10-20T23:59:59.999Z";

    let insideId: string;
    let containingId: string;
    let overlapStartId: string;
    let overlapEndId: string;
    let exactMatchId: string;
    let outsideBeforeId: string;
    let outsideAfterId: string;
    let multiDayId: string;
    let sameDayId: string;
    let boundaryStartId: string;
    let boundaryEndId: string;

    beforeAll(async () => {
      // 90. Fully inside: 2026-10-12 to 2026-10-15
      const res1 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Inside",
          isAllDay: true,
          startDate: "2026-10-12",
          endDate: "2026-10-15",
        },
      });
      insideId = res1.json().event.id;

      // 91. Fully containing: 2026-10-05 to 2026-10-25
      const res2 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Containing",
          isAllDay: true,
          startDate: "2026-10-05",
          endDate: "2026-10-25",
        },
      });
      containingId = res2.json().event.id;

      // 92. Overlapping start: 2026-10-08 to 2026-10-12
      const res3 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Overlap Start",
          isAllDay: true,
          startDate: "2026-10-08",
          endDate: "2026-10-12",
        },
      });
      overlapStartId = res3.json().event.id;

      // 93. Overlapping end: 2026-10-18 to 2026-10-22
      const res4 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Overlap End",
          isAllDay: true,
          startDate: "2026-10-18",
          endDate: "2026-10-22",
        },
      });
      overlapEndId = res4.json().event.id;

      // 94. Exactly matching range: 2026-10-10 to 2026-10-20
      const res5 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Exact Match",
          isAllDay: true,
          startDate: "2026-10-10",
          endDate: "2026-10-20",
        },
      });
      exactMatchId = res5.json().event.id;

      // 95. Outside range before: 2026-10-01 to 2026-10-08
      const res6a = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Outside Before",
          isAllDay: true,
          startDate: "2026-10-01",
          endDate: "2026-10-08",
        },
      });
      outsideBeforeId = res6a.json().event.id;

      // 95. Outside range after: 2026-10-22 to 2026-10-28
      const res6b = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Outside After",
          isAllDay: true,
          startDate: "2026-10-22",
          endDate: "2026-10-28",
        },
      });
      outsideAfterId = res6b.json().event.id;

      // 96. Multi-day overlap: 2026-10-14 to 2026-10-17
      const res7 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Multi-Day",
          isAllDay: true,
          startDate: "2026-10-14",
          endDate: "2026-10-17",
        },
      });
      multiDayId = res7.json().event.id;

      // 97. Same-day event: 2026-10-15 to 2026-10-15
      const res8 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Same Day",
          isAllDay: true,
          startDate: "2026-10-15",
          endDate: "2026-10-15",
        },
      });
      sameDayId = res8.json().event.id;

      // 98. Boundary start (ends on 2026-10-10): 2026-10-09 to 2026-10-10
      const res9a = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Boundary Start",
          isAllDay: true,
          startDate: "2026-10-09",
          endDate: "2026-10-10",
        },
      });
      boundaryStartId = res9a.json().event.id;

      // 98. Boundary end (starts on 2026-10-20): 2026-10-20 to 2026-10-21
      const res9b = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "AllDay Boundary End",
          isAllDay: true,
          startDate: "2026-10-20",
          endDate: "2026-10-21",
        },
      });
      boundaryEndId = res9b.json().event.id;
    });

    it("90. All-day event fully inside range", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(insideId);
    });

    it("91. All-day event fully containing range", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(containingId);
    });

    it("92. All-day event overlapping range start", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(overlapStartId);
    });

    it("93. All-day event overlapping range end", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(overlapEndId);
    });

    it("94. All-day event exactly matching range", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(exactMatchId);
    });

    it("95. All-day event outside range", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(outsideBeforeId);
      expect(ids).not.toContain(outsideAfterId);
    });

    it("96. Multi-day all-day overlap", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(multiDayId);
    });

    it("97. Same-day all-day event", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(sameDayId);
    });

    it("98. Boundary date behavior verified", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events?start=${qStart}&end=${qEnd}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).toContain(boundaryStartId);
      expect(ids).toContain(boundaryEndId);
    });

    // -------------------------------------------------------------
    // CRITICAL EXCLUSIVE-END ALL-DAY REGRESSION TESTS (Section 7)
    // -------------------------------------------------------------
    it("98b. [CRITICAL REGRESSION] Exclusive end boundary [Oct 1 00:00, Oct 8 00:00 exclusive) excludes Oct 8 all-day event", async () => {
      // Create Oct 7 only all-day event
      const resOct7 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Visible Oct 7 All-Day",
          isAllDay: true,
          startDate: "2026-10-07",
          endDate: "2026-10-07",
        },
      });
      expect(resOct7.statusCode).toBe(201);
      const oct7Id = resOct7.json().event.id;

      // Create Oct 8 only all-day event
      const resOct8 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Excluded Oct 8 All-Day",
          isAllDay: true,
          startDate: "2026-10-08",
          endDate: "2026-10-08",
        },
      });
      expect(resOct8.statusCode).toBe(201);
      const oct8Id = resOct8.json().event.id;

      // Create multi-day Oct 5–8 event (overlaps Oct 1–7)
      const resOct5to8 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Overlapping Oct 5-8 All-Day",
          isAllDay: true,
          startDate: "2026-10-05",
          endDate: "2026-10-08",
        },
      });
      expect(resOct5to8.statusCode).toBe(201);
      const oct5to8Id = resOct5to8.json().event.id;

      // Query [2026-10-01T00:00:00.000Z, 2026-10-08T00:00:00.000Z) exclusive
      const queryRes = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00.000Z&end=2026-10-08T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(queryRes.statusCode).toBe(200);
      const returnedIds = queryRes.json().events.map((e: any) => e.id);

      // Oct 7 must be INCLUDED (visible in Oct 1-7 viewport)
      expect(returnedIds).toContain(oct7Id);

      // Oct 8 must be EXCLUDED (starts on Oct 8, which is outside the [Oct 1 00:00, Oct 8 00:00) interval)
      expect(returnedIds).not.toContain(oct8Id);

      // Oct 5–8 must be INCLUDED (its Oct 5–7 portion intersects the viewport)
      expect(returnedIds).toContain(oct5to8Id);
    });

    it("98c. Timezone-aware range query (Asia/Kolkata) correctly evaluates exclusive end boundary", async () => {
      // Oct 1 00:00 IST = 2026-09-30T18:30:00.000Z
      // Oct 8 00:00 IST = 2026-10-07T18:30:00.000Z
      // Visible dates in Asia/Kolkata: Oct 1 through Oct 7
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-09-30T18:30:00.000Z&end=2026-10-07T18:30:00.000Z&timeZone=Asia/Kolkata",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const returnedTitles = res.json().events.map((e: any) => e.title);
      expect(returnedTitles).toContain("Visible Oct 7 All-Day");
      expect(returnedTitles).not.toContain("Excluded Oct 8 All-Day");
    });

    it("98d. Timezone-aware range query with ISO offset string evaluates local calendar date boundary", async () => {
      // start and end with +05:30 offset
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00%2B05:30&end=2026-10-08T00:00:00%2B05:30",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const returnedTitles = res.json().events.map((e: any) => e.title);
      expect(returnedTitles).toContain("Visible Oct 7 All-Day");
      expect(returnedTitles).not.toContain("Excluded Oct 8 All-Day");
    });

    it("98e. Invalid timeZone query parameter returns 400 VALIDATION_ERROR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00.000Z&end=2026-10-08T00:00:00.000Z&timeZone=Mars/Curiosity",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("98f. Unknown query parameter rejected by strict range schema → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-10-01T00:00:00.000Z&end=2026-10-08T00:00:00.000Z&unknownField=bad",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 13. MIXED RESULTS & DETERMINISTIC ORDERING (99–102)
  // ==========================================
  describe("13. Mixed Results & Deterministic Ordering (99–102)", () => {
    let dayAlldayId: string;
    let morningTimedId: string;
    let afternoonTimedId: string;
    let userBEventId: string;

    beforeAll(async () => {
      // Create User A events on 2026-11-20
      const res1 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "All Day On 20th",
          isAllDay: true,
          startDate: "2026-11-20",
          endDate: "2026-11-20",
        },
      });
      dayAlldayId = res1.json().event.id;

      const res2 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Morning Timed",
          startTime: "2026-11-20T09:00:00.000Z",
          endTime: "2026-11-20T10:00:00.000Z",
        },
      });
      morningTimedId = res2.json().event.id;

      const res3 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Afternoon Timed",
          startTime: "2026-11-20T14:00:00.000Z",
          endTime: "2026-11-20T15:00:00.000Z",
        },
      });
      afternoonTimedId = res3.json().event.id;

      // User B event on the same day
      const res4 = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
        payload: {
          title: "User B Same Date Event",
          startTime: "2026-11-20T09:30:00.000Z",
          endTime: "2026-11-20T10:30:00.000Z",
        },
      });
      userBEventId = res4.json().event.id;
    });

    it("99. Timed + all-day events returned together", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-11-20T00:00:00.000Z&end=2026-11-20T23:59:59.999Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().events;
      const ids = events.map((e: any) => e.id);

      expect(ids).toContain(dayAlldayId);
      expect(ids).toContain(morningTimedId);
      expect(ids).toContain(afternoonTimedId);
    });

    it("100. Results have deterministic ordering (all-day first, then chronological timed)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-11-20T00:00:00.000Z&end=2026-11-20T23:59:59.999Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().events;

      // Check ordering: all-day event precedes timed events for 2026-11-20
      const alldayIndex = events.findIndex((e: any) => e.id === dayAlldayId);
      const morningIndex = events.findIndex((e: any) => e.id === morningTimedId);
      const afternoonIndex = events.findIndex((e: any) => e.id === afternoonTimedId);

      expect(alldayIndex).toBeLessThan(morningIndex);
      expect(morningIndex).toBeLessThan(afternoonIndex);
    });

    it("101. Cross-user events excluded from range query", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-11-20T00:00:00.000Z&end=2026-11-20T23:59:59.999Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(userBEventId);
    });

    it("102. Empty range returns []", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2029-01-01T00:00:00.000Z&end=2029-01-02T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().events).toEqual([]);
    });
  });

  // ==========================================
  // 14. COMPREHENSIVE SECURITY & IDOR (103–106)
  // ==========================================
  describe("14. Security & IDOR Verification (103–106)", () => {
    let secretUserBId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
        payload: {
          title: "User B Classified Attention Block",
          description: "Top secret strategy notes",
          location: "Secure Bunker",
          startTime: "2026-12-01T10:00:00.000Z",
          endTime: "2026-12-01T11:00:00.000Z",
        },
      });
      secretUserBId = res.json().event.id;
    });

    it("103. User A cannot see User B event by ID → 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${secretUserBId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("104. User A cannot modify User B event → 404", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/calendar/events/${secretUserBId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Malicious Edit Attempt" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("105. User A cannot delete User B event → 404", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${secretUserBId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");

      // Verify event still exists in User B's scope
      const checkRes = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${secretUserBId}`,
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
      });
      expect(checkRes.statusCode).toBe(200);
    });

    it("106. User A range query never returns User B events", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/calendar/events?start=2026-12-01T00:00:00.000Z&end=2026-12-02T00:00:00.000Z",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().events.map((e: any) => e.id);
      expect(ids).not.toContain(secretUserBId);
    });
  });

  // ==========================================
  // 15. DATA INTEGRITY & POSTGRES DEFENSE (107–110)
  // ==========================================
  describe("15. Data Integrity & Postgres Boundary Defense (107–110)", () => {
    it("107. Unicode preserved across full roundtrip", async () => {
      const unicodeTitle = "🌟 重点项目评审 & Café (Tokyo)";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: unicodeTitle,
          isAllDay: true,
          startDate: "2026-12-10",
          endDate: "2026-12-10",
        },
      });
      expect(res.statusCode).toBe(201);
      const eventId = res.json().event.id;

      const fetchRes = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(fetchRes.json().event.title).toBe(unicodeTitle);
    });

    it("108. Multiline text preserved exactly", async () => {
      const multiline = "Line 1: Problem statement\n\nLine 2: Solution architecture\n- Bullet A\n- Bullet B";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Architecture Session",
          description: multiline,
          startTime: "2026-12-11T10:00:00.000Z",
          endTime: "2026-12-11T11:00:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      const eventId = res.json().event.id;

      const fetchRes = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(fetchRes.json().event.description).toBe(multiline);
    });

    it("109. Meeting URL/location text preserved", async () => {
      const urlLocation = "https://meet.google.com/abc-defg-hij?authuser=0";
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Virtual Standup",
          location: urlLocation,
          startTime: "2026-12-11T11:00:00.000Z",
          endTime: "2026-12-11T11:30:00.000Z",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event.location).toBe(urlLocation);
    });

    it("110. Database constraints still protect invalid states directly", async () => {
      try {
        await db.execute(
          sql`INSERT INTO calendar_events (user_id, title, is_all_day, start_time, end_time)
              VALUES (${userAId}, 'Invalid DB Bypass Event', false, '2026-12-15 10:00:00+00', '2026-12-15 09:00:00+00')`
        );
        expect.unreachable("Database check constraint should reject startTime >= endTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });
  });

  // ==========================================
  // 16. CONCURRENCY & RAPID OPERATIONS (111–113)
  // ==========================================
  describe("16. Concurrency & Rapid Operations (111–113)", () => {
    it("111. Rapid repeated PATCH does not leave invalid temporal state", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Rapid Patch Target",
          startTime: "2026-12-20T10:00:00.000Z",
          endTime: "2026-12-20T11:00:00.000Z",
        },
      });
      const eventId = res.json().event.id;

      const patchPromises = [
        app.inject({
          method: "PATCH",
          url: `/api/calendar/events/${eventId}`,
          headers: { cookie: userACookie, origin: "http://localhost:5173" },
          payload: { title: "Rapid Title 1" },
        }),
        app.inject({
          method: "PATCH",
          url: `/api/calendar/events/${eventId}`,
          headers: { cookie: userACookie, origin: "http://localhost:5173" },
          payload: { title: "Rapid Title 2" },
        }),
        app.inject({
          method: "PATCH",
          url: `/api/calendar/events/${eventId}`,
          headers: { cookie: userACookie, origin: "http://localhost:5173" },
          payload: { description: "Rapid Description" },
        }),
      ];

      const results = await Promise.all(patchPromises);
      for (const patchRes of results) {
        expect(patchRes.statusCode).toBe(200);
      }

      // Verify event is in a consistent state
      const finalRes = await app.inject({
        method: "GET",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(finalRes.statusCode).toBe(200);
      expect(finalRes.json().event.id).toBe(eventId);
    });

    it("112. Repeated DELETE remains safe according to existing TrackUp semantics", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/calendar/events",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Rapid Delete Target",
          startTime: "2026-12-20T12:00:00.000Z",
          endTime: "2026-12-20T13:00:00.000Z",
        },
      });
      const eventId = res.json().event.id;

      const delete1 = await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(delete1.statusCode).toBe(200);

      // Second delete on already deleted event returns 404
      const delete2 = await app.inject({
        method: "DELETE",
        url: `/api/calendar/events/${eventId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      expect(delete2.statusCode).toBe(404);
    });

    it("113. Rapid create operations do not bypass ownership or validation", async () => {
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: "POST",
          url: "/api/calendar/events",
          headers: { cookie: userACookie, origin: "http://localhost:5173" },
          payload: {
            title: `Rapid Created Event ${i}`,
            startTime: `2026-12-21T0${i + 1}:00:00.000Z`,
            endTime: `2026-12-21T0${i + 1}:30:00.000Z`,
          },
        })
      );

      const results = await Promise.all(createPromises);
      for (const createRes of results) {
        expect(createRes.statusCode).toBe(201);
        expect(createRes.json().event.userId).toBe(userAId);
      }
    });
  });
});
