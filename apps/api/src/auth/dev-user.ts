import { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, User } from "../db/schema.js";
import { hashPassword } from "./password.js";

/**
 * Development Identity Resolution Module (Milestone 2)
 *
 * PURPOSE & CONSTRAINTS:
 * Full authentication (sessions, cookies, /me) is scheduled for later milestones.
 * To enforce strict server-side task ownership without accepting arbitrary client user IDs,
 * this module provides an explicit, isolated identity provider for development and testing.
 *
 * BEHAVIOR:
 * 1. Default Behavior: Resolves to the canonical TrackUp workspace identity ("Alex Mercer", alex.mercer@trackup.internal).
 *    Automatically creates this user if not already present in the database.
 * 2. Multi-User Testing / IDOR Testing: If the non-production request passes an `x-dev-user-id` header with a valid UUID,
 *    it resolves to that specific existing user, enabling comprehensive ownership/IDOR isolation testing.
 *
 * MIGRATION TO PRODUCTION AUTH:
 * In Milestone 3+, this resolver will simply read the verified session/token from `request.session.user`.
 */

export const DEFAULT_DEV_USER_EMAIL = "alex.mercer@trackup.internal";
export const DEFAULT_DEV_USER_NAME = "Alex Mercer";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedDevUser: User | null = null;

export async function getOrCreateDevUser(): Promise<User> {
  if (cachedDevUser) {
    return cachedDevUser;
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEFAULT_DEV_USER_EMAIL))
    .limit(1);

  if (existing) {
    cachedDevUser = existing;
    return existing;
  }

  // Pre-seed dev password hash using standard Argon2id utility
  const devPasswordHash = await hashPassword("TrackUpDevPassword123!");

  const [created] = await db
    .insert(users)
    .values({
      name: DEFAULT_DEV_USER_NAME,
      email: DEFAULT_DEV_USER_EMAIL,
      passwordHash: devPasswordHash,
    })
    .returning();

  cachedDevUser = created;
  return created;
}

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
}

export class IdentityError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

import { validateSession, SESSION_COOKIE_NAME } from "./session.js";

export async function resolveUserIdentity(
  request: FastifyRequest
): Promise<UserIdentity> {
  // 1. If request.user was already set by requireAuth middleware
  if (request.user) {
    return {
      id: request.user.id,
      email: request.user.email,
      name: request.user.name,
    };
  }

  // 2. Check for real session cookie
  const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
  if (rawToken) {
    const sessionWithUser = await validateSession(rawToken);
    if (sessionWithUser) {
      return {
        id: sessionWithUser.user.id,
        email: sessionWithUser.user.email,
        name: sessionWithUser.user.name,
      };
    }
  }

  // 3. Isolated test-only fallback (STRICTLY when NODE_ENV === "test")
  if (process.env.NODE_ENV === "test") {
    const explicitDevUserId = request.headers["x-dev-user-id"];

    if (explicitDevUserId && typeof explicitDevUserId === "string") {
      if (!UUID_REGEX.test(explicitDevUserId)) {
        throw new IdentityError(
          400,
          "INVALID_DEV_USER_ID",
          "The provided x-dev-user-id must be a valid UUIDv4 string."
        );
      }

      const [targetUser] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, explicitDevUserId))
        .limit(1);

      if (!targetUser) {
        throw new IdentityError(
          401,
          "USER_NOT_FOUND",
          "The specified user identity does not exist."
        );
      }

      return targetUser;
    }
  }

  // 4. In all other environments and when unauthenticated, reject with 401
  // NEVER fall back to Alex Mercer or first DB user.
  throw new IdentityError(
    401,
    "UNAUTHENTICATED",
    "Authentication required."
  );
}

