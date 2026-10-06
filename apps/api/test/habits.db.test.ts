import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { habitCompletions, habits, users } from "../src/db/schema.js";

describe("Habit Schema & Database Foundation (Milestone H01-A)", () => {
  const TEST_DOMAIN = "habits_db_test.trackup.local";
  let testUserId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create a parent test user for foreign-key habit operations
    const [user] = await db
      .insert(users)
      .values({
        email: `habit_owner_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Habit Owner User",
      })
      .returning();

    testUserId = user.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  it("1. verifies the habits table exists in the public schema", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'habits'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.table_name).toBe("habits");
  });

  it("2. verifies the habit_completions table exists in the public schema", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'habit_completions'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.table_name).toBe("habit_completions");
  });

  it("3. inserts a valid habit and defaults frequency to DAILY and status to ACTIVE", async () => {
    const [habit] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Morning Routine",
        description: "Drink water and stretch",
      })
      .returning();

    expect(habit).toBeDefined();
    expect(habit.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(habit.userId).toBe(testUserId);
    expect(habit.title).toBe("Morning Routine");
    expect(habit.description).toBe("Drink water and stretch");
    expect(habit.frequency).toBe("DAILY");
    expect(habit.status).toBe("ACTIVE");
    expect(habit.createdAt).toBeInstanceOf(Date);
    expect(habit.updatedAt).toBeInstanceOf(Date);
  });

  it("4. inserts a completion record with exact calendar date string (YYYY-MM-DD)", async () => {
    const [habit] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Evening Meditation",
      })
      .returning();

    const calendarDate = "2026-10-06";
    const [completion] = await db
      .insert(habitCompletions)
      .values({
        habitId: habit.id,
        userId: testUserId,
        completedDate: calendarDate,
      })
      .returning();

    expect(completion).toBeDefined();
    expect(completion.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(completion.habitId).toBe(habit.id);
    expect(completion.userId).toBe(testUserId);
    expect(completion.completedDate).toBe(calendarDate);
    expect(completion.completedAt).toBeInstanceOf(Date);
    expect(completion.createdAt).toBeInstanceOf(Date);
  });

  it("5. enforces unique constraint: duplicate completion on same habit & same date fails", async () => {
    const [habit] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Daily Journaling",
      })
      .returning();

    const targetDate = "2026-10-06";

    // First completion succeeds
    await db.insert(habitCompletions).values({
      habitId: habit.id,
      userId: testUserId,
      completedDate: targetDate,
    });

    // Second completion on the same habit and date MUST fail with unique constraint violation (23505)
    try {
      await db.insert(habitCompletions).values({
        habitId: habit.id,
        userId: testUserId,
        completedDate: targetDate,
      });
      expect.unreachable("Should have rejected duplicate completion on the same calendar date");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23505"); // unique_violation
    }

    // Completion for next day on the same habit succeeds
    const [nextDayCompletion] = await db
      .insert(habitCompletions)
      .values({
        habitId: habit.id,
        userId: testUserId,
        completedDate: "2026-10-07",
      })
      .returning();

    expect(nextDayCompletion.completedDate).toBe("2026-10-07");
  });

  it("6. allows different habits to have completions on the same calendar date", async () => {
    const [habitA] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Habit Alpha",
      })
      .returning();

    const [habitB] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Habit Beta",
      })
      .returning();

    const sameDate = "2026-10-06";

    const [compA] = await db
      .insert(habitCompletions)
      .values({
        habitId: habitA.id,
        userId: testUserId,
        completedDate: sameDate,
      })
      .returning();

    const [compB] = await db
      .insert(habitCompletions)
      .values({
        habitId: habitB.id,
        userId: testUserId,
        completedDate: sameDate,
      })
      .returning();

    expect(compA.completedDate).toBe(sameDate);
    expect(compB.completedDate).toBe(sameDate);
    expect(compA.habitId).not.toBe(compB.habitId);
  });

  it("7. enforces cascade deletion: deleting a habit deletes all its completions", async () => {
    const [habit] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Ephemeral Habit",
      })
      .returning();

    await db.insert(habitCompletions).values({
      habitId: habit.id,
      userId: testUserId,
      completedDate: "2026-10-06",
    });

    await db.insert(habitCompletions).values({
      habitId: habit.id,
      userId: testUserId,
      completedDate: "2026-10-07",
    });

    // Verify 2 completions exist
    const completionsBefore = await db
      .select()
      .from(habitCompletions)
      .where(sql`habit_id = ${habit.id}`);
    expect(completionsBefore.length).toBe(2);

    // Delete the habit
    await db.delete(habits).where(sql`id = ${habit.id}`);

    // Verify completions were cascaded
    const completionsAfter = await db
      .select()
      .from(habitCompletions)
      .where(sql`habit_id = ${habit.id}`);
    expect(completionsAfter.length).toBe(0);
  });

  it("8. enforces cascade deletion: deleting a user deletes their habits and completions", async () => {
    // Create ephemeral user
    const [ephemeralUser] = await db
      .insert(users)
      .values({
        email: `ephemeral_habit_user_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Ephemeral Habit User",
      })
      .returning();

    // Create habit
    const [habit] = await db
      .insert(habits)
      .values({
        userId: ephemeralUser.id,
        title: "User Cascaded Habit",
      })
      .returning();

    // Create completion
    const [completion] = await db
      .insert(habitCompletions)
      .values({
        habitId: habit.id,
        userId: ephemeralUser.id,
        completedDate: "2026-10-06",
      })
      .returning();

    // Delete ephemeral user
    await db.delete(users).where(sql`id = ${ephemeralUser.id}`);

    // Verify habit was cascaded
    const foundHabit = await db
      .select()
      .from(habits)
      .where(sql`id = ${habit.id}`);
    expect(foundHabit.length).toBe(0);

    // Verify completion was cascaded
    const foundCompletion = await db
      .select()
      .from(habitCompletions)
      .where(sql`id = ${completion.id}`);
    expect(foundCompletion.length).toBe(0);
  });

  it("9. rejects inserting habit with non-existent user_id foreign key", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    try {
      await db.insert(habits).values({
        userId: fakeUserId,
        title: "Orphan Habit",
      });
      expect.unreachable("Should have failed foreign key constraint on user_id");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23503"); // foreign_key_violation
    }
  });

  it("10. rejects inserting completion with non-existent habit_id foreign key", async () => {
    const fakeHabitId = "00000000-0000-0000-0000-000000000000";
    try {
      await db.insert(habitCompletions).values({
        habitId: fakeHabitId,
        userId: testUserId,
        completedDate: "2026-10-06",
      });
      expect.unreachable("Should have failed foreign key constraint on habit_id");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23503"); // foreign_key_violation
    }
  });

  it("11. verifies required fields cannot be null", async () => {
    // Null title in habits
    try {
      await db.execute(
        sql`INSERT INTO habits (user_id) VALUES (${testUserId})`
      );
      expect.unreachable("Should have failed NOT NULL on title");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23502"); // not_null_violation
    }
  });
});
