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

  describe("COOKIE_SECRET Validation (P2-01)", () => {
    const validProdSecret = "a-very-secure-random-production-secret-value-32chars!";

    it("applies safe default development secret in development when omitted", () => {
      const config = validateEnv({
        ...baseValidEnv,
        NODE_ENV: "development",
      });
      expect(config.COOKIE_SECRET).toBe("trackup-session-cookie-secret-dev");
    });

    it("accepts custom COOKIE_SECRET in development", () => {
      const config = validateEnv({
        ...baseValidEnv,
        NODE_ENV: "development",
        COOKIE_SECRET: "custom-dev-secret",
      });
      expect(config.COOKIE_SECRET).toBe("custom-dev-secret");
    });

    it("rejects missing COOKIE_SECRET in production", () => {
      expect(() =>
        validateEnv({
          ...baseValidEnv,
          NODE_ENV: "production",
        })
      ).toThrowError(/COOKIE_SECRET is required in production/);

      expect(() =>
        validateEnv({
          ...baseValidEnv,
          NODE_ENV: "production",
          COOKIE_SECRET: "   ",
        })
      ).toThrowError(/COOKIE_SECRET is required in production/);
    });

    it("rejects too-short COOKIE_SECRET (< 32 characters) in production", () => {
      expect(() =>
        validateEnv({
          ...baseValidEnv,
          NODE_ENV: "production",
          COOKIE_SECRET: "too-short-secret-under-32-chars",
        })
      ).toThrowError(/COOKIE_SECRET must be at least 32 characters in length in production/);
    });

    it("accepts valid COOKIE_SECRET (>= 32 characters) in production", () => {
      const config = validateEnv({
        ...baseValidEnv,
        NODE_ENV: "production",
        COOKIE_SECRET: validProdSecret,
      });
      expect(config.COOKIE_SECRET).toBe(validProdSecret);
    });

    it("does not disclose candidate secret values in error messages on failure", () => {
      const sensitiveShortSecret = "secret-12345";
      try {
        validateEnv({
          ...baseValidEnv,
          NODE_ENV: "production",
          COOKIE_SECRET: sensitiveShortSecret,
        });
        expect.unreachable("Should have thrown validation error");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(sensitiveShortSecret);
        expect(message).toContain("COOKIE_SECRET must be at least 32 characters");
      }
    });
  });
});

