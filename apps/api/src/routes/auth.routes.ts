import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import { loginSchema, registerSchema } from "../auth/auth.schema.js";
import { requireAuth } from "../auth/authenticate.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../auth/password.js";
import {
  createSession,
  getSessionCookieOptions,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from "../auth/session.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { env } from "../config/env.js";

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  cause?: {
    code?: string;
    constraint?: string;
  };
}

export interface AuthRoutesOptions {
  authRateLimitMax?: number;
  authRateLimitWindowMs?: number;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  server: FastifyInstance,
  options: AuthRoutesOptions = {}
) => {
  const authRateLimitMax = options.authRateLimitMax ?? env.AUTH_RATE_LIMIT_MAX;
  const authRateLimitWindowMs =
    options.authRateLimitWindowMs ?? env.AUTH_RATE_LIMIT_WINDOW_MS;

  // POST /api/auth/register — Create a new account with hashed password
  server.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: authRateLimitMax,
          timeWindow: authRateLimitWindowMs,
        },
      },
    },
    async (request, reply) => {
    // 1. Validate request body against registration schema
    const parseResult = registerSchema.safeParse(request.body);

    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details,
      });
    }

    const { name, email, password } = parseResult.data;

    try {
      // 2. Hash plaintext password using Argon2id with a fresh 16-byte salt
      const passwordHash = await hashPassword(password);

      // 3. Atomically persist user with normalized email
      const [newUser] = await db
        .insert(users)
        .values({
          name,
          email, // Normalized (trimmed and lowercased by registerSchema)
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
        });

      // 4. Return successful account creation response with safe user payload
      return reply.status(201).send({
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        },
      });
    } catch (err: unknown) {
      const dbErr = err as DatabaseError;
      const errorCode = dbErr.cause?.code ?? dbErr.code;
      const constraintName = dbErr.cause?.constraint ?? dbErr.constraint;

      // Handle duplicate email collision cleanly via unique constraint
      if (
        errorCode === "23505" ||
        constraintName === "users_email_unique_idx"
      ) {
        return reply.status(409).send({
          error: "An account with this email address already exists.",
          code: "EMAIL_ALREADY_EXISTS",
        });
      }

      // Safe fallback for unexpected server/database errors
      server.log.error("Registration failed due to an unexpected error");
      return reply.status(500).send({
        error: "An unexpected error occurred during registration",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/auth/login — Authenticate credentials and establish session
  server.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: authRateLimitMax,
          timeWindow: authRateLimitWindowMs,
        },
      },
    },
    async (request, reply) => {
    // 1. Validate request body
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details,
      });
    }

    const { email, password } = parseResult.data;

    try {
      // 2. Query user by normalized lowercase email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
        .limit(1);

      // Constant-time / generic failure if user not found or inactive
      if (!user || !user.isActive) {
        // Mitigate login timing attacks: execute dummy Argon2id verification with fixed valid hash
        await verifyPassword(DUMMY_PASSWORD_HASH, password);
        return reply.status(401).send({
          error: "Invalid email or password",
          code: "UNAUTHENTICATED",
        });
      }

      // 3. Verify Argon2id password hash
      const isValid = await verifyPassword(user.passwordHash, password);
      if (!isValid) {
        return reply.status(401).send({
          error: "Invalid email or password",
          code: "UNAUTHENTICATED",
        });
      }

      // 4. Create cryptographically secure random session in PostgreSQL
      const userAgent = request.headers["user-agent"];
      const ipAddress = request.ip;
      const { rawToken } = await createSession(user.id, {
        userAgent: typeof userAgent === "string" ? userAgent : undefined,
        ipAddress,
      });

      // 5. Issue HttpOnly session cookie
      reply.setCookie(
        SESSION_COOKIE_NAME,
        rawToken,
        getSessionCookieOptions()
      );

      // 6. Return safe user payload (never raw tokens, never passwordHash)
      return reply.status(200).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (err: unknown) {
      server.log.error(err, "Login failed unexpectedly");
      return reply.status(500).send({
        error: "An unexpected error occurred during login",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/auth/me — Return currently authenticated user profile
  server.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.user!;
    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  });

  // POST /api/auth/logout — Invalidate server session and clear cookie
  server.post("/logout", async (request, reply) => {
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      await invalidateSession(rawToken);
    }

    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return reply.status(200).send({
      message: "Logged out successfully",
    });
  });
};
