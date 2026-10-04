import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { projects, tasks, users } from "../src/db/schema.js";

describe("Projects API Integration (Milestone 3)", () => {
  const TEST_DOMAIN = "projects_api_test.trackup.local";
  let app: FastifyInstance;
  let userAId: string;
  let userBId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create User A
    const [userA] = await db
      .insert(users)
      .values({
        email: `project_usera_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashA",
        name: "User Alice",
      })
      .returning();
    userAId = userA.id;

    // Create User B (for cross-user ownership / IDOR tests)
    const [userB] = await db
      .insert(users)
      .values({
        email: `project_userb_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashB",
        name: "User Bob",
      })
      .returning();
    userBId = userB.id;

    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await closeDatabasePool();
  });

  it("1. creates a project with server-assigned ownership", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        "x-dev-user-id": userAId,
      },
      payload: {
        name: "Q4 Product Launch",
        description: "Coordinate marketing and core features for Q4",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project).toBeDefined();
    expect(body.project.name).toBe("Q4 Product Launch");
    expect(body.project.description).toBe("Coordinate marketing and core features for Q4");
    expect(body.project.status).toBe("ACTIVE");
    expect(body.project.userId).toBe(userAId);
    expect(body.project.taskCount).toBe(0);
    expect(body.project.completedTaskCount).toBe(0);
  });

  it("2. lists projects with aggregated taskCount and completedTaskCount", async () => {
    // Create a second project for User A
    const [proj2] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Personal Fitness Roadmap",
        status: "ACTIVE",
      })
      .returning();

    // Add tasks to proj2
    await db.insert(tasks).values([
      {
        userId: userAId,
        projectId: proj2.id,
        title: "Buy running shoes",
        status: "COMPLETED",
      },
      {
        userId: userAId,
        projectId: proj2.id,
        title: "Run 5k",
        status: "TODO",
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        "x-dev-user-id": userAId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.length).toBeGreaterThanOrEqual(2);

    const fitnessProj = body.projects.find((p: any) => p.id === proj2.id);
    expect(fitnessProj).toBeDefined();
    expect(fitnessProj.taskCount).toBe(2);
    expect(fitnessProj.completedTaskCount).toBe(1);
  });

  it("3. retrieves a single project with its tasks", async () => {
    // Get projects list
    const listRes = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
    });
    const listBody = listRes.json();
    const target = listBody.projects.find((p: any) => p.name === "Personal Fitness Roadmap");

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${target.id}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.id).toBe(target.id);
    expect(body.project.taskCount).toBe(2);
    expect(body.project.completedTaskCount).toBe(1);
    expect(body.tasks.length).toBe(2);
  });

  it("4. updates project name and description", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "Original Title", description: "Old text" },
    });
    const projId = createRes.json().project.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projId}`,
      headers: { "x-dev-user-id": userAId },
      payload: { name: "Updated Title", description: "New text" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.name).toBe("Updated Title");
    expect(body.project.description).toBe("New text");
  });

  it("5. archives a project (status = ARCHIVED)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "Project to Archive" },
    });
    const projId = createRes.json().project.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projId}`,
      headers: { "x-dev-user-id": userAId },
      payload: { status: "ARCHIVED" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().project.status).toBe("ARCHIVED");
  });

  it("6. safe delete: deleting project detaches tasks and sets projectId to NULL without deleting tasks", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "Temporary Project" },
    });
    const projId = createRes.json().project.id;

    // Create a task associated with this project
    const taskRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Important sub-task in temp project",
        projectId: projId,
      },
    });
    const taskId = taskRes.json().task.id;

    // Delete the project
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projId}`,
      headers: { "x-dev-user-id": userAId },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);

    // Verify task still exists and its projectId is now NULL
    const taskListRes = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
    });
    const foundTask = taskListRes.json().tasks.find((t: any) => t.id === taskId);
    expect(foundTask).toBeDefined();
    expect(foundTask.projectId).toBeNull();
  });

  it("7. rejects invalid project creation inputs", async () => {
    // Empty name
    const emptyNameRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "   " },
    });
    expect(emptyNameRes.statusCode).toBe(400);
    expect(emptyNameRes.json().code).toBe("VALIDATION_ERROR");

    // Overly long name (>255 chars)
    const longNameRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "A".repeat(256) },
    });
    expect(longNameRes.statusCode).toBe(400);

    // Injected fields (e.g. userId)
    const injectedRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "Valid Name", userId: userBId },
    });
    expect(injectedRes.statusCode).toBe(400);
    expect(injectedRes.json().code).toBe("VALIDATION_ERROR");
  });

  it("8. rejects invalid UUID in project routes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/not-a-valid-uuid",
      headers: { "x-dev-user-id": userAId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("INVALID_ID");
  });

  it("9. IDOR: User B cannot access User A's project (returns 404)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "User A Confidential Project" },
    });
    const projAId = createRes.json().project.id;

    // User B attempts to read User A's project
    const readRes = await app.inject({
      method: "GET",
      url: `/api/projects/${projAId}`,
      headers: { "x-dev-user-id": userBId },
    });
    expect(readRes.statusCode).toBe(404);
    expect(readRes.json().code).toBe("PROJECT_NOT_FOUND");
  });

  it("10. IDOR: User B cannot update User A's project (returns 404)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "User A Safe Project" },
    });
    const projAId = createRes.json().project.id;

    // User B attempts to patch User A's project
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projAId}`,
      headers: { "x-dev-user-id": userBId },
      payload: { name: "Hacked by User B" },
    });
    expect(patchRes.statusCode).toBe(404);
    expect(patchRes.json().code).toBe("PROJECT_NOT_FOUND");
  });

  it("11. IDOR: User B cannot delete User A's project (returns 404)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "User A Indestructible Project" },
    });
    const projAId = createRes.json().project.id;

    // User B attempts to delete User A's project
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projAId}`,
      headers: { "x-dev-user-id": userBId },
    });
    expect(delRes.statusCode).toBe(404);
    expect(delRes.json().code).toBe("PROJECT_NOT_FOUND");
  });
});
