import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { expenses, users } from "../src/db/schema.js";

describe("Expenses Schema & Database Foundation (Milestone 5)", () => {
  const TEST_DOMAIN = "expenses_db_test.trackup.local";
  let testUserId: string;
  let secondaryUserId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create primary test user
    const [userA] = await db
      .insert(users)
      .values({
        email: `expense_owner_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Expense Primary User",
      })
      .returning();

    testUserId = userA.id;

    // Create secondary test user for isolation checks
    const [userB] = await db
      .insert(users)
      .values({
        email: `expense_secondary_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Expense Secondary User",
      })
      .returning();

    secondaryUserId = userB.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. TABLE STRUCTURE & COLUMNS
  // ==========================================
  describe("Table Structure & Column Definitions", () => {
    it("1. verifies the expenses table exists in the public schema", async () => {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses'`
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.table_name).toBe("expenses");
    });

    it("2. verifies expected columns, data types, and nullability", async () => {
      const result = await db.execute(
        sql`SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'expenses' 
            ORDER BY ordinal_position`
      );

      const columns = new Map(
        result.rows.map((r) => [
          r.column_name as string,
          {
            dataType: r.data_type as string,
            isNullable: r.is_nullable as string,
          },
        ])
      );

      // Verify required fields
      expect(columns.get("id")).toEqual({ dataType: "uuid", isNullable: "NO" });
      expect(columns.get("user_id")).toEqual({ dataType: "uuid", isNullable: "NO" });
      expect(columns.get("amount_cents")).toEqual({ dataType: "integer", isNullable: "NO" });
      expect(columns.get("date")).toEqual({ dataType: "character varying", isNullable: "NO" });
      expect(columns.get("category_id")).toEqual({ dataType: "character varying", isNullable: "NO" });
      expect(columns.get("description")).toEqual({ dataType: "character varying", isNullable: "YES" });
      expect(columns.get("created_at")).toEqual({ dataType: "timestamp with time zone", isNullable: "NO" });
      expect(columns.get("updated_at")).toEqual({ dataType: "timestamp with time zone", isNullable: "NO" });
    });
  });

  // ==========================================
  // 2. INSERTION & DEFAULT VALUES
  // ==========================================
  describe("Expense Insertion & Field Integrity", () => {
    it("3. successfully inserts an expense with all fields", async () => {
      const [inserted] = await db
        .insert(expenses)
        .values({
          userId: testUserId,
          amountCents: 4250,
          date: "2026-10-12",
          categoryId: "food",
          description: "Whole Foods grocery haul",
        })
        .returning();

      expect(inserted.id).toBeDefined();
      expect(inserted.userId).toBe(testUserId);
      expect(inserted.amountCents).toBe(4250);
      expect(inserted.date).toBe("2026-10-12");
      expect(inserted.categoryId).toBe("food");
      expect(inserted.description).toBe("Whole Foods grocery haul");
      expect(inserted.createdAt).toBeInstanceOf(Date);
      expect(inserted.updatedAt).toBeInstanceOf(Date);
    });

    it("4. successfully inserts an expense with minimal fields (null description)", async () => {
      const [inserted] = await db
        .insert(expenses)
        .values({
          userId: testUserId,
          amountCents: 1500,
          date: "2026-10-11",
          categoryId: "transport",
        })
        .returning();

      expect(inserted.id).toBeDefined();
      expect(inserted.amountCents).toBe(1500);
      expect(inserted.description).toBeNull();
    });
  });

  // ==========================================
  // 3. CONSTRAINT & INTEGRITY ENFORCEMENT
  // ==========================================
  describe("Database Constraints & Invariant Enforcement", () => {
    it("5. rejects inserting an expense with zero or negative amount_cents", async () => {
      // Zero amount
      try {
        await db.insert(expenses).values({
          userId: testUserId,
          amountCents: 0,
          date: "2026-10-12",
          categoryId: "food",
        });
        expect.unreachable("Should have failed check constraint on zero amount");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      // Negative amount
      try {
        await db.insert(expenses).values({
          userId: testUserId,
          amountCents: -500,
          date: "2026-10-12",
          categoryId: "food",
        });
        expect.unreachable("Should have failed check constraint on negative amount");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("6. rejects inserting an expense with non-existent user_id foreign key", async () => {
      const nonExistentUserId = "00000000-0000-0000-0000-000000000000";
      try {
        await db.insert(expenses).values({
          userId: nonExistentUserId,
          amountCents: 2000,
          date: "2026-10-12",
          categoryId: "shopping",
        });
        expect.unreachable("Should have failed foreign key constraint on user_id");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23503"); // foreign_key_violation
      }
    });

    it("7. enforces NOT NULL constraints on amount_cents, date, and category_id", async () => {
      // Missing amountCents
      try {
        await db.insert(expenses).values({
          userId: testUserId,
          amountCents: null as any,
          date: "2026-10-12",
          categoryId: "food",
        });
        expect.unreachable("Should have failed NOT NULL violation on amountCents");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }

      // Missing date
      try {
        await db.insert(expenses).values({
          userId: testUserId,
          amountCents: 1000,
          date: null as any,
          categoryId: "food",
        });
        expect.unreachable("Should have failed NOT NULL violation on date");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }

      // Missing categoryId
      try {
        await db.insert(expenses).values({
          userId: testUserId,
          amountCents: 1000,
          date: "2026-10-12",
          categoryId: null as any,
        });
        expect.unreachable("Should have failed NOT NULL violation on categoryId");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }
    });
  });

  // ==========================================
  // 4. CASCADE DELETION & TENANT ISOLATION
  // ==========================================
  describe("Cascade Deletion & Tenant Isolation", () => {
    it("8. automatically deletes expenses when parent user is deleted", async () => {
      // Create a dedicated user for deletion test
      const [disposableUser] = await db
        .insert(users)
        .values({
          email: `disposable_${Date.now()}@${TEST_DOMAIN}`,
          passwordHash: "$argon2id$dummy",
          name: "Disposable User",
        })
        .returning();

      // Insert 2 expenses for this user
      await db.insert(expenses).values([
        {
          userId: disposableUser.id,
          amountCents: 3000,
          date: "2026-10-12",
          categoryId: "health",
        },
        {
          userId: disposableUser.id,
          amountCents: 4500,
          date: "2026-10-11",
          categoryId: "education",
        },
      ]);

      // Verify expenses exist
      const before = await db
        .select()
        .from(expenses)
        .where(eq(expenses.userId, disposableUser.id));
      expect(before.length).toBe(2);

      // Delete user
      await db.delete(users).where(eq(users.id, disposableUser.id));

      // Verify expenses were cascade deleted
      const after = await db
        .select()
        .from(expenses)
        .where(eq(expenses.userId, disposableUser.id));
      expect(after.length).toBe(0);
    });
  });

  // ==========================================
  // 5. INDEXES & PERFORMANCE
  // ==========================================
  describe("Index Verification", () => {
    it("9. verifies that required indexes exist on the expenses table", async () => {
      const result = await db.execute(
        sql`SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'expenses'`
      );

      const indexNames = result.rows.map((r) => r.indexname as string);
      expect(indexNames).toContain("expenses_user_id_idx");
      expect(indexNames).toContain("expenses_user_date_idx");
      expect(indexNames).toContain("expenses_user_category_idx");
    });
  });
});
