import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { journalEntries, users } from "../src/db/schema.js";

describe("Milestone H02-C: Manual API Smoke Test (19-Step Verification Flow)", () => {
  let app: FastifyInstance;

  const userAEmail = `smoke_usera_${Date.now()}@example.com`;
  const userBEmail = `smoke_userb_${Date.now()}@example.com`;
  const password = "SmokePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  let todayEntryId: string;
  let yesterdayEntryId: string;

  const now = new Date();
  const getFormattedDate = (offsetDays: number = 0) => {
    const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const todayStr = getFormattedDate(0);
  const yesterdayStr = getFormattedDate(-1);
  const futureStr = "2099-01-01";

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (userAId) {
      await db.delete(journalEntries).where(eq(journalEntries.userId, userAId));
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(journalEntries).where(eq(journalEntries.userId, userBId));
      await db.delete(users).where(eq(users.id, userBId));
    }
    await app.close();
    await closeDatabasePool();
  });

  it("executes the complete 19-step manual smoke test sequence", async () => {
    // 1. Register User A
    const regARes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: userAEmail,
        password,
        name: "Smoke Alice",
      },
    });
    expect(regARes.statusCode).toBe(201);
    userAId = regARes.json().user.id;

    // 2. Login User A
    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password },
    });
    expect(loginARes.statusCode).toBe(200);
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    userACookie = (rawCookieA as string).split(";")[0];

    // 3. Create today's journal entry
    const createTodayRes = await app.inject({
      method: "POST",
      url: "/api/journal",
      headers: { cookie: userACookie },
      payload: {
        entryDate: todayStr,
        title: "Today's Reflections",
        content: "Accomplished key objectives today.",
      },
    });
    expect(createTodayRes.statusCode).toBe(201);
    const todayEntry = createTodayRes.json().entry;
    todayEntryId = todayEntry.id;
    expect(todayEntry.entryDate).toBe(todayStr);

    // 4. Retrieve by ID
    const getByIdRes = await app.inject({
      method: "GET",
      url: `/api/journal/${todayEntryId}`,
      headers: { cookie: userACookie },
    });
    expect(getByIdRes.statusCode).toBe(200);
    expect(getByIdRes.json().entry.id).toBe(todayEntryId);

    // 5. Retrieve by date
    const getByDateRes = await app.inject({
      method: "GET",
      url: `/api/journal/by-date/${todayStr}`,
      headers: { cookie: userACookie },
    });
    expect(getByDateRes.statusCode).toBe(200);
    expect(getByDateRes.json().entry.id).toBe(todayEntryId);

    // 6. List entries
    const listRes = await app.inject({
      method: "GET",
      url: "/api/journal",
      headers: { cookie: userACookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().entries.length).toBeGreaterThanOrEqual(1);

    // 7. Update title/content
    const initialUpdatedAt = todayEntry.updatedAt;
    // Wait briefly so timestamp differs
    await new Promise((r) => setTimeout(r, 50));

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/journal/${todayEntryId}`,
      headers: { cookie: userACookie },
      payload: {
        title: "Refined Today's Reflections",
        content: "Updated narrative with deeper context.",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchedEntry = patchRes.json().entry;
    expect(patchedEntry.title).toBe("Refined Today's Reflections");

    // 8. Confirm updatedAt changes
    expect(new Date(patchedEntry.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initialUpdatedAt).getTime()
    );

    // 9. Create yesterday's entry
    const createYesterdayRes = await app.inject({
      method: "POST",
      url: "/api/journal",
      headers: { cookie: userACookie },
      payload: {
        entryDate: yesterdayStr,
        title: "Yesterday's Retrospective",
        content: "Retroactively logged yesterday's session.",
      },
    });
    expect(createYesterdayRes.statusCode).toBe(201);
    yesterdayEntryId = createYesterdayRes.json().entry.id;

    // 10. Attempt future entry
    const futureRes = await app.inject({
      method: "POST",
      url: "/api/journal",
      headers: { cookie: userACookie },
      payload: {
        entryDate: futureStr,
        content: "Should be rejected.",
      },
    });
    expect(futureRes.statusCode).toBe(400);

    // 11. Attempt duplicate today's entry
    const duplicateRes = await app.inject({
      method: "POST",
      url: "/api/journal",
      headers: { cookie: userACookie },
      payload: {
        entryDate: todayStr,
        content: "Duplicate attempt.",
      },
    });
    expect(duplicateRes.statusCode).toBe(409);
    expect(duplicateRes.json().code).toBe("DUPLICATE_ENTRY_DATE");

    // 12. Delete entry (delete yesterday's entry)
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/journal/${yesterdayEntryId}`,
      headers: { cookie: userACookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().success).toBe(true);

    // 13. Confirm deleted entry returns 404
    const getDeletedRes = await app.inject({
      method: "GET",
      url: `/api/journal/${yesterdayEntryId}`,
      headers: { cookie: userACookie },
    });
    expect(getDeletedRes.statusCode).toBe(404);

    // 14. Register User B
    const regBRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: userBEmail,
        password,
        name: "Smoke Bob",
      },
    });
    expect(regBRes.statusCode).toBe(201);
    userBId = regBRes.json().user.id;

    // 15. Login User B
    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password },
    });
    expect(loginBRes.statusCode).toBe(200);
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    userBCookie = (rawCookieB as string).split(";")[0];

    // 16. User B attempts to read User A's entry
    const bReadARes = await app.inject({
      method: "GET",
      url: `/api/journal/${todayEntryId}`,
      headers: { cookie: userBCookie },
    });
    expect(bReadARes.statusCode).toBe(404);

    // 17. User B attempts to read by date (should return { entry: null }, not User A's entry)
    const bReadDateRes = await app.inject({
      method: "GET",
      url: `/api/journal/by-date/${todayStr}`,
      headers: { cookie: userBCookie },
    });
    expect(bReadDateRes.statusCode).toBe(200);
    expect(bReadDateRes.json().entry).toBeNull();

    // 18. User B attempts PATCH on User A's entry
    const bPatchARes = await app.inject({
      method: "PATCH",
      url: `/api/journal/${todayEntryId}`,
      headers: { cookie: userBCookie },
      payload: {
        content: "Tamper attempt",
      },
    });
    expect(bPatchARes.statusCode).toBe(404);

    // 19. User B attempts DELETE on User A's entry
    const bDeleteARes = await app.inject({
      method: "DELETE",
      url: `/api/journal/${todayEntryId}`,
      headers: { cookie: userBCookie },
    });
    expect(bDeleteARes.statusCode).toBe(404);
  });
});
