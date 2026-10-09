import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { db, closeDatabasePool } from "../src/db/index.js";
import { ideas, users } from "../src/db/schema.js";

describe("Milestone I03: Ideas API, Ownership/IDOR Protection & Lifecycle Suite", () => {
  let app: FastifyInstance;

  const userAEmail = `ideas_api_usera_${Date.now()}@example.com`;
  const userBEmail = `ideas_api_userb_${Date.now()}@example.com`;
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
        name: "Alice IdeaCreator",
        passwordHash,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob IdeaCreator",
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
    await db.delete(ideas).where(eq(ideas.userId, userAId));
    await db.delete(ideas).where(eq(ideas.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await app.close();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. AUTHENTICATION ENFORCEMENT
  // ==========================================
  describe("1. Authentication Enforcement", () => {
    it("1. unauthenticated GET list → 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas",
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("2. unauthenticated GET detail → 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${validUuidMissing}`,
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("3. unauthenticated POST → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        payload: { title: "Unauthenticated Spark" },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("4. unauthenticated PATCH → 401", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${validUuidMissing}`,
        payload: { title: "New Title" },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });

    it("5. unauthenticated DELETE → 401", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/ideas/${validUuidMissing}`,
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
    });
  });

  // ==========================================
  // 2. CREATE (POST /api/ideas)
  // ==========================================
  describe("2. Create Idea (POST /api/ideas)", () => {
    let createdIdeaId: string;

    it("6. valid title creates Idea with 201 status and correct shape", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Build an autonomous life tracker",
          description: "Concept exploring personal telemetry without overhead.",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.idea).toBeDefined();
      expect(body.idea.id).toBeDefined();
      expect(body.idea.title).toBe("Build an autonomous life tracker");
      expect(body.idea.description).toBe(
        "Concept exploring personal telemetry without overhead."
      );
      expect(body.idea.status).toBe("ACTIVE");
      expect(body.idea.userId).toBe(userAId);
      expect(body.idea.createdAt).toBeDefined();
      expect(body.idea.updatedAt).toBeDefined();

      createdIdeaId = body.idea.id;
    });

    it("7. description optional (omitted or null creates Idea with description null)", async () => {
      const resOmitted = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Quick brainstorm without description",
        },
      });

      expect(resOmitted.statusCode).toBe(201);
      const bodyOmitted = resOmitted.json();
      expect(bodyOmitted.idea.title).toBe("Quick brainstorm without description");
      expect(bodyOmitted.idea.description).toBeNull();

      const resNull = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Brainstorm with explicit null description",
          description: null,
        },
      });

      expect(resNull.statusCode).toBe(201);
      const bodyNull = resNull.json();
      expect(bodyNull.idea.description).toBeNull();

      const resWhitespace = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Brainstorm with whitespace description",
          description: "   \n\t   ",
        },
      });

      expect(resWhitespace.statusCode).toBe(201);
      const bodyWhitespace = resWhitespace.json();
      expect(bodyWhitespace.idea.description).toBeNull();
    });

    it("8. default status is ACTIVE", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Default status verification spark",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.status).toBe("ACTIVE");
    });

    it("9. server assigns userId matching authenticated session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Ownership assignment verification",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.userId).toBe(userAId);
    });

    it("10. client userId is rejected (cannot spoof or inject userId)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Malicious injection attempt",
          userId: userBId,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("11. client status cannot create ARCHIVED directly on POST", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Attempt to directly archive on creation",
          status: "ARCHIVED",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("12. title required (omitted title rejected)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          description: "Missing title completely",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("13. empty title and whitespace-only title rejected", async () => {
      const resEmpty = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "",
        },
      });
      expect(resEmpty.statusCode).toBe(400);
      expect(resEmpty.json().code).toBe("VALIDATION_ERROR");

      const resWhitespace = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "   \t\n   ",
        },
      });
      expect(resWhitespace.statusCode).toBe(400);
      expect(resWhitespace.json().code).toBe("VALIDATION_ERROR");
    });

    it("14. title >255 characters rejected", async () => {
      const longTitle = "A".repeat(256);
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: longTitle,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("15. description >5000 characters rejected", async () => {
      const longDescription = "D".repeat(5001);
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Normal Title",
          description: longDescription,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("16. malformed body rejected (wrong types, extra forbidden fields)", async () => {
      const resNumberTitle = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: 12345 },
      });
      expect(resNumberTitle.statusCode).toBe(400);

      const resObjectDesc = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: "Valid Title", description: { text: "invalid" } },
      });
      expect(resObjectDesc.statusCode).toBe(400);

      const resForbiddenFields = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Valid Title",
          projectId: "some-project-id",
          goalId: "some-goal-id",
          taskId: "some-task-id",
        },
      });
      expect(resForbiddenFields.statusCode).toBe(400);
    });
  });

  // ==========================================
  // 3. LIST (GET /api/ideas)
  // ==========================================
  describe("3. List Ideas (GET /api/ideas)", () => {
    let ideaActive1Id: string;
    let ideaActive2Id: string;
    let ideaArchivedId: string;

    beforeAll(async () => {
      // Clear existing ideas for Alice and Bob
      await db.delete(ideas).where(eq(ideas.userId, userAId));
      await db.delete(ideas).where(eq(ideas.userId, userBId));

      // Create Alice ideas: Active 1 (older), Active 2 (newer), and one Archived
      const [a1] = await db
        .insert(ideas)
        .values({
          userId: userAId,
          title: "Alice Older Active Idea",
          status: "ACTIVE",
          createdAt: new Date(Date.now() - 5000),
          updatedAt: new Date(Date.now() - 5000),
        })
        .returning();
      ideaActive1Id = a1.id;

      const [a2] = await db
        .insert(ideas)
        .values({
          userId: userAId,
          title: "Alice Newer Active Idea",
          status: "ACTIVE",
          createdAt: new Date(Date.now() - 1000),
          updatedAt: new Date(Date.now() - 1000),
        })
        .returning();
      ideaActive2Id = a2.id;

      const [arch] = await db
        .insert(ideas)
        .values({
          userId: userAId,
          title: "Alice Archived Idea",
          status: "ARCHIVED",
          createdAt: new Date(Date.now() - 3000),
          updatedAt: new Date(Date.now() - 3000),
        })
        .returning();
      ideaArchivedId = arch.id;

      // Create Bob idea
      await db.insert(ideas).values({
        userId: userBId,
        title: "Bob Private Idea",
        status: "ACTIVE",
      });
    });

    it("17. default returns ACTIVE only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.ideas)).toBe(true);
      expect(body.ideas).toHaveLength(2);
      expect(body.ideas.every((i: any) => i.status === "ACTIVE")).toBe(true);
    });

    it("18. status=ACTIVE query param returns ACTIVE only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas?status=ACTIVE",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ideas).toHaveLength(2);
      expect(body.ideas.every((i: any) => i.status === "ACTIVE")).toBe(true);
    });

    it("19. status=ARCHIVED query param returns ARCHIVED only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas?status=ARCHIVED",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ideas).toHaveLength(1);
      expect(body.ideas[0].id).toBe(ideaArchivedId);
      expect(body.ideas[0].status).toBe("ARCHIVED");
    });

    it("20. invalid status query param rejected with 400 Bad Request", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas?status=COMPLETED",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("INVALID_STATUS");
    });

    it("21. newest-first ordering (createdAt DESC)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas?status=ACTIVE",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ideas[0].id).toBe(ideaActive2Id);
      expect(body.ideas[1].id).toBe(ideaActive1Id);
      expect(
        new Date(body.ideas[0].createdAt).getTime()
      ).toBeGreaterThanOrEqual(new Date(body.ideas[1].createdAt).getTime());
    });

    it("22. empty result returns empty array [] (does not return 404)", async () => {
      // Bob has no archived ideas
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas?status=ARCHIVED",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.ideas)).toBe(true);
      expect(body.ideas).toHaveLength(0);
    });

    it("23. only current user's Ideas returned (User A never sees User B's ideas)", async () => {
      const resA = await app.inject({
        method: "GET",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });
      const bodyA = resA.json();
      expect(bodyA.ideas.every((i: any) => i.userId === userAId)).toBe(true);

      const resB = await app.inject({
        method: "GET",
        url: "/api/ideas",
        headers: { cookie: userBCookie, origin: "http://localhost:5173" },
      });
      const bodyB = resB.json();
      expect(bodyB.ideas.every((i: any) => i.userId === userBId)).toBe(true);
    });
  });

  // ==========================================
  // 4. DETAIL (GET /api/ideas/:id)
  // ==========================================
  describe("4. Detail (GET /api/ideas/:id)", () => {
    let aliceIdeaId: string;
    let bobIdeaId: string;

    beforeAll(async () => {
      const [a] = await db
        .insert(ideas)
        .values({
          userId: userAId,
          title: "Alice Dedicated Detail Idea",
          description: "Detailed description for Alice",
        })
        .returning();
      aliceIdeaId = a.id;

      const [b] = await db
        .insert(ideas)
        .values({
          userId: userBId,
          title: "Bob Dedicated Detail Idea",
          description: "Detailed description for Bob",
        })
        .returning();
      bobIdeaId = b.id;
    });

    it("24. owned Idea returned with 200 OK and complete object", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${aliceIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.idea).toBeDefined();
      expect(body.idea.id).toBe(aliceIdeaId);
      expect(body.idea.userId).toBe(userAId);
      expect(body.idea.title).toBe("Alice Dedicated Detail Idea");
    });

    it("25. missing Idea returns 404 NOT_FOUND", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${validUuidMissing}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("26. invalid UUID returns 400 Bad Request INVALID_ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/ideas/not-a-valid-uuid",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("INVALID_ID");
    });

    it("27. cross-user Idea returns 404 NOT_FOUND (IDOR protection)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${bobIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 5. UPDATE (PATCH /api/ideas/:id)
  // ==========================================
  describe("5. Update Idea (PATCH /api/ideas/:id)", () => {
    let testIdeaId: string;
    let initialCreatedAt: string;
    let initialUpdatedAt: string;

    beforeAll(async () => {
      const [created] = await db
        .insert(ideas)
        .values({
          userId: userAId,
          title: "Initial Mutable Idea",
          description: "Initial description",
          status: "ACTIVE",
          createdAt: new Date(Date.now() - 10000),
          updatedAt: new Date(Date.now() - 10000),
        })
        .returning();
      testIdeaId = created.id;
      initialCreatedAt = created.createdAt.toISOString();
      initialUpdatedAt = created.updatedAt.toISOString();
    });

    it("28. title update succeeds", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Updated Idea Title",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.idea.title).toBe("Updated Idea Title");
      expect(body.idea.description).toBe("Initial description");
    });

    it("29. description update succeeds (updating text, and normalizing empty to null)", async () => {
      const res1 = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          description: "Completely revised concept description.",
        },
      });

      expect(res1.statusCode).toBe(200);
      expect(res1.json().idea.description).toBe(
        "Completely revised concept description."
      );

      // Null or whitespace-only normalizes to null
      const res2 = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          description: "   ",
        },
      });

      expect(res2.statusCode).toBe(200);
      expect(res2.json().idea.description).toBeNull();
    });

    it("30. status transition ACTIVE → ARCHIVED succeeds", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          status: "ARCHIVED",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().idea.status).toBe("ARCHIVED");
    });

    it("31. status transition ARCHIVED → ACTIVE succeeds", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          status: "ACTIVE",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().idea.status).toBe("ACTIVE");
    });

    it("32. multiple fields update together (title, description, status)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Multi-field Updated Title",
          description: "Multi-field updated description notes.",
          status: "ARCHIVED",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.idea.title).toBe("Multi-field Updated Title");
      expect(body.idea.description).toBe("Multi-field updated description notes.");
      expect(body.idea.status).toBe("ARCHIVED");
    });

    it("33. invalid status rejected (e.g. COMPLETED, DRAFT, numbers)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          status: "COMPLETED",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("34. empty title rejected on PATCH", async () => {
      const resEmpty = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "",
        },
      });
      expect(resEmpty.statusCode).toBe(400);

      const resWhitespace = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "   \n  ",
        },
      });
      expect(resWhitespace.statusCode).toBe(400);
    });

    it("35. title >255 rejected on PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "L".repeat(256),
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("36. description >5000 rejected on PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          description: "D".repeat(5001),
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("37. userId cannot be changed via PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Attempt Ownership Reassignment",
          userId: userBId,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("38. id cannot be changed via PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          id: validUuidMissing,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("39. createdAt cannot be changed via PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          createdAt: "2020-01-01T00:00:00.000Z",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("40. cross-user update returns 404 NOT_FOUND", async () => {
      // Bob owns an idea
      const [bobIdea] = await db
        .insert(ideas)
        .values({
          userId: userBId,
          title: "Bob Untouchable Idea",
        })
        .returning();

      // Alice attempts to update Bob's idea
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${bobIdea.id}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Alice Defacement",
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");

      // Verify Bob's idea was not touched
      const [unmodified] = await db
        .select()
        .from(ideas)
        .where(eq(ideas.id, bobIdea.id));
      expect(unmodified.title).toBe("Bob Untouchable Idea");
    });

    it("41. updatedAt changes when PATCH is successful", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Refreshing updatedAt",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(new Date(body.idea.updatedAt).getTime()).toBeGreaterThan(
        new Date(initialUpdatedAt).getTime()
      );
    });

    it("42. createdAt remains unchanged across updates", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${testIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(new Date(body.idea.createdAt).toISOString()).toBe(
        new Date(initialCreatedAt).toISOString()
      );
    });
  });

  // ==========================================
  // 6. DELETE (DELETE /api/ideas/:id)
  // ==========================================
  describe("6. Delete Idea (DELETE /api/ideas/:id)", () => {
    let ideaToDeleteId: string;
    let bobDeleteTestIdeaId: string;

    beforeAll(async () => {
      const [a] = await db
        .insert(ideas)
        .values({
          userId: userAId,
          title: "Alice Idea Destined for Deletion",
        })
        .returning();
      ideaToDeleteId = a.id;

      const [b] = await db
        .insert(ideas)
        .values({
          userId: userBId,
          title: "Bob Idea Safe From Alice Deletion",
        })
        .returning();
      bobDeleteTestIdeaId = b.id;
    });

    it("43. owned Idea is deleted with 200 OK and success payload", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/ideas/${ideaToDeleteId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Idea deleted successfully");
    });

    it("44. deleted Idea is no longer returned (subsequent GET returns 404)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${ideaToDeleteId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("45. non-existent Idea returns 404 on DELETE", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/ideas/${validUuidMissing}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("46. cross-user delete returns 404 (User A cannot delete User B's idea)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/ideas/${bobDeleteTestIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");

      // Verify Bob's idea still exists
      const [stillExists] = await db
        .select()
        .from(ideas)
        .where(eq(ideas.id, bobDeleteTestIdeaId));
      expect(stillExists).toBeDefined();
      expect(stillExists.id).toBe(bobDeleteTestIdeaId);
    });
  });

  // ==========================================
  // 7. SECURITY & IDOR DEEP-DIVE
  // ==========================================
  describe("7. Security & IDOR Deep-Dive (Section 18 Mandatory Test Flow)", () => {
    let bobSacredIdeaId: string;

    beforeAll(async () => {
      const [b] = await db
        .insert(ideas)
        .values({
          userId: userBId,
          title: "Bob Sacred Unchangeable Idea",
          description: "Sensitive Bob concept",
          status: "ACTIVE",
        })
        .returning();
      bobSacredIdeaId = b.id;
    });

    it("47. User A cannot read User B's idea (GET → 404)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/ideas/${bobSacredIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("48. User A cannot update User B's idea (PATCH → 404)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/ideas/${bobSacredIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Hacked by User A",
          description: "Overwritten content",
          status: "ARCHIVED",
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("49. User A cannot delete User B's idea (DELETE → 404)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/ideas/${bobSacredIdeaId}`,
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("50. User A cannot manipulate ownership through request body", async () => {
      // POST with spoofed userId
      const postRes = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Attempting to create idea under Bob's account",
          userId: userBId,
        },
      });
      expect(postRes.statusCode).toBe(400);

      // Verify User B's Sacred Idea is completely unchanged in DB
      const [persistedBobIdea] = await db
        .select()
        .from(ideas)
        .where(eq(ideas.id, bobSacredIdeaId));

      expect(persistedBobIdea.title).toBe("Bob Sacred Unchangeable Idea");
      expect(persistedBobIdea.description).toBe("Sensitive Bob concept");
      expect(persistedBobIdea.status).toBe("ACTIVE");
      expect(persistedBobIdea.userId).toBe(userBId);
    });
  });

  // ==========================================
  // 8. DATA FIDELITY & UNICODE PRESERVATION
  // ==========================================
  describe("8. Data Fidelity & Internationalization", () => {
    it("51. preserves Unicode titles (mathematical symbols, accents)", async () => {
      const unicodeTitle = "Quantum Computing: ∑(ψ_i ⊗ ϕ_j) ≈ Ω(n²) & élan vital";
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: unicodeTitle },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.title).toBe(unicodeTitle);
    });

    it("52. preserves Hindi titles and descriptions", async () => {
      const hindiTitle = "नया विचार: जीवन प्रबंधन और दैनिक स्पष्टता";
      const hindiDesc = "विचारों को बिना किसी दबाव या समय सीमा के पकड़ना।";
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: hindiTitle, description: hindiDesc },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.title).toBe(hindiTitle);
      expect(res.json().idea.description).toBe(hindiDesc);
    });

    it("53. preserves emoji in title and description", async () => {
      const emojiTitle = "🚀 TrackUp Spark 💡 🧘‍♂️ ✨";
      const emojiDesc = "💡 Spark captured with ⚡ quick thinking and 🎯 zero friction.";
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: emojiTitle, description: emojiDesc },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.title).toBe(emojiTitle);
      expect(res.json().idea.description).toBe(emojiDesc);
    });

    it("54. preserves CJK characters (Japanese, Chinese, Korean)", async () => {
      const cjkTitle = "アイデア: 生産性向上のための新しいアプローチ (想法與思考)";
      const cjkDesc = "생각을 정리하고 새로운 관점을 발견하는 과정입니다.";
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: { title: cjkTitle, description: cjkDesc },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.title).toBe(cjkTitle);
      expect(res.json().idea.description).toBe(cjkDesc);
    });

    it("55. preserves multiline descriptions with whitespace and newlines intact", async () => {
      const multilineDesc =
        "Line 1: High-level vision\n\nLine 2: Deep dive exploration\n\n  Indented note: key nuance";
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Multiline concept testing",
          description: multilineDesc,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.description).toBe(multilineDesc);
    });

    it("56. preserves Markdown formatting and code snippets", async () => {
      const markdownDesc =
        "### Architecture Spark\n\n```typescript\nconst spark = captureIdea();\n```\n\n- Feature A\n- Feature B";
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "Markdown fidelity spark",
          description: markdownDesc,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().idea.description).toBe(markdownDesc);
    });
  });

  // ==========================================
  // 9. PRIVACY & ERROR RESPONSE HYGIENE
  // ==========================================
  describe("9. Privacy & Error Response Hygiene", () => {
    it("57. error responses do not leak sensitive database internals or user content", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/ideas",
        headers: { cookie: userACookie, origin: "http://localhost:5173" },
        payload: {
          title: "",
          description: "Secret thought",
        },
      });

      expect(res.statusCode).toBe(400);
      const rawText = res.payload;
      expect(rawText).not.toContain("Secret thought");
      expect(rawText).not.toContain("SELECT");
      expect(rawText).not.toContain("INSERT INTO");
      expect(rawText).not.toContain("password_hash");
    });
  });
});
