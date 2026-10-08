import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { habitCompletions, habits, users } from "../src/db/schema.js";

describe("Habits Database Foundation (Milestone H02)", () => {
  const TEST_DOMAIN = "habits_db_h02.trackup.local";
  let userAId: string;
  let userBId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create primary test user A
    const [userA] = await db
      .insert(users)
      .values({
        email: `habit_owner_a_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Habit User A",
      })
      .returning();
    userAId = userA.id;

    // Create secondary test user B for isolation testing
    const [userB] = await db
      .insert(users)
      .values({
        email: `habit_owner_b_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Habit User B",
      })
      .returning();
    userBId = userB.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  // ========================================================
  // A. TABLE CREATION & METADATA
  // ========================================================
  describe("A. Table Creation & Metadata", () => {
    it("A1. verifies habits table exists in the public schema", async () => {
      const res = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'habits'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.table_name).toBe("habits");
    });

    it("A2. verifies habit_completions table exists in the public schema", async () => {
      const res = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'habit_completions'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.table_name).toBe("habit_completions");
    });

    it("A3. verifies users.timezone column exists with correct properties", async () => {
      const res = await db.execute(
        sql`SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'timezone'`
      );
      expect(res.rows.length).toBe(1);
      const col = res.rows[0] as {
        data_type: string;
        character_maximum_length: number;
        is_nullable: string;
        column_default: string;
      };
      expect(col.data_type).toBe("character varying");
      expect(col.character_maximum_length).toBe(100);
      expect(col.is_nullable).toBe("NO");
      expect(col.column_default).toContain("UTC");
    });

    it("A4. verifies habit_completions columns: completed_date is native DATE and completed_at is TIMESTAMPTZ", async () => {
      const res = await db.execute(
        sql`SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'habit_completions'
            ORDER BY ordinal_position`
      );
      const cols = new Map(res.rows.map((r: any) => [r.column_name, r]));

      expect(cols.has("id")).toBe(true);
      expect(cols.get("id").data_type).toBe("uuid");

      expect(cols.has("habit_id")).toBe(true);
      expect(cols.get("habit_id").data_type).toBe("uuid");

      expect(cols.has("completed_date")).toBe(true);
      expect(cols.get("completed_date").data_type).toBe("date");
      expect(cols.get("completed_date").is_nullable).toBe("NO");

      expect(cols.has("completed_at")).toBe(true);
      expect(cols.get("completed_at").data_type).toBe("timestamp with time zone");

      expect(cols.has("created_at")).toBe(true);
      expect(cols.get("created_at").data_type).toBe("timestamp with time zone");

      // Invariant: habit_completions must NOT have a user_id column
      expect(cols.has("user_id")).toBe(false);
    });

    it("A5. verifies habits schema contains all required MVP columns without speculative fields", async () => {
      const res = await db.execute(
        sql`SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'habits'
            ORDER BY ordinal_position`
      );
      const cols = new Map(res.rows.map((r: any) => [r.column_name, r]));

      expect(cols.has("id")).toBe(true);
      expect(cols.has("user_id")).toBe(true);
      expect(cols.has("title")).toBe(true);
      expect(cols.has("description")).toBe(true);
      expect(cols.has("frequency")).toBe(true);
      expect(cols.has("status")).toBe(true);
      expect(cols.has("created_at")).toBe(true);
      expect(cols.has("updated_at")).toBe(true);

      // Verify absence of speculative V1/V2 fields
      expect(cols.has("priority")).toBe(false);
      expect(cols.has("category")).toBe(false);
      expect(cols.has("color")).toBe(false);
      expect(cols.has("target_days")).toBe(false);
      expect(cols.has("rrule")).toBe(false);
      expect(cols.has("current_streak")).toBe(false);
      expect(cols.has("longest_streak")).toBe(false);
      expect(cols.has("archived_at")).toBe(false);
    });
  });

  // ========================================================
  // B. DEFAULT VALUES
  // ========================================================
  describe("B. Default Values", () => {
    it("B1. defaults users.timezone to UTC when not specified", async () => {
      const [user] = await db
        .insert(users)
        .values({
          email: `tz_default_test_${Date.now()}@${TEST_DOMAIN}`,
          passwordHash: "dummyhash",
          name: "Default Timezone User",
        })
        .returning();

      expect(user.timezone).toBe("UTC");
    });

    it("B2. defaults habits frequency to DAILY and status to ACTIVE", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Drink Morning Water",
        })
        .returning();

      expect(habit.frequency).toBe("DAILY");
      expect(habit.status).toBe("ACTIVE");
      expect(habit.createdAt).toBeInstanceOf(Date);
      expect(habit.updatedAt).toBeInstanceOf(Date);
    });

    it("B3. defaults habit_completions completed_at and created_at to now()", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Morning Stretch",
        })
        .returning();

      const [completion] = await db
        .insert(habitCompletions)
        .values({
          habitId: habit.id,
          completedDate: "2026-10-08",
        })
        .returning();

      expect(completion.completedDate).toBe("2026-10-08");
      expect(completion.completedAt).toBeInstanceOf(Date);
      expect(completion.createdAt).toBeInstanceOf(Date);
    });
  });

  // ========================================================
  // C. FOREIGN KEYS
  // ========================================================
  describe("C. Foreign Keys", () => {
    it("C1. rejects inserting habit with non-existent user_id foreign key", async () => {
      const fakeUserId = "00000000-0000-0000-0000-000000000000";
      try {
        await db.insert(habits).values({
          userId: fakeUserId,
          title: "Orphan Habit",
        });
        expect.unreachable("Should have failed foreign key constraint on habits.user_id");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23503"); // foreign_key_violation
      }
    });

    it("C2. rejects inserting completion with non-existent habit_id foreign key", async () => {
      const fakeHabitId = "00000000-0000-0000-0000-000000000000";
      try {
        await db.insert(habitCompletions).values({
          habitId: fakeHabitId,
          completedDate: "2026-10-08",
        });
        expect.unreachable("Should have failed foreign key constraint on habit_completions.habit_id");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23503"); // foreign_key_violation
      }
    });
  });

  // ========================================================
  // D. CASCADE DELETION
  // ========================================================
  describe("D. Cascade Deletion", () => {
    it("D1. deleting a habit cascades and deletes all related habit_completions", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Temporary Habit",
        })
        .returning();

      await db.insert(habitCompletions).values({
        habitId: habit.id,
        completedDate: "2026-10-07",
      });
      await db.insert(habitCompletions).values({
        habitId: habit.id,
        completedDate: "2026-10-08",
      });

      // Verify completions exist
      const before = await db
        .select()
        .from(habitCompletions)
        .where(sql`habit_id = ${habit.id}`);
      expect(before.length).toBe(2);

      // Delete habit
      await db.delete(habits).where(sql`id = ${habit.id}`);

      // Verify completions were cascaded
      const after = await db
        .select()
        .from(habitCompletions)
        .where(sql`habit_id = ${habit.id}`);
      expect(after.length).toBe(0);
    });

    it("D2. deleting a user cascades and deletes all habits and their completions", async () => {
      const [ephemeralUser] = await db
        .insert(users)
        .values({
          email: `cascade_user_${Date.now()}@${TEST_DOMAIN}`,
          passwordHash: "dummyhash",
          name: "Ephemeral Cascade User",
        })
        .returning();

      const [habit] = await db
        .insert(habits)
        .values({
          userId: ephemeralUser.id,
          title: "Cascaded Habit",
        })
        .returning();

      const [completion] = await db
        .insert(habitCompletions)
        .values({
          habitId: habit.id,
          completedDate: "2026-10-08",
        })
        .returning();

      // Delete user
      await db.delete(users).where(sql`id = ${ephemeralUser.id}`);

      // Verify habit deleted
      const foundHabits = await db
        .select()
        .from(habits)
        .where(sql`id = ${habit.id}`);
      expect(foundHabits.length).toBe(0);

      // Verify completion deleted
      const foundCompletions = await db
        .select()
        .from(habitCompletions)
        .where(sql`id = ${completion.id}`);
      expect(foundCompletions.length).toBe(0);
    });
  });

  // ========================================================
  // E. CONSTRAINT ENFORCEMENT
  // ========================================================
  describe("E. Constraint Enforcement", () => {
    it("E1. rejects habit frequency other than 'DAILY'", async () => {
      try {
        await db.execute(
          sql`INSERT INTO habits (user_id, title, frequency) VALUES (${userAId}, 'Invalid Freq Habit', 'WEEKLY')`
        );
        expect.unreachable("Should have failed check constraint habits_frequency_check");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("E2. rejects habit status other than 'ACTIVE' or 'ARCHIVED'", async () => {
      try {
        await db.execute(
          sql`INSERT INTO habits (user_id, title, status) VALUES (${userAId}, 'Invalid Status Habit', 'DELETED')`
        );
        expect.unreachable("Should have failed check constraint habits_status_check");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("E3. accepts habit status 'ARCHIVED'", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Archived Habit",
          status: "ARCHIVED",
        })
        .returning();

      expect(habit.status).toBe("ARCHIVED");
    });

    it("E4. rejects null title on habits", async () => {
      try {
        await db.execute(
          sql`INSERT INTO habits (user_id, title) VALUES (${userAId}, NULL)`
        );
        expect.unreachable("Should have failed not-null constraint on title");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }
    });

    it("E5. rejects null completed_date on habit_completions", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Test Habit for Null Date",
        })
        .returning();

      try {
        await db.execute(
          sql`INSERT INTO habit_completions (habit_id, completed_date) VALUES (${habit.id}, NULL)`
        );
        expect.unreachable("Should have failed not-null constraint on completed_date");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }
    });
  });

  // ========================================================
  // F. COMPLETION UNIQUENESS
  // ========================================================
  describe("F. Completion Uniqueness", () => {
    it("F1. enforces UNIQUE(habit_id, completed_date): duplicate completion on same day fails", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Unique Date Habit",
        })
        .returning();

      const testDate = "2026-10-08";

      // First insertion succeeds
      const [first] = await db
        .insert(habitCompletions)
        .values({
          habitId: habit.id,
          completedDate: testDate,
        })
        .returning();
      expect(first.completedDate).toBe(testDate);

      // Second insertion on same habit and same calendar date fails
      try {
        await db.insert(habitCompletions).values({
          habitId: habit.id,
          completedDate: testDate,
        });
        expect.unreachable("Should have failed unique constraint on (habit_id, completed_date)");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23505"); // unique_violation
      }
    });

    it("F2. allows multiple distinct calendar dates for the same habit", async () => {
      const [habit] = await db
        .insert(habits)
        .values({
          userId: userAId,
          title: "Multi-Day Habit",
        })
        .returning();

      const [c1] = await db
        .insert(habitCompletions)
        .values({ habitId: habit.id, completedDate: "2026-10-06" })
        .returning();
      const [c2] = await db
        .insert(habitCompletions)
        .values({ habitId: habit.id, completedDate: "2026-10-07" })
        .returning();
      const [c3] = await db
        .insert(habitCompletions)
        .values({ habitId: habit.id, completedDate: "2026-10-08" })
        .returning();

      expect(c1.completedDate).toBe("2026-10-06");
      expect(c2.completedDate).toBe("2026-10-07");
      expect(c3.completedDate).toBe("2026-10-08");
    });

    it("F3. allows different habits to share the same completion calendar date", async () => {
      const [habit1] = await db
        .insert(habits)
        .values({ userId: userAId, title: "Habit 1" })
        .returning();
      const [habit2] = await db
        .insert(habits)
        .values({ userId: userAId, title: "Habit 2" })
        .returning();

      const sharedDate = "2026-10-08";

      const [c1] = await db
        .insert(habitCompletions)
        .values({ habitId: habit1.id, completedDate: sharedDate })
        .returning();
      const [c2] = await db
        .insert(habitCompletions)
        .values({ habitId: habit2.id, completedDate: sharedDate })
        .returning();

      expect(c1.completedDate).toBe(sharedDate);
      expect(c2.completedDate).toBe(sharedDate);
      expect(c1.habitId).not.toBe(c2.habitId);
    });
  });

  // ========================================================
  // G. NATIVE DATE BEHAVIOR
  // ========================================================
  describe("G. Native PostgreSQL DATE Behavior", () => {
    it("G1. confirms column data type is genuinely regtype 'date'", async () => {
      const [habit] = await db
        .insert(habits)
        .values({ userId: userAId, title: "Date Type Test" })
        .returning();

      await db.insert(habitCompletions).values({
        habitId: habit.id,
        completedDate: "2026-10-08",
      });

      const res = await db.execute(
        sql`SELECT pg_typeof(completed_date) as col_type FROM habit_completions WHERE habit_id = ${habit.id}`
      );
      expect(res.rows[0]?.col_type).toBe("date");
    });

    it("G2. sorts dates strictly chronologically at the database level", async () => {
      const [habit] = await db
        .insert(habits)
        .values({ userId: userAId, title: "Sorting Habit" })
        .returning();

      // Insert in non-chronological order
      await db.insert(habitCompletions).values({ habitId: habit.id, completedDate: "2026-10-08" });
      await db.insert(habitCompletions).values({ habitId: habit.id, completedDate: "2026-09-29" });
      await db.insert(habitCompletions).values({ habitId: habit.id, completedDate: "2026-10-01" });

      const sortedRows = await db.execute(
        sql`SELECT completed_date::text as d FROM habit_completions WHERE habit_id = ${habit.id} ORDER BY completed_date ASC`
      );

      const dates = sortedRows.rows.map((r: any) => r.d);
      expect(dates).toEqual(["2026-09-29", "2026-10-01", "2026-10-08"]);
    });

    it("G3. rejects invalid calendar date strings via native PostgreSQL date validation", async () => {
      const [habit] = await db
        .insert(habits)
        .values({ userId: userAId, title: "Invalid Date Habit" })
        .returning();

      try {
        await db.execute(
          sql`INSERT INTO habit_completions (habit_id, completed_date) VALUES (${habit.id}, '2026-02-30')`
        );
        expect.unreachable("PostgreSQL should have rejected non-existent calendar date '2026-02-30'");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        // 22008 = datetime_field_overflow
        expect(["22008", "22007"]).toContain(pgError?.code);
      }
    });
  });

  // ========================================================
  // H. TENANT ISOLATION FOUNDATION
  // ========================================================
  describe("H. Tenant Isolation Foundation", () => {
    it("H1. completion ownership is reachable solely through habits -> users", async () => {
      const [userAHabit] = await db
        .insert(habits)
        .values({ userId: userAId, title: "User A Private Habit" })
        .returning();

      const [userBHabit] = await db
        .insert(habits)
        .values({ userId: userBId, title: "User B Private Habit" })
        .returning();

      await db.insert(habitCompletions).values({
        habitId: userAHabit.id,
        completedDate: "2026-10-08",
      });

      await db.insert(habitCompletions).values({
        habitId: userBHabit.id,
        completedDate: "2026-10-08",
      });

      // Query User A's completions by joining through habits
      const userACompletions = await db.execute(
        sql`SELECT hc.id, hc.completed_date::text, h.title
            FROM habit_completions hc
            INNER JOIN habits h ON h.id = hc.habit_id
            WHERE h.user_id = ${userAId} AND hc.habit_id = ${userAHabit.id}`
      );

      expect(userACompletions.rows.length).toBe(1);
      expect(userACompletions.rows[0]?.title).toBe("User A Private Habit");

      // Verify User B cannot see User A's completions through tenant-scoped join
      const crossTenantCompletions = await db.execute(
        sql`SELECT hc.id
            FROM habit_completions hc
            INNER JOIN habits h ON h.id = hc.habit_id
            WHERE h.user_id = ${userBId} AND hc.habit_id = ${userAHabit.id}`
      );
      expect(crossTenantCompletions.rows.length).toBe(0);
    });

    it("H2. verifies absence of redundant user_id on habit_completions preventing desynchronization", async () => {
      const res = await db.execute(
        sql`SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'habit_completions' AND column_name = 'user_id'`
      );
      expect(res.rows.length).toBe(0);
    });
  });

  // ========================================================
  // I. TIMEZONE FOUNDATION
  // ========================================================
  describe("I. Timezone Foundation", () => {
    it("I1. stores and retrieves valid IANA timezones on users table", async () => {
      const [customTzUser] = await db
        .insert(users)
        .values({
          email: `custom_tz_${Date.now()}@${TEST_DOMAIN}`,
          passwordHash: "dummyhash",
          name: "Kolkata User",
          timezone: "Asia/Kolkata",
        })
        .returning();

      expect(customTzUser.timezone).toBe("Asia/Kolkata");

      const [retrieved] = await db
        .select()
        .from(users)
        .where(sql`id = ${customTzUser.id}`);
      expect(retrieved?.timezone).toBe("Asia/Kolkata");
    });
  });
});
