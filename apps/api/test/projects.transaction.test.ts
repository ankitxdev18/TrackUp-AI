import { and, eq, sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { projects, tasks, users } from "../src/db/schema.js";

describe("Transactional Project Deletion (Phase 1B.2c)", () => {
  const TEST_DOMAIN = "proj_tx_test.trackup.local";
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
        email: `tx_usera_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashA",
        name: "User Alice",
      })
      .returning();
    userAId = userA.id;

    // Create User B (for cross-tenant IDOR verification)
    const [userB] = await db
      .insert(users)
      .values({
        email: `tx_userb_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "hashB",
        name: "User Bob",
      })
      .returning();
    userBId = userB.id;

    app = buildApp({ logger: false });
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await closeDatabasePool();
  });

  it("1. atomically deletes project and detaches related tasks (setting projectId to NULL)", async () => {
    // Create a project for User A
    const [project] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Launch Campaign",
        description: "Initial launch marketing",
      })
      .returning();

    // Create multiple tasks linked to this project
    const [task1] = await db
      .insert(tasks)
      .values({
        userId: userAId,
        projectId: project.id,
        title: "Draft press release",
        status: "TODO",
      })
      .returning();

    const [task2] = await db
      .insert(tasks)
      .values({
        userId: userAId,
        projectId: project.id,
        title: "Finalize budget",
        status: "COMPLETED",
      })
      .returning();

    // Execute DELETE /api/projects/:id
    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${project.id}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      id: project.id,
    });

    // Verify project no longer exists in database
    const dbProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, project.id));
    expect(dbProject).toHaveLength(0);

    // Verify tasks still exist and their projectId is now NULL
    const dbTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userAId), eq(tasks.id, task1.id)));
    expect(dbTasks).toHaveLength(1);
    expect(dbTasks[0].projectId).toBeNull();
    expect(dbTasks[0].title).toBe("Draft press release");

    const dbTask2 = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userAId), eq(tasks.id, task2.id)));
    expect(dbTask2).toHaveLength(1);
    expect(dbTask2[0].projectId).toBeNull();
    expect(dbTask2[0].status).toBe("COMPLETED");
  });

  it("2. rolls back task detachment if project deletion fails mid-transaction", async () => {
    // Create a project for User A
    const [project] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Critical Architecture Migration",
        description: "Must not lose relationship on failure",
      })
      .returning();

    // Create tasks linked to this project
    const [task1] = await db
      .insert(tasks)
      .values({
        userId: userAId,
        projectId: project.id,
        title: "Database schema migration",
        status: "TODO",
      })
      .returning();

    const [task2] = await db
      .insert(tasks)
      .values({
        userId: userAId,
        projectId: project.id,
        title: "Verify backup integrity",
        status: "TODO",
      })
      .returning();

    // Spy on db.transaction to intercept the transaction and simulate a failure during project delete
    const originalTransaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return originalTransaction(async (tx: any) => {
        const originalDelete = tx.delete.bind(tx);
        tx.delete = (table: any) => {
          if (table === projects) {
            throw new Error("Simulated database failure during project deletion");
          }
          return originalDelete(table);
        };
        return cb(tx);
      });
    });

    // Execute DELETE /api/projects/:id
    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${project.id}`,
      headers: { "x-dev-user-id": userAId },
    });

    // Should return 500 internal server error
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe("INTERNAL_SERVER_ERROR");

    // CRITICAL ATOMICITY CHECK:
    // Because the transaction rolled back:
    // 1. The project must STILL exist
    const [remainingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, project.id));
    expect(remainingProject).toBeDefined();
    expect(remainingProject.id).toBe(project.id);

    // 2. The tasks must STILL be attached to this project (NOT detached / orphaned)
    const [persistedTask1] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task1.id));
    expect(persistedTask1).toBeDefined();
    expect(persistedTask1.projectId).toBe(project.id);

    const [persistedTask2] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task2.id));
    expect(persistedTask2).toBeDefined();
    expect(persistedTask2.projectId).toBe(project.id);
  });

  it("3. rolls back transaction if task detachment query fails", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Rollback On Update Failure",
      })
      .returning();

    const [task] = await db
      .insert(tasks)
      .values({
        userId: userAId,
        projectId: project.id,
        title: "Pre-attached task",
      })
      .returning();

    // Spy on db.transaction to simulate failure during task detachment update
    const originalTransaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return originalTransaction(async (tx: any) => {
        const originalUpdate = tx.update.bind(tx);
        tx.update = (table: any) => {
          if (table === tasks) {
            throw new Error("Simulated database failure during task detachment");
          }
          return originalUpdate(table);
        };
        return cb(tx);
      });
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${project.id}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe("INTERNAL_SERVER_ERROR");

    // Project must not be deleted
    const [remainingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, project.id));
    expect(remainingProject).toBeDefined();

    // Task must still reference project
    const [persistedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(persistedTask.projectId).toBe(project.id);
  });

  it("4. rejects deletion and modifies no records when user does not own project (IDOR)", async () => {
    // Create project for User A
    const [projectA] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Alice Confidential Project",
      })
      .returning();

    const [taskA] = await db
      .insert(tasks)
      .values({
        userId: userAId,
        projectId: projectA.id,
        title: "Alice task",
      })
      .returning();

    // User B attempts to delete User A's project
    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectA.id}`,
      headers: { "x-dev-user-id": userBId },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("PROJECT_NOT_FOUND");

    // Verify User A's project and task remain unchanged
    const [checkProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectA.id));
    expect(checkProject).toBeDefined();

    const [checkTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskA.id));
    expect(checkTask.projectId).toBe(projectA.id);
  });

  it("5. returns 404 when project does not exist", async () => {
    const nonexistentId = crypto.randomUUID();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${nonexistentId}`,
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("PROJECT_NOT_FOUND");
  });

  it("6. returns 400 when project ID has invalid format", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/projects/not-a-valid-uuid",
      headers: { "x-dev-user-id": userAId },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("INVALID_ID");
  });
});
