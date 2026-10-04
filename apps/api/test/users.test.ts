import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";

describe("User Schema & Database Integration (F02)", () => {
  const TEST_DOMAIN = "test.trackup.local";

  const cleanupTestUsers = async () => {
    // Isolated cleanup: deletes only records created by this test suite
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await closeDatabasePool();
  });

  it("1. verifies database connectivity via Drizzle client", async () => {
    const result = await db.execute(sql`SELECT 1 AS ping`);
    expect(result.rows[0]).toEqual({ ping: 1 });
  });

  it("2. verifies the users table exists in the public schema", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.table_name).toBe("users");
  });

  it("3 & 4. inserts a valid user and queries it back", async () => {
    const uniqueEmail = `valid_user_${Date.now()}@${TEST_DOMAIN}`;
    const [inserted] = await db
      .insert(users)
      .values({
        email: uniqueEmail,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhashforf02testing",
        name: "Test User",
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted.id).toBeDefined();
    expect(typeof inserted.id).toBe("string");
    // Verify valid UUIDv4 format
    expect(inserted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(inserted.email).toBe(uniqueEmail);
    expect(inserted.name).toBe("Test User");

    // Query back from database
    const [fetched] = await db
      .select()
      .from(users)
      .where(sql`id = ${inserted.id}`);

    expect(fetched).toBeDefined();
    expect(fetched.id).toBe(inserted.id);
    expect(fetched.email).toBe(uniqueEmail);
  });

  it("5. enforces NOT NULL constraints on required fields", async () => {
    // Attempt inserting with null/missing email
    try {
      await db.execute(
        sql`INSERT INTO users (password_hash, name) VALUES ('dummyhash', 'No Email')`
      );
      expect.unreachable("Should have failed NOT NULL check on email");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string; column?: string } })?.cause;
      expect(pgError?.code).toBe("23502"); // not_null_violation
      expect(pgError?.column).toBe("email");
    }

    // Attempt inserting with null/missing password_hash
    try {
      await db.execute(
        sql`INSERT INTO users (email, name) VALUES (${`nopass_${Date.now()}@${TEST_DOMAIN}`}, 'No Pass')`
      );
      expect.unreachable("Should have failed NOT NULL check on password_hash");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string; column?: string } })?.cause;
      expect(pgError?.code).toBe("23502");
      expect(pgError?.column).toBe("password_hash");
    }

    // Attempt inserting with null/missing name
    try {
      await db.execute(
        sql`INSERT INTO users (email, password_hash) VALUES (${`noname_${Date.now()}@${TEST_DOMAIN}`}, 'dummyhash')`
      );
      expect.unreachable("Should have failed NOT NULL check on name");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string; column?: string } })?.cause;
      expect(pgError?.code).toBe("23502");
      expect(pgError?.column).toBe("name");
    }
  });

  it("6. rejects duplicate email addresses case-insensitively via database constraint", async () => {
    const baseEmail = `case_test_${Date.now()}@${TEST_DOMAIN}`;
    const uppercaseVariant = baseEmail.toUpperCase();

    // First insert in lowercase
    await db.insert(users).values({
      email: baseEmail,
      passwordHash: "hash123",
      name: "Case Sensitivity User 1",
    });

    // Attempt second insert with uppercase variant of the same email
    try {
      await db.insert(users).values({
        email: uppercaseVariant,
        passwordHash: "hash456",
        name: "Case Sensitivity User 2",
      });
      expect.unreachable("Should have failed case-insensitive unique constraint");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string; constraint?: string } })?.cause;
      expect(pgError?.code).toBe("23505"); // unique_violation
      expect(pgError?.constraint).toBe("users_email_unique_idx");
    }
  });

  it("7. assigns default value true to is_active", async () => {
    const email = `active_default_${Date.now()}@${TEST_DOMAIN}`;
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: "hash",
        name: "Default Active User",
      })
      .returning();

    expect(user.isActive).toBe(true);
  });

  it("8 & 9. populates created_at and updated_at with valid timestamps", async () => {
    const beforeInsert = new Date(Date.now() - 2000);
    const email = `timestamp_test_${Date.now()}@${TEST_DOMAIN}`;

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: "hash",
        name: "Timestamp Test User",
      })
      .returning();

    const afterInsert = new Date(Date.now() + 2000);

    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);

    expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
    expect(user.createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime());

    expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
    expect(user.updatedAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime());
  });
});
