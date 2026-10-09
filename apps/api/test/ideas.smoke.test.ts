import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { ideas, users } from "../src/db/schema.js";

describe("Milestone I03: Ideas API Manual Smoke Test (14-Step Flow)", () => {
  let app: FastifyInstance;

  const userAEmail = `smoke_ideasa_${Date.now()}@example.com`;
  const userBEmail = `smoke_ideasb_${Date.now()}@example.com`;
  const password = "SmokePassword123!";

  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  let testIdeaId: string;
  let bobIdeaId: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (userAId) {
      await db.delete(ideas).where(eq(ideas.userId, userAId));
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(ideas).where(eq(ideas.userId, userBId));
      await db.delete(users).where(eq(users.id, userBId));
    }
    await app.close();
    await closeDatabasePool();
  });

  it("executes the complete 14-step manual smoke test sequence", async () => {
    // Step 1: register/login User A and User B
    const regARes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: userAEmail,
        password,
        name: "Smoke Alice Ideas",
      },
    });
    expect(regARes.statusCode).toBe(201);
    userAId = regARes.json().user.id;

    const loginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password },
    });
    expect(loginARes.statusCode).toBe(200);
    const setCookieA = loginARes.headers["set-cookie"];
    const rawCookieA = Array.isArray(setCookieA) ? setCookieA[0] : setCookieA;
    userACookie = (rawCookieA as string).split(";")[0];

    const regBRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: userBEmail,
        password,
        name: "Smoke Bob Ideas",
      },
    });
    expect(regBRes.statusCode).toBe(201);
    userBId = regBRes.json().user.id;

    const loginBRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userBEmail, password },
    });
    expect(loginBRes.statusCode).toBe(200);
    const setCookieB = loginBRes.headers["set-cookie"];
    const rawCookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;
    userBCookie = (rawCookieB as string).split(";")[0];
    const userAHeaders = { cookie: userACookie, origin: "http://localhost:5173" };
    const userBHeaders = { cookie: userBCookie, origin: "http://localhost:5173" };

    // Step 2: create Idea as User A
    const createRes = await app.inject({
      method: "POST",
      url: "/api/ideas",
      headers: userAHeaders,
      payload: {
        title: "Voice-driven thought capture app",
        description: "Explore offline-first speech-to-text with auto-summaries.",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createBody = createRes.json();
    expect(createBody.idea).toBeDefined();
    expect(createBody.idea.title).toBe("Voice-driven thought capture app");
    expect(createBody.idea.status).toBe("ACTIVE");
    expect(createBody.idea.userId).toBe(userAId);
    testIdeaId = createBody.idea.id;

    // Also create an idea for User B to test cross-user access
    const bobCreateRes = await app.inject({
      method: "POST",
      url: "/api/ideas",
      headers: userBHeaders,
      payload: {
        title: "Bob Secret Mars Base Concept",
        description: "Restricted concept.",
      },
    });
    expect(bobCreateRes.statusCode).toBe(201);
    bobIdeaId = bobCreateRes.json().idea.id;

    // Step 3: list Ideas (defaults to ACTIVE)
    const listRes = await app.inject({
      method: "GET",
      url: "/api/ideas",
      headers: userAHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(Array.isArray(listBody.ideas)).toBe(true);
    expect(listBody.ideas.some((i: any) => i.id === testIdeaId)).toBe(true);
    expect(listBody.ideas.every((i: any) => i.userId === userAId)).toBe(true);

    // Step 4: retrieve Idea by ID
    const getRes = await app.inject({
      method: "GET",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().idea.id).toBe(testIdeaId);
    expect(getRes.json().idea.title).toBe("Voice-driven thought capture app");

    // Step 5: edit title
    const editTitleRes = await app.inject({
      method: "PATCH",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
      payload: {
        title: "Whisper-powered thought capture app",
      },
    });
    expect(editTitleRes.statusCode).toBe(200);
    expect(editTitleRes.json().idea.title).toBe(
      "Whisper-powered thought capture app"
    );

    // Step 6: edit description
    const editDescRes = await app.inject({
      method: "PATCH",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
      payload: {
        description: "Local Whisper model running in WASM on device.",
      },
    });
    expect(editDescRes.statusCode).toBe(200);
    expect(editDescRes.json().idea.description).toBe(
      "Local Whisper model running in WASM on device."
    );

    // Step 7: archive Idea (ACTIVE → ARCHIVED)
    const archiveRes = await app.inject({
      method: "PATCH",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
      payload: {
        status: "ARCHIVED",
      },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().idea.status).toBe("ARCHIVED");

    // Step 8: list ACTIVE (should no longer include testIdeaId)
    const listActiveRes = await app.inject({
      method: "GET",
      url: "/api/ideas?status=ACTIVE",
      headers: userAHeaders,
    });
    expect(listActiveRes.statusCode).toBe(200);
    expect(
      listActiveRes.json().ideas.some((i: any) => i.id === testIdeaId)
    ).toBe(false);

    // Step 9: list ARCHIVED (should include testIdeaId)
    const listArchivedRes = await app.inject({
      method: "GET",
      url: "/api/ideas?status=ARCHIVED",
      headers: userAHeaders,
    });
    expect(listArchivedRes.statusCode).toBe(200);
    expect(
      listArchivedRes.json().ideas.some((i: any) => i.id === testIdeaId)
    ).toBe(true);

    // Step 10: restore Idea (ARCHIVED → ACTIVE)
    const restoreRes = await app.inject({
      method: "PATCH",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
      payload: {
        status: "ACTIVE",
      },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().idea.status).toBe("ACTIVE");

    // Verify it is active again
    const verifyActiveRes = await app.inject({
      method: "GET",
      url: "/api/ideas?status=ACTIVE",
      headers: userAHeaders,
    });
    expect(
      verifyActiveRes.json().ideas.some((i: any) => i.id === testIdeaId)
    ).toBe(true);

    // Step 11: delete Idea
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().success).toBe(true);

    // Step 12: verify it no longer exists (GET → 404)
    const verifyDeletedRes = await app.inject({
      method: "GET",
      url: `/api/ideas/${testIdeaId}`,
      headers: userAHeaders,
    });
    expect(verifyDeletedRes.statusCode).toBe(404);
    expect(verifyDeletedRes.json().code).toBe("NOT_FOUND");

    // Step 13: verify logout / auth behavior
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: userAHeaders,
    });
    expect(logoutRes.statusCode).toBe(200);

    const unauthGetRes = await app.inject({
      method: "GET",
      url: "/api/ideas",
      headers: { cookie: userACookie }, // Cookie session was revoked
    });
    expect(unauthGetRes.statusCode).toBe(401);
    expect(unauthGetRes.json().code).toBe("UNAUTHENTICATED");

    // Step 14: verify cross-user access is denied (User A cannot access User B's idea)
    // Re-login User A
    const reloginARes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: userAEmail, password },
    });
    const newCookieA = (reloginARes.headers["set-cookie"] as string).split(";")[0];
    const newHeadersA = { cookie: newCookieA, origin: "http://localhost:5173" };

    const crossGetRes = await app.inject({
      method: "GET",
      url: `/api/ideas/${bobIdeaId}`,
      headers: newHeadersA,
    });
    expect(crossGetRes.statusCode).toBe(404);

    const crossPatchRes = await app.inject({
      method: "PATCH",
      url: `/api/ideas/${bobIdeaId}`,
      headers: newHeadersA,
      payload: { title: "Attempted cross-user mutation" },
    });
    expect(crossPatchRes.statusCode).toBe(404);

    const crossDeleteRes = await app.inject({
      method: "DELETE",
      url: `/api/ideas/${bobIdeaId}`,
      headers: newHeadersA,
    });
    expect(crossDeleteRes.statusCode).toBe(404);

    // Verify User B's idea still exists and remains untouched
    const verifyBobRes = await app.inject({
      method: "GET",
      url: `/api/ideas/${bobIdeaId}`,
      headers: { cookie: userBCookie },
    });
    expect(verifyBobRes.statusCode).toBe(200);
    expect(verifyBobRes.json().idea.title).toBe("Bob Secret Mars Base Concept");
  });
});
