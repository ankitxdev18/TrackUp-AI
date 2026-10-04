import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";

describe("M3 Complete Product Flow Verification (Steps 1-24)", () => {
  const TEST_DOMAIN = "manual-flow-test.trackup.com";
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  });

  afterAll(async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
    await app.close();
    await closeDatabasePool();
  });

  it("executes the full 24-step manual product flow end-to-end", async () => {
    // Setup 2 distinct users
    const emailA = `flow_user_a_${Date.now()}@${TEST_DOMAIN}`;
    const emailB = `flow_user_b_${Date.now()}@${TEST_DOMAIN}`;
    const password = "Password123!";

    // 1. Register User A & User B
    const resRegA = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: emailA, password, name: "User A" },
    });
    expect(resRegA.statusCode).toBe(201);
    const userAId = resRegA.json().user.id;

    const resRegB = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: emailB, password, name: "User B" },
    });
    expect(resRegB.statusCode).toBe(201);
    const userBId = resRegB.json().user.id;

    // 2. Open Projects (List for User A)
    const resListEmpty = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
    });
    expect(resListEmpty.statusCode).toBe(200);
    expect(resListEmpty.json().projects).toHaveLength(0);

    // 3. Create Project A
    const resCreateProj = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: {
        name: "Project A",
        description: "Strategic Initiative A",
      },
    });
    expect(resCreateProj.statusCode).toBe(201);
    const projectAId = resCreateProj.json().project.id;
    expect(resCreateProj.json().project.name).toBe("Project A");

    // 4. Open Project A (Detail)
    const resProjDetail = await app.inject({
      method: "GET",
      url: `/api/projects/${projectAId}`,
      headers: { "x-dev-user-id": userAId },
    });
    expect(resProjDetail.statusCode).toBe(200);
    expect(resProjDetail.json().project.id).toBe(projectAId);
    expect(resProjDetail.json().tasks).toHaveLength(0);

    // 5. Create Task A1 inside Project A
    const resCreateA1 = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task A1",
        priority: "HIGH",
        projectId: projectAId,
      },
    });
    expect(resCreateA1.statusCode).toBe(201);
    const taskA1Id = resCreateA1.json().task.id;
    expect(resCreateA1.json().task.projectId).toBe(projectAId);
    expect(resCreateA1.json().task.projectName).toBe("Project A");

    // 6. Create Task A2 without a project
    const resCreateA2 = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task A2",
        priority: "MEDIUM",
      },
    });
    expect(resCreateA2.statusCode).toBe(201);
    const taskA2Id = resCreateA2.json().task.id;
    expect(resCreateA2.json().task.projectId).toBeNull();
    expect(resCreateA2.json().task.projectName).toBeNull();

    // 7. Return to Dashboard (Fetch Projects for Dashboard)
    const resDashProjects = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
    });
    expect(resDashProjects.statusCode).toBe(200);

    // 8. Verify Project A appears
    const projOnDash = resDashProjects.json().projects.find((p: any) => p.id === projectAId);
    expect(projOnDash).toBeDefined();

    // 9. Verify task count is correct: total 1, completed 0
    expect(projOnDash.taskCount).toBe(1);
    expect(projOnDash.completedTaskCount).toBe(0);

    // 10. Complete A1
    const resCompleteA1 = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskA1Id}`,
      headers: { "x-dev-user-id": userAId },
      payload: { status: "COMPLETED" },
    });
    expect(resCompleteA1.statusCode).toBe(200);
    expect(resCompleteA1.json().task.status).toBe("COMPLETED");

    // 11. Verify project progress changes: total 1, completed 1 (100%)
    const resDashUpdated = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
    });
    const projUpdated = resDashUpdated.json().projects.find((p: any) => p.id === projectAId);
    expect(projUpdated.taskCount).toBe(1);
    expect(projUpdated.completedTaskCount).toBe(1);

    // 12. Open Tasks & 13. Filter by Project A
    const resFilterProjA = await app.inject({
      method: "GET",
      url: `/api/tasks?projectId=${projectAId}`,
      headers: { "x-dev-user-id": userAId },
    });
    expect(resFilterProjA.statusCode).toBe(200);

    // 14. Verify only A1 appears
    expect(resFilterProjA.json().tasks).toHaveLength(1);
    expect(resFilterProjA.json().tasks[0].id).toBe(taskA1Id);

    // 15. Remove/clear project filter & 16. Verify all tasks appear
    const resAllTasks = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
    });
    expect(resAllTasks.statusCode).toBe(200);
    expect(resAllTasks.json().tasks).toHaveLength(2);
    const ids = resAllTasks.json().tasks.map((t: any) => t.id);
    expect(ids).toContain(taskA1Id);
    expect(ids).toContain(taskA2Id);

    // 17. Archive/delete Project A according to the implemented decision
    // (Safe delete: detaches tasks rather than deleting them)
    const resDeleteProj = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectAId}`,
      headers: { "x-dev-user-id": userAId },
    });
    expect(resDeleteProj.statusCode).toBe(200);
    expect(resDeleteProj.json().success).toBe(true);

    // 18. Verify tasks are not accidentally deleted
    const resTasksAfterDelete = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
    });
    expect(resTasksAfterDelete.json().tasks).toHaveLength(2);
    const taskA1After = resTasksAfterDelete.json().tasks.find((t: any) => t.id === taskA1Id);
    expect(taskA1After).toBeDefined();
    expect(taskA1After.projectId).toBeNull(); // detached safely!

    // 19. Login as User B & 20. Verify User B cannot see Project A
    const resListB = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { "x-dev-user-id": userBId },
    });
    expect(resListB.json().projects).toHaveLength(0);

    // 21. Attempt direct API access to Project A (Create a new project for User A to test cross-access)
    const resCreateProjA2 = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { "x-dev-user-id": userAId },
      payload: { name: "Project A-Secret" },
    });
    const secretProjId = resCreateProjA2.json().project.id;

    // 22. Verify authorization blocks it (404 Not Found to prevent enumeration)
    const resUnauthorizedGet = await app.inject({
      method: "GET",
      url: `/api/projects/${secretProjId}`,
      headers: { "x-dev-user-id": userBId },
    });
    expect(resUnauthorizedGet.statusCode).toBe(404);

    // 23. Attempt to associate a User B task with User A's project
    const resIllegalAssoc = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userBId },
      payload: {
        title: "Malicious Task",
        projectId: secretProjId,
      },
    });

    // 24. Verify authorization blocks it (400 INVALID_PROJECT)
    expect(resIllegalAssoc.statusCode).toBe(400);
    expect(resIllegalAssoc.json().code).toBe("INVALID_PROJECT");
  });
});
