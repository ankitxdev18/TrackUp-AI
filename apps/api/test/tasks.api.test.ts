import { sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";

describe("Task API Integration (Milestone 2)", () => {
  const TEST_DOMAIN = "tasks_api_test.trackup.local";
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
        email: `usera_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashA",
        name: "User Alice",
      })
      .returning();
    userAId = userA.id;

    // Create User B (for cross-user ownership / IDOR tests)
    const [userB] = await db
      .insert(users)
      .values({
        email: `userb_${Date.now()}@${TEST_DOMAIN}`,
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

  it("1. creates a valid task with server-assigned ownership", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: {
        "x-dev-user-id": userAId,
      },
      payload: {
        title: "Deploy Milestone 2 tasks",
        priority: "HIGH",
        dueDate: "2026-10-04",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.task).toBeDefined();
    expect(body.task.title).toBe("Deploy Milestone 2 tasks");
    expect(body.task.priority).toBe("HIGH");
    expect(body.task.dueDate).toBe("2026-10-04");
    expect(body.task.status).toBe("TODO");
    expect(body.task.userId).toBe(userAId);
  });

  it("2. rejects invalid or empty task title", async () => {
    const resEmpty = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "   ",
        priority: "MEDIUM",
      },
    });

    expect(resEmpty.statusCode).toBe(400);
    const bodyEmpty = resEmpty.json();
    expect(bodyEmpty.code).toBe("VALIDATION_ERROR");

    const resMissing = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {},
    });

    expect(resMissing.statusCode).toBe(400);
    expect(resMissing.json().code).toBe("VALIDATION_ERROR");
  });

  it("3. rejects invalid priority values", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task with bad priority",
        priority: "CRITICAL_URGENT",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details[0].field).toBe("priority");
  });

  it("4. rejects invalid due date format and non-existent calendar dates", async () => {
    // Malformed format
    const resFormat = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task with malformed date",
        dueDate: "10/04/2026",
      },
    });
    expect(resFormat.statusCode).toBe(400);
    expect(resFormat.json().code).toBe("VALIDATION_ERROR");

    // Invalid calendar date (e.g. Feb 30)
    const resCalendar = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task with impossible date",
        dueDate: "2026-02-30",
      },
    });
    expect(resCalendar.statusCode).toBe(400);
    expect(resCalendar.json().code).toBe("VALIDATION_ERROR");
  });

  it("5. lists current user's tasks without leaking other users' tasks", async () => {
    // Create task for User B
    await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userBId },
      payload: {
        title: "Bob's private task",
      },
    });

    // Query User A's tasks
    const resA = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
    });

    expect(resA.statusCode).toBe(200);
    const bodyA = resA.json();
    expect(Array.isArray(bodyA.tasks)).toBe(true);
    // User A should only see userAId tasks
    expect(bodyA.tasks.every((t: any) => t.userId === userAId)).toBe(true);
    expect(bodyA.tasks.some((t: any) => t.title === "Bob's private task")).toBe(false);
  });

  it("6 & 7. updates task completion and reopens completed task", async () => {
    // 1. Create task
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Toggle completion task",
      },
    });
    const taskId = createRes.json().task.id;

    // 2. Mark complete
    const completeRes = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}`,
      headers: { "x-dev-user-id": userAId },
      payload: {
        status: "COMPLETED",
      },
    });

    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().task.status).toBe("COMPLETED");
    expect(completeRes.json().task.completedAt).not.toBeNull();

    // 3. Reopen to TODO
    const reopenRes = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}`,
      headers: { "x-dev-user-id": userAId },
      payload: {
        status: "TODO",
      },
    });

    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.json().task.status).toBe("TODO");
    expect(reopenRes.json().task.completedAt).toBeNull();
  });

  it("8. deletes a task cleanly", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task to delete",
      },
    });
    const taskId = createRes.json().task.id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${taskId}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().success).toBe(true);

    // Verify subsequent delete returns 404
    const secondDelete = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${taskId}`,
      headers: { "x-dev-user-id": userAId },
    });
    expect(secondDelete.statusCode).toBe(404);
    expect(secondDelete.json().code).toBe("TASK_NOT_FOUND");
  });

  it("9, 10 & 11. enforces strict ownership (IDOR/BOLA protection)", async () => {
    // User A creates a task
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Alice's Secret Task",
      },
    });
    const aliceTaskId = createRes.json().task.id;

    // User B attempts to UPDATE Alice's task
    const updateAttempt = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${aliceTaskId}`,
      headers: { "x-dev-user-id": userBId },
      payload: {
        title: "Bob hacked this title",
      },
    });

    expect(updateAttempt.statusCode).toBe(404);
    expect(updateAttempt.json().code).toBe("TASK_NOT_FOUND");

    // User B attempts to DELETE Alice's task
    const deleteAttempt = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${aliceTaskId}`,
      headers: { "x-dev-user-id": userBId },
    });

    expect(deleteAttempt.statusCode).toBe(404);
    expect(deleteAttempt.json().code).toBe("TASK_NOT_FOUND");

    // Verify Alice's task remains untouched
    const aliceTasks = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
    });
    const found = aliceTasks.json().tasks.find((t: any) => t.id === aliceTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe("Alice's Secret Task");
  });

  it("12. rejects unauthorized client userId injection", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-dev-user-id": userAId },
      payload: {
        title: "Task with injected userId",
        userId: userBId, // Strict schema rejects unknown fields
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("13. rejects invalid UUID parameter and returns clean error", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/tasks/not-a-valid-uuid",
      headers: { "x-dev-user-id": userAId },
      payload: {
        status: "COMPLETED",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("INVALID_ID");
    expect(res.json().error).toBe("Invalid task ID format");
  });
});
