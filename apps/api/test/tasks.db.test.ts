import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { tasks, users } from "../src/db/schema.js";

describe("Task Schema & Database Integration (Milestone 2)", () => {
  const TEST_DOMAIN = "tasks_db_test.trackup.local";
  let testUserId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create a parent test user for foreign-key task operations
    const [user] = await db
      .insert(users)
      .values({
        email: `task_owner_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Task Owner User",
      })
      .returning();

    testUserId = user.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  it("1. verifies the tasks table exists in public schema", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.table_name).toBe("tasks");
  });

  it("2. inserts a valid task and defaults status to TODO and priority to MEDIUM", async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Test Task Insertion",
      })
      .returning();

    expect(task).toBeDefined();
    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(task.userId).toBe(testUserId);
    expect(task.title).toBe("Test Task Insertion");
    expect(task.status).toBe("TODO");
    expect(task.priority).toBe("MEDIUM");
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toBeInstanceOf(Date);
    expect(task.updatedAt).toBeInstanceOf(Date);
  });

  it("3. stores custom priority and due date", async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "High Priority Due Tomorrow",
        priority: "HIGH",
        dueDate: "2026-10-05",
      })
      .returning();

    expect(task.priority).toBe("HIGH");
    expect(task.dueDate).toBe("2026-10-05");
  });

  it("4. updates task status to COMPLETED and sets completedAt", async () => {
    const [created] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Task to complete",
      })
      .returning();

    const now = new Date();
    const [updated] = await db
      .update(tasks)
      .set({
        status: "COMPLETED",
        completedAt: now,
        updatedAt: now,
      })
      .where(sql`id = ${created.id}`)
      .returning();

    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it("5. enforces foreign key cascade when user is deleted", async () => {
    // Create ephemeral user
    const [ephemeralUser] = await db
      .insert(users)
      .values({
        email: `ephemeral_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Ephemeral User",
      })
      .returning();

    // Create task for this user
    const [ephemeralTask] = await db
      .insert(tasks)
      .values({
        userId: ephemeralUser.id,
        title: "Ephemeral Task",
      })
      .returning();

    // Delete ephemeral user
    await db.delete(users).where(sql`id = ${ephemeralUser.id}`);

    // Verify task was cascaded
    const [foundTask] = await db
      .select()
      .from(tasks)
      .where(sql`id = ${ephemeralTask.id}`);

    expect(foundTask).toBeUndefined();
  });

  it("6. rejects inserting task with non-existent user_id foreign key", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    try {
      await db.insert(tasks).values({
        userId: fakeUserId,
        title: "Orphan Task",
      });
      expect.unreachable("Should have failed foreign key constraint");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23503"); // foreign_key_violation
    }
  });

  it("7. enforces NOT NULL on required fields (title, user_id)", async () => {
    try {
      await db.execute(
        sql`INSERT INTO tasks (user_id, status) VALUES (${testUserId}, 'TODO')`
      );
      expect.unreachable("Should have failed NOT NULL on title");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string; column?: string } })?.cause;
      expect(pgError?.code).toBe("23502");
      expect(pgError?.column).toBe("title");
    }
  });
});
