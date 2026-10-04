import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/config/env.js";

describe("Environment Configuration (Zod)", () => {
  const baseValidEnv = {
    DATABASE_URL: "postgres://postgres@localhost:5432/TrackUp",
    PORT: "4000",
    HOST: "0.0.0.0",
    NODE_ENV: "development",
  };

  it("validates and parses a valid environment configuration", () => {
    const config = validateEnv(baseValidEnv);
    expect(config.DATABASE_URL).toBe("postgres://postgres@localhost:5432/TrackUp");
    expect(config.PORT).toBe(4000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.NODE_ENV).toBe("development");
  });

  it("applies default values for optional variables", () => {
    const config = validateEnv({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });
    expect(config.PORT).toBe(4000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.NODE_ENV).toBe("development");
  });

  it("rejects an invalid PORT number", () => {
    expect(() =>
      validateEnv({
        ...baseValidEnv,
        PORT: "not-a-number",
      })
    ).toThrowError(/PORT/);

    expect(() =>
      validateEnv({
        ...baseValidEnv,
        PORT: "70000",
      })
    ).toThrowError(/PORT/);
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() =>
      validateEnv({
        ...baseValidEnv,
        NODE_ENV: "staging",
      })
    ).toThrowError(/NODE_ENV/);
  });

  it("rejects missing or invalid DATABASE_URL", () => {
    expect(() =>
      validateEnv({
        ...baseValidEnv,
        DATABASE_URL: "",
      })
    ).toThrowError(/DATABASE_URL/);

    expect(() =>
      validateEnv({
        ...baseValidEnv,
        DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      })
    ).toThrowError(/DATABASE_URL/);
  });

  it("does not leak secret connection strings in error messages", () => {
    const secretPassword = "SuperSecretPassword123!";
    try {
      validateEnv({
        DATABASE_URL: `invalid-url://${secretPassword}@localhost/db`,
      });
      expect.unreachable("Should have thrown validation error");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(secretPassword);
    }
  });
});
