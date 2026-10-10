import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env if present
dotenv.config();

export const DEV_DEFAULT_COOKIE_SECRET = "trackup-session-cookie-secret-dev";
export const DEV_DEFAULT_CORS_ORIGIN = "http://localhost:5173,http://127.0.0.1:5173";

/**
 * Validates and normalizes comma-separated CORS origins.
 * Rejects wildcards ('*') and ensures each origin is a valid http:// or https:// URL.
 * Strips trailing slashes to guarantee exact origin matching.
 */
export function parseCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN must contain at least one valid origin URL");
  }

  for (const origin of origins) {
    if (origin === "*") {
      throw new Error(
        "CORS_ORIGIN must not be a wildcard '*' when credentials are supported"
      );
    }
    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(
          `Invalid protocol in CORS origin '${origin}'. Origins must use http:// or https://`
        );
      }
      if (url.pathname !== "" && url.pathname !== "/") {
        throw new Error(
          `CORS origin '${origin}' must not contain a path component (got '${url.pathname}')`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("CORS origin")) {
        throw err;
      }
      throw new Error(
        `Invalid CORS origin '${origin}': must be a valid http:// or https:// URL`
      );
    }
  }

  // Normalize: extract standard origin (stripping trailing slash or path)
  return origins.map((origin) => new URL(origin).origin);
}

/**
 * Normalizes TRUST_PROXY configuration for Fastify.
 * - 'true' -> true
 * - 'false' / undefined / '' -> false
 * - integer string (e.g. '1') -> number 1 (number of upstream proxy hops)
 * - custom IP/CIDR string (e.g. '127.0.0.1') -> string
 */
export function parseTrustProxy(val: unknown): boolean | string {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase();
    if (trimmed === "true") return true;
    if (trimmed === "false" || trimmed === "") return false;
    return val.trim();
  }
  return false;
}

export const envSchema = z
  .object({
    PORT: z
      .string()
      .default("4000")
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
        message: "PORT must be a valid port number between 1 and 65535",
      }),
    HOST: z.string().min(1).default("0.0.0.0"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine(
        (val) => val.startsWith("postgres://") || val.startsWith("postgresql://"),
        {
          message: "DATABASE_URL must be a valid PostgreSQL connection string",
        }
      ),
    /**
     * COOKIE_SECRET:
     * Used by @fastify/cookie for signing cookies.
     * In production (NODE_ENV === 'production'):
     * - Strictly required; no development fallback is permitted.
     * - Must be at least 32 characters of high-entropy cryptographic material.
     * In development/test:
     * - Defaults to a safe explicit development string if omitted.
     */
    COOKIE_SECRET: z.string().optional(),
    /**
     * CORS_ORIGIN:
     * Comma-separated list of trusted frontend origins.
     * In production (NODE_ENV === 'production'):
     * - Strictly required; no development fallback is permitted.
     * - Wildcard '*' is strictly forbidden.
     * - Each entry must be a valid http:// or https:// origin URL.
     * In development/test:
     * - Defaults to 'http://localhost:5173,http://127.0.0.1:5173' if omitted.
     * - If specified, wildcards are rejected and origins are validated.
     */
    CORS_ORIGIN: z.string().optional(),
    /**
     * TRUST_PROXY:
     * Controls Fastify proxy trust resolution for client IP addresses.
     * - false in local development / direct socket connections (default).
     * - 1 (or true) in production when deployed behind a single reverse proxy (Render load balancer).
     */
    TRUST_PROXY: z.string().optional(),
    /**
     * Authentication Rate Limiting Configuration
     * Documented initial limits to prevent automated brute-force attacks while avoiding account lockouts.
     */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      const secret = data.COOKIE_SECRET?.trim();
      if (!secret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COOKIE_SECRET"],
          message:
            "COOKIE_SECRET is required in production and must be set to a cryptographically secure value",
        });
      } else if (secret.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COOKIE_SECRET"],
          message:
            "COOKIE_SECRET must be at least 32 characters in length in production",
        });
      }

      const cors = data.CORS_ORIGIN?.trim();
      if (!cors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message:
            "CORS_ORIGIN is required in production and must specify trusted frontend origin(s)",
        });
      } else {
        try {
          parseCorsOrigins(cors);
        } catch (err: unknown) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["CORS_ORIGIN"],
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else if (data.CORS_ORIGIN && data.CORS_ORIGIN.trim().length > 0) {
      try {
        parseCorsOrigins(data.CORS_ORIGIN.trim());
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })
  .transform((data) => {
    const rawCors =
      data.CORS_ORIGIN && data.CORS_ORIGIN.trim().length > 0
        ? data.CORS_ORIGIN.trim()
        : DEV_DEFAULT_CORS_ORIGIN;
    const corsOrigins = parseCorsOrigins(rawCors);
    const trustProxy = parseTrustProxy(data.TRUST_PROXY);

    return {
      ...data,
      COOKIE_SECRET:
        data.COOKIE_SECRET && data.COOKIE_SECRET.trim().length > 0
          ? data.COOKIE_SECRET
          : DEV_DEFAULT_COOKIE_SECRET,
      CORS_ORIGIN: rawCors,
      corsOrigins,
      trustProxy,
    };
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    // Redact sensitive values from validation error reporting
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    const formattedIssues = issues
      .map((i) => `  - ${i.path}: ${i.message}`)
      .join("\n");

    throw new Error(
      `Environment configuration validation failed:\n${formattedIssues}`
    );
  }

  return result.data;
}

export const env = validateEnv();
