import { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, type User } from "../db/schema.js";
import { validateSession, SESSION_COOKIE_NAME } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    sessionId?: string;
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reusable Fastify authentication preHandler hook.
 *
 * Flow:
 * 1. Checks HttpOnly session cookie ('trackup_session').
 * 2. Computes SHA-256 hash of token and queries PostgreSQL sessions table.
 * 3. Checks session expiration and joins active user.
 * 4. Attaches authenticated user to request.user.
 * 5. In test environment ONLY (NODE_ENV === "test"), allows x-dev-user-id for backwards compatibility with legacy integration tests.
 * 6. If unauthenticated, immediately rejects with HTTP 401 UNAUTHENTICATED.
 *
 * Guaranteed:
 * - Browser cannot select user identity.
 * - Authenticated sessions cannot be overridden or impersonated via x-dev-user-id.
 * - No silent fallback to Alex Mercer or first DB user.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // 1. Session cookie resolution (Production authentication path)
  const rawToken = request.cookies?.[SESSION_COOKIE_NAME];

  if (rawToken) {
    const sessionWithUser = await validateSession(rawToken);
    if (sessionWithUser) {
      request.user = sessionWithUser.user;
      request.sessionId = sessionWithUser.session.id;
      // Authenticated session established: x-dev-user-id can NEVER override or impersonate
      return;
    }
  }

  // 2. Test-only identity resolution (STRICTLY when NODE_ENV === "test")
  // Must NEVER operate in development browser sessions or production.
  if (process.env.NODE_ENV === "test") {
    const devUserId = request.headers["x-dev-user-id"];
    if (devUserId && typeof devUserId === "string") {
      if (!UUID_REGEX.test(devUserId)) {
        return reply.status(400).send({
          error: "Invalid dev user ID format",
          code: "INVALID_DEV_USER_ID",
        });
      }

      const [testUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, devUserId))
        .limit(1);

      if (testUser && testUser.isActive) {
        request.user = testUser;
        return;
      }

      return reply.status(401).send({
        error: "The specified user identity does not exist",
        code: "USER_NOT_FOUND",
      });
    }
  }

  // 3. Unauthenticated request: Reject with 401 UNAUTHENTICATED
  // NEVER fall back to Alex Mercer, never fall back to first DB user.
  return reply.status(401).send({
    error: "Authentication required",
    code: "UNAUTHENTICATED",
  });
}
