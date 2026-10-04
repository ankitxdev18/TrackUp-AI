import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { projects, tasks, users } from "../src/db/schema.js";

describe("Task ↔ Project Relationship & Security (Milestone 3)", () => {
  const TEST_DOMAIN = "tasks_projects_rel.trackup.local";
  let app: FastifyInstance;
  let userAId: string;
  let userBId: string;
  let projectAId: string;
  let projectBId: string;

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
        email: `rel_usera_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashA",
        name: "User Alice",
      })
      .returning();
    userAId = userA.id;

    // Create User B
    const [userB] = await db
      .insert(users)
      .values({
        email: `rel_userb_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashB",
        name: "User Bob",
      })
      .returning();
    userBId = userB.id;

    // Create Project A owned by User A
    const [projA] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Alice Strategy",
      })
      .returning();
    projectAId = projA.id;

    // Create Project B owned by User B
    const [projB] = await db
      .insert(projects)
      .values({
        userId: userBId,
        name: "Bob Confidential",
      })
      .returning();
    projectBId = projB.id;

    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await closeDatabasePool();
  });

  it("1. creates a task without a project (nullable projectId backward compatibility)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Standalone Task without project",
        priority: "LOW",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.task.projectId).toBeNull();
    expect(body.task.title).toBe("Standalone Task without project");
  });

  it("2. creates a task associated with user's own project", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Alice Strategy Step 1",
        priority: "HIGH",
        projectId: projectAId,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.task.projectId).toBe(projectAId);
    expect(body.task.projectName).toBe("Alice Strategy");
  });

  it("3. SECURITY: rejects creating task associated with another user's project", async () => {
    // User A attempts to create a task assigned to User B's project
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Intruder task in Bob's project",
        projectId: projectBId,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("INVALID_PROJECT");
    expect(body.error).toContain("Project not found or not owned by user");
  });

  it("4. updates existing task to associate with user's own project", async () => {
    // Create standalone task first
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: { title: "Task to assign" },
    });
    const taskId = createRes.json().task.id;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}`,
      headers: { "x-dev-user-id": userAId },
      payload: { projectId: projectAId },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = patchRes.json();
    expect(body.task.projectId).toBe(projectAId);
    expect(body.task.projectName).toBe("Alice Strategy");
  });

  it("5. SECURITY: rejects updating existing task to another user's project", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: { title: "Task to misassign" },
    });
    const taskId = createRes.json().task.id;

    // User A attempts to update task's projectId to User B's project
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}`,
      headers: { "x-dev-user-id": userAId },
      payload: { projectId: projectBId },
    });

    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().code).toBe("INVALID_PROJECT");
  });

  it("6. filters tasks by specific projectId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/tasks?projectId=${projectAId}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.tasks)).toBe(true);
    // Every task must belong to projectAId
    body.tasks.forEach((t: any) => {
      expect(t.projectId).toBe(projectAId);
      expect(t.projectName).toBe("Alice Strategy");
    });
  });

  it("7. filters tasks without project via projectId=none", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks?projectId=none",
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.tasks)).toBe(true);
    body.tasks.forEach((t: any) => {
      expect(t.projectId).toBeNull();
    });
  });

  it("8. project list handles projects with 0 tasks safely", async () => {
    const [emptyProj] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Empty Project Zero Tasks",
      })
      .returning();

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${emptyProj.id}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.taskCount).toBe(0);
    expect(body.project.completedTaskCount).toBe(0);
    expect(body.tasks.length).toBe(0);
  });
});
