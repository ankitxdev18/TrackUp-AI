import crypto from "node:crypto";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions, users, type Session, type User } from "../db/schema.js";

export const DEFAULT_SESSION_COOKIE_NAME = "trackup_session";
export const PROD_SESSION_COOKIE_NAME = "__Host-trackup_session";

/**
 * Returns the environment-appropriate session cookie name.
 * In production, adopts the __Host- prefix to enforce HTTPS, Path=/, and Host-only restrictions.
 * In development and testing (HTTP localhost), uses trackup_session so plain HTTP is supported
 * without browser prefix rejections.
 */
export function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? PROD_SESSION_COOKIE_NAME
    : DEFAULT_SESSION_COOKIE_NAME;
}

/**
 * Maintained for backward compatibility with existing tests and scripts.
 */
export const SESSION_COOKIE_NAME = DEFAULT_SESSION_COOKIE_NAME;

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Extracts a session token from an incoming request cookies map, checking both the
 * primary environment-specific cookie name and the fallback name for smooth transition.
 */
export function extractSessionToken(
  cookies: Record<string, string | undefined> | undefined
): string | undefined {
  if (!cookies) return undefined;
  const primaryName = getSessionCookieName();
  const token = cookies[primaryName];
  if (token && typeof token === "string" && token.trim().length > 0) {
    return token.trim();
  }
  if (primaryName !== DEFAULT_SESSION_COOKIE_NAME) {
    const fallbackToken = cookies[DEFAULT_SESSION_COOKIE_NAME];
    if (fallbackToken && typeof fallbackToken === "string" && fallbackToken.trim().length > 0) {
      return fallbackToken.trim();
    }
  }
  return undefined;
}

/**
 * Returns cookie configuration matching production security standards.
 * - HttpOnly: prevents client-side JavaScript access / XSS exfiltration
 * - SameSite=Lax: mitigates CSRF while supporting top-level same-site navigation
 * - Path=/: required for __Host- prefix compliance
 * - Secure: true in production (required for __Host- prefix compliance)
 * - Domain: explicitly omitted (required for __Host- prefix host-only compliance)
 */
export function getSessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Generates a cryptographically secure random session token.
 * 32 bytes = 256 bits of entropy, represented as a 64-character hexadecimal string.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes the SHA-256 cryptographic hash of a session token.
 * Only the token hash is stored in PostgreSQL, never the raw token.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface CreateSessionOptions {
  userAgent?: string;
  ipAddress?: string;
  durationMs?: number;
}

export interface SessionWithUser {
  session: Session;
  user: User;
}

/**
 * Atomically creates a new session in PostgreSQL.
 * Returns the raw token (to be sent via HttpOnly cookie) and the persisted session record.
 */
export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<{ session: Session; rawToken: string }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const durationMs = options.durationMs ?? SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + durationMs);

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash,
      expiresAt,
      userAgent: options.userAgent?.slice(0, 500) || null,
      ipAddress: options.ipAddress?.slice(0, 45) || null,
    })
    .returning();

  return { session, rawToken };
}

/**
 * Validates a session token from an incoming request.
 * 1. Computes SHA-256 hash of the incoming token.
 * 2. Queries PostgreSQL for an unexpired session matching tokenHash.
 * 3. Joins the user record and verifies the user is active.
 * Returns null if token is missing, expired, or invalid.
 */
export async function validateSession(
  rawToken: string | undefined | null
): Promise<SessionWithUser | null> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const [result] = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, now),
        eq(users.isActive, true)
      )
    )
    .limit(1);

  if (!result) {
    return null;
  }

  return {
    session: result.session,
    user: result.user,
  };
}

/**
 * Permanently invalidates and removes a session from PostgreSQL.
 */
export async function invalidateSession(rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string") {
    return false;
  }

  const tokenHash = hashSessionToken(rawToken);
  const result = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .returning({ id: sessions.id });

  return result.length > 0;
}

/**
 * Invalidates all active sessions for a given user (e.g. on password reset or account suspension).
 */
export async function invalidateAllUserSessions(userId: string): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });

  return result.length;
}

export interface CleanupSessionsOptions {
  batchSize?: number;
  now?: Date;
}

export interface CleanupSessionsResult {
  deletedCount: number;
}

let isCleanupInProgress = false;

/**
 * Returns whether an expired-session cleanup operation is currently executing in-process.
 */
export function isSessionCleanupInProgress(): boolean {
  return isCleanupInProgress;
}

/**
 * Safely removes expired sessions from PostgreSQL.
 *
 * Requirements satisfied:
 * - Deletes only expired sessions (expiresAt <= now).
 * - Avoids full-table cleanup on every request (scheduled or on-demand).
 * - Leverages the existing B-Tree index on `sessions.expires_at`.
 * - Supports bounded deletion via `batchSize` to avoid long database write locks in high-volume tables.
 */
export async function cleanupExpiredSessions(
  options: CleanupSessionsOptions = {}
): Promise<CleanupSessionsResult> {
  const now = options.now ?? new Date();

  if (options.batchSize !== undefined && options.batchSize > 0) {
    const expiredRows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(lte(sessions.expiresAt, now))
      .limit(options.batchSize);

    if (expiredRows.length === 0) {
      return { deletedCount: 0 };
    }

    const idsToDelete = expiredRows.map((r) => r.id);
    const deleted = await db
      .delete(sessions)
      .where(inArray(sessions.id, idsToDelete))
      .returning({ id: sessions.id });

    return { deletedCount: deleted.length };
  }

  const deleted = await db
    .delete(sessions)
    .where(lte(sessions.expiresAt, now))
    .returning({ id: sessions.id });

  return { deletedCount: deleted.length };
}

/**
 * Executes expired-session cleanup with process-level concurrency guarding.
 * Prevents overlapping cleanup invocations within the same process.
 * If a cleanup is already in progress, safely returns null without blocking.
 */
export async function runSafeSessionCleanup(
  options: CleanupSessionsOptions = {}
): Promise<CleanupSessionsResult | null> {
  if (isCleanupInProgress) {
    return null;
  }

  isCleanupInProgress = true;
  try {
    return await cleanupExpiredSessions(options);
  } finally {
    isCleanupInProgress = false;
  }
}

