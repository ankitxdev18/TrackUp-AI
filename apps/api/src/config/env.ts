import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env if present
dotenv.config();

export const DEV_DEFAULT_COOKIE_SECRET = "trackup-session-cookie-secret-dev";

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
    }
  })
  .transform((data) => {
    return {
      ...data,
      COOKIE_SECRET:
        data.COOKIE_SECRET && data.COOKIE_SECRET.trim().length > 0
          ? data.COOKIE_SECRET
          : DEV_DEFAULT_COOKIE_SECRET,
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
