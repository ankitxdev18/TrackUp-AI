import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { verifyPassword } from "../src/auth/password.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";

describe("User Registration API (POST /api/auth/register)", () => {
  const TEST_DOMAIN = "test.trackup.local";
  const app = buildApp({ logger: false });

  const cleanupTestUsers = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await app.ready();
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await app.close();
    await closeDatabasePool();
  });

  it("1. registers a new user successfully with HTTP 201 and safe user payload", async () => {
    const rawEmail = `register_success_${Date.now()}@${TEST_DOMAIN}`;
    const plaintextPassword = "correct-horse-battery-staple";

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Alex Mercer",
        email: rawEmail,
        password: plaintextPassword,
      },
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeDefined();
    expect(body.user.email).toBe(rawEmail.toLowerCase());
    expect(body.user.name).toBe("Alex Mercer");

    // Response safety: never return password or passwordHash
    expect(body.password).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
    expect(body.user.password).toBeUndefined();
    expect(body.user.passwordHash).toBeUndefined();

    // Verify database record
    const [dbUser] = await db
      .select()
      .from(users)
      .where(sql`id = ${body.user.id}`);

    expect(dbUser).toBeDefined();
    expect(dbUser.id).toBe(body.user.id);
    expect(dbUser.email).toBe(rawEmail.toLowerCase());
    expect(dbUser.name).toBe("Alex Mercer");
    expect(dbUser.isActive).toBe(true);
    expect(dbUser.createdAt).toBeInstanceOf(Date);
    expect(dbUser.updatedAt).toBeInstanceOf(Date);

    // Plaintext password is NEVER stored; passwordHash is valid Argon2id
    expect(dbUser.passwordHash).toBeDefined();
    expect(dbUser.passwordHash).not.toBe(plaintextPassword);
    expect(dbUser.passwordHash.startsWith("$argon2id$")).toBe(true);

    // Verify passwordHash verifies against the plaintext password
    expect(await verifyPassword(dbUser.passwordHash, plaintextPassword)).toBe(
      true
    );
  });

  it("2. normalizes email by trimming whitespace and converting to lowercase", async () => {
    const timestamp = Date.now();
    const rawInputEmail = `   NORM_TEST_${timestamp}@${TEST_DOMAIN}   `;
    const expectedNormalized = `norm_test_${timestamp}@${TEST_DOMAIN}`;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Normalize User",
        email: rawInputEmail,
        password: "secure-password-123",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.user.email).toBe(expectedNormalized);

    const [dbUser] = await db
      .select()
      .from(users)
      .where(sql`id = ${body.user.id}`);

    expect(dbUser.email).toBe(expectedNormalized);
  });

  it("3. rejects duplicate email registration case-insensitively with HTTP 409", async () => {
    const timestamp = Date.now();
    const baseEmail = `duplicate_${timestamp}@${TEST_DOMAIN}`;
    const uppercaseVariant = `DUPLICATE_${timestamp}@${TEST_DOMAIN}`;

    // First registration
    const res1 = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "First Account",
        email: baseEmail,
        password: "secure-password-123",
      },
    });
    expect(res1.statusCode).toBe(201);

    // Second registration with uppercase variant
    const res2 = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Second Account Attempt",
        email: uppercaseVariant,
        password: "another-password-123",
      },
    });

    expect(res2.statusCode).toBe(409);
    const errorBody = JSON.parse(res2.body);
    expect(errorBody.error).toBe(
      "An account with this email address already exists."
    );
    expect(errorBody.code).toBe("EMAIL_ALREADY_EXISTS");

    // No internal database details or passwords leaked in error response
    expect(res2.body).not.toContain("password");
    expect(res2.body).not.toContain("users_email_unique_idx");
    expect(res2.body).not.toContain("23505");

    // Verify only ONE account exists in the database
    const matchingUsers = await db
      .select()
      .from(users)
      .where(sql`lower(email) = ${baseEmail.toLowerCase()}`);

    expect(matchingUsers.length).toBe(1);
    expect(matchingUsers[0]?.name).toBe("First Account");
  });

  it("4. rejects empty or invalid name with HTTP 400", async () => {
    const resEmptyName = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "   ",
        email: `invalid_name_${Date.now()}@${TEST_DOMAIN}`,
        password: "secure-password-123",
      },
    });

    expect(resEmptyName.statusCode).toBe(400);
    const bodyEmpty = JSON.parse(resEmptyName.body);
    expect(bodyEmpty.code).toBe("VALIDATION_ERROR");
    expect(bodyEmpty.details.some((d: { field: string }) => d.field === "name")).toBe(
      true
    );

    const resMissingName = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `missing_name_${Date.now()}@${TEST_DOMAIN}`,
        password: "secure-password-123",
      },
    });

    expect(resMissingName.statusCode).toBe(400);
  });

  it("5. rejects malformed email with HTTP 400", async () => {
    const resInvalidEmail = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Malformed Email User",
        email: "not-a-valid-email",
        password: "secure-password-123",
      },
    });

    expect(resInvalidEmail.statusCode).toBe(400);
    const body = JSON.parse(resInvalidEmail.body);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details.some((d: { field: string }) => d.field === "email")).toBe(
      true
    );
  });

  it("6. rejects password shorter than 10 characters with HTTP 400", async () => {
    const resShortPassword = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Short Pass User",
        email: `shortpass_${Date.now()}@${TEST_DOMAIN}`,
        password: "short",
      },
    });

    expect(resShortPassword.statusCode).toBe(400);
    const body = JSON.parse(resShortPassword.body);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(
      body.details.some((d: { field: string }) => d.field === "password")
    ).toBe(true);

    // Ensure plaintext candidate password is NOT echoed in error response
    expect(resShortPassword.body).not.toContain("short");
  });

  it("7. rejects password longer than 128 characters with HTTP 400", async () => {
    const longPassword = "A".repeat(129);
    const resLongPassword = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Long Pass User",
        email: `longpass_${Date.now()}@${TEST_DOMAIN}`,
        password: longPassword,
      },
    });

    expect(resLongPassword.statusCode).toBe(400);
    const body = JSON.parse(resLongPassword.body);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("8. preserves password opacity (whitespaces and case-sensitivity unchanged)", async () => {
    // Password with leading/trailing spaces and mixed casing
    const exactOpaquePassword = "  P@ssW0rd With Spaces  ";
    const email = `opaque_pass_${Date.now()}@${TEST_DOMAIN}`;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Opaque Password User",
        email,
        password: exactOpaquePassword,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);

    const [dbUser] = await db
      .select()
      .from(users)
      .where(sql`id = ${body.user.id}`);

    // Verify exact password matches
    expect(await verifyPassword(dbUser.passwordHash, exactOpaquePassword)).toBe(
      true
    );

    // Verify trimmed or modified candidate fails verification
    expect(
      await verifyPassword(dbUser.passwordHash, exactOpaquePassword.trim())
    ).toBe(false);
  });

  it("9. database integrity: failed registration does not create partial user records", async () => {
    const uncreatedEmail = `failed_registration_${Date.now()}@${TEST_DOMAIN}`;

    // Registration fails due to invalid password (< 10 chars)
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Failed User",
        email: uncreatedEmail,
        password: "bad",
      },
    });

    expect(response.statusCode).toBe(400);

    // Verify 0 rows exist for this email
    const records = await db
      .select()
      .from(users)
      .where(sql`email = ${uncreatedEmail.toLowerCase()}`);

    expect(records.length).toBe(0);
  });
});
