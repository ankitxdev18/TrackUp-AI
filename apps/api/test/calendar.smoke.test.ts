import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { calendarEvents, users } from "../src/db/schema.js";

describe("Milestone C03: Calendar API Manual Smoke Test (16-Step Flow)", () => {
  let app: FastifyInstance;

  const userAEmail = `smoke_calendar_a_${Date.now()}@example.com`;
  const userBEmail = `smoke_calendar_b_${Date.now()}@example.com`;
  const password = "SmokePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  let timedEventId: string;
  let alldayEventId: string;
  let userBEventId: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (userAId) {
      await db.delete(calendarEvents).where(eq(calendarEvents.userId, userAId));
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(calendarEvents).where(eq(calendarEvents.userId, userBId));
      await db.delete(users).where(eq(users.id, userBId));
    }
    await app.close();
    await closeDatabasePool();
  });

  it("executes the complete 16-step calendar smoke test flow end-to-end", async () => {
    // Step 1: Register User A
    const regARes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: userAEmail,
        password,
        name: "Smoke Alice Calendar",
      },
    });
    expect(regARes.statusCode).toBe(201);
    userAId = regARes.json().user.id;
    expect(userAId).toBeDefined();

    // Step 2: Login User A
    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password },
    });
    expect(loginARes.statusCode).toBe(200);
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    userACookie = (rawCookieA as string).split(";")[0];
    expect(userACookie).toBeDefined();
    const userAHeaders = { cookie: userACookie, origin: "http://localhost:5173" };

    // Step 3: Create timed event
    const createTimedRes = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      headers: userAHeaders,
      payload: {
        title: "Architecture Sync",
        description: "Reviewing database and temporal invariants",
        location: "Virtual Meeting Room A",
        color: "indigo",
        startTime: "2026-11-01T09:00:00.000Z",
        endTime: "2026-11-01T10:00:00.000Z",
        timeZone: "Asia/Kolkata",
      },
    });
    expect(createTimedRes.statusCode).toBe(201);
    timedEventId = createTimedRes.json().event.id;
    expect(timedEventId).toBeDefined();
    expect(createTimedRes.json().event.isAllDay).toBe(false);

    // Step 4: Create all-day event
    const createAlldayRes = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      headers: userAHeaders,
      payload: {
        title: "Product Hackathon",
        description: "Life OS Calendar build sprint",
        color: "emerald",
        isAllDay: true,
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      },
    });
    expect(createAlldayRes.statusCode).toBe(201);
    alldayEventId = createAlldayRes.json().event.id;
    expect(alldayEventId).toBeDefined();
    expect(createAlldayRes.json().event.isAllDay).toBe(true);

    // Step 5: Query calendar range
    const rangeRes = await app.inject({
      method: "GET",
      url: "/api/calendar/events?start=2026-11-01T00:00:00.000Z&end=2026-11-02T23:59:59.999Z",
      headers: userAHeaders,
    });
    expect(rangeRes.statusCode).toBe(200);

    // Step 6: Verify both events
    const rangeEvents = rangeRes.json().events;
    const rangeIds = rangeEvents.map((e: any) => e.id);
    expect(rangeIds).toContain(timedEventId);
    expect(rangeIds).toContain(alldayEventId);

    // Step 7: Get individual event
    const getSingleRes = await app.inject({
      method: "GET",
      url: `/api/calendar/events/${timedEventId}`,
      headers: userAHeaders,
    });
    expect(getSingleRes.statusCode).toBe(200);
    expect(getSingleRes.json().event.id).toBe(timedEventId);
    expect(getSingleRes.json().event.title).toBe("Architecture Sync");

    // Step 8: Update event
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/calendar/events/${timedEventId}`,
      headers: userAHeaders,
      payload: {
        title: "Refined Architecture Sync",
        color: "rose",
        startTime: "2026-11-01T09:30:00.000Z",
        endTime: "2026-11-01T10:45:00.000Z",
      },
    });
    expect(updateRes.statusCode).toBe(200);

    // Step 9: Verify updated result
    const updatedEvent = updateRes.json().event;
    expect(updatedEvent.title).toBe("Refined Architecture Sync");
    expect(updatedEvent.color).toBe("rose");
    expect(new Date(updatedEvent.startTime).toISOString()).toBe("2026-11-01T09:30:00.000Z");
    expect(new Date(updatedEvent.endTime).toISOString()).toBe("2026-11-01T10:45:00.000Z");

    // Step 10: Delete event
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/calendar/events/${timedEventId}`,
      headers: userAHeaders,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().success).toBe(true);

    // Step 11: Verify 404
    const verifyDeleteRes = await app.inject({
      method: "GET",
      url: `/api/calendar/events/${timedEventId}`,
      headers: userAHeaders,
    });
    expect(verifyDeleteRes.statusCode).toBe(404);

    // Step 12: Create User B
    const regBRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: userBEmail,
        password,
        name: "Smoke Bob Calendar",
      },
    });
    expect(regBRes.statusCode).toBe(201);
    userBId = regBRes.json().user.id;
    expect(userBId).toBeDefined();

    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password },
    });
    expect(loginBRes.statusCode).toBe(200);
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    userBCookie = (rawCookieB as string).split(";")[0];
    const userBHeaders = { cookie: userBCookie, origin: "http://localhost:5173" };

    // Step 13: Create User B event
    const createBRes = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      headers: userBHeaders,
      payload: {
        title: "Bob Private Planning",
        startTime: "2026-11-01T14:00:00.000Z",
        endTime: "2026-11-01T15:00:00.000Z",
      },
    });
    expect(createBRes.statusCode).toBe(201);
    userBEventId = createBRes.json().event.id;

    // Step 14: Verify User A cannot access User B event (404)
    const crossAccessRes = await app.inject({
      method: "GET",
      url: `/api/calendar/events/${userBEventId}`,
      headers: userAHeaders,
    });
    expect(crossAccessRes.statusCode).toBe(404);
    expect(crossAccessRes.json().code).toBe("NOT_FOUND");

    // Step 15: Verify User A range query excludes User B event
    const rangeExcludeRes = await app.inject({
      method: "GET",
      url: "/api/calendar/events?start=2026-11-01T00:00:00.000Z&end=2026-11-02T23:59:59.999Z",
      headers: userAHeaders,
    });
    expect(rangeExcludeRes.statusCode).toBe(200);
    const userAEvents = rangeExcludeRes.json().events.map((e: any) => e.id);
    expect(userAEvents).not.toContain(userBEventId);

    // Step 16: Logout
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: userAHeaders,
    });
    expect(logoutRes.statusCode).toBe(200);

    const postLogoutRes = await app.inject({
      method: "GET",
      url: `/api/calendar/events/${alldayEventId}`,
      headers: { cookie: userACookie },
    });
    expect(postLogoutRes.statusCode).toBe(401);
  }, 15000);
});
