import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "../auth/auth.schema.js";
import { requireAuth } from "../auth/authenticate.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../auth/password.js";
import {
  createSession,
  DEFAULT_SESSION_COOKIE_NAME,
  extractSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  invalidateAllUserSessions,
  invalidateSession,
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
        getSessionCookieName(),
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
        timezone: user.timezone,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  // PATCH /api/auth/profile — Update mutable profile attributes (name, timezone)
  server.patch("/profile", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.user!;
    const parseResult = updateProfileSchema.safeParse(request.body);

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

    const { name, timezone } = parseResult.data;
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (timezone !== undefined) updateData.timezone = timezone;

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        timezone: users.timezone,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    return reply.status(200).send({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        timezone: updatedUser.timezone,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      },
    });
  });

  // POST /api/auth/change-password — Verify current credentials, update password, revoke other sessions
  server.post(
    "/change-password",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: authRateLimitMax,
          timeWindow: authRateLimitWindowMs,
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const parseResult = changePasswordSchema.safeParse(request.body);

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

      const { currentPassword, newPassword } = parseResult.data;

      // 1. Verify current password hash
      const isValid = await verifyPassword(user.passwordHash, currentPassword);
      if (!isValid) {
        return reply.status(401).send({
          error: "Current password is incorrect",
          code: "INCORRECT_CURRENT_PASSWORD",
        });
      }

      // 2. Hash new password using Argon2id
      const newHash = await hashPassword(newPassword);

      // 3. Atomically update password_hash and updated_at
      await db
        .update(users)
        .set({
          passwordHash: newHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // 4. Invalidate all existing sessions for this user
      await invalidateAllUserSessions(user.id);

      // 5. Issue a fresh session for the current client so the caller remains logged in
      const userAgent = request.headers["user-agent"];
      const ipAddress = request.ip;
      const { rawToken } = await createSession(user.id, {
        userAgent: typeof userAgent === "string" ? userAgent : undefined,
        ipAddress,
      });

      // 6. Set new session cookie
      reply.setCookie(
        getSessionCookieName(),
        rawToken,
        getSessionCookieOptions()
      );

      return reply.status(200).send({
        message: "Password changed successfully",
        sessionsRevoked: true,
      });
    }
  );

  // POST /api/auth/logout — Invalidate server session and clear cookie
  server.post("/logout", async (request, reply) => {
    const rawToken = extractSessionToken(request.cookies);
    if (rawToken) {
      await invalidateSession(rawToken);
    }

    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
    };

    const cookieName = getSessionCookieName();
    reply.clearCookie(cookieName, cookieOptions);
    if (cookieName !== DEFAULT_SESSION_COOKIE_NAME) {
      reply.clearCookie(DEFAULT_SESSION_COOKIE_NAME, cookieOptions);
    }

    return reply.status(200).send({
      message: "Logged out successfully",
    });
  });
};
