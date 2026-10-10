import pg from "pg";
import { env } from "../config/env.js";

import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

export interface DatabaseHealthResult {
  ok: boolean;
}

export interface DatabasePoolOptions {
  connectionString?: string;
  sslMode?: boolean;
  sslCa?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Redacts database user passwords from connection URIs to prevent credential leakage in logs.
 * e.g., postgresql://user:secret@db.example.com:5432/mydb -> postgresql://user:******@db.example.com:5432/mydb
 */
export function sanitizeConnectionString(connStr: string): string {
  try {
    const parsed = new URL(connStr);
    if (parsed.password) {
      parsed.password = "******";
    }
    return parsed.toString();
  } catch {
    return "[INVALID_DATABASE_URL]";
  }
}

/**
 * Builds node-postgres PoolConfig enforcing production security standards:
 * - When SSL is requested (via options.sslMode, env.DATABASE_SSL, ?sslmode=require, or in production against remote hosts),
 *   certificate verification is STRICTLY ENFORCED (rejectUnauthorized: true).
 * - Never silently disables certificate verification (rejectUnauthorized: false is forbidden).
 * - Leaves local development (localhost / 127.0.0.1) unencrypted by default.
 * - Supports custom CA certificates (DATABASE_SSL_CA) for private/enterprise PostgreSQL deployments.
 */
export function getDatabasePoolConfig(options: DatabasePoolOptions = {}): pg.PoolConfig {
  const connectionString = options.connectionString ?? env.DATABASE_URL;

  let shouldEnableSsl = options.sslMode ?? env.DATABASE_SSL;

  if (shouldEnableSsl === undefined) {
    try {
      const parsed = new URL(connectionString);
      const sslParam = parsed.searchParams.get("sslmode") || parsed.searchParams.get("ssl");
      if (sslParam === "require" || sslParam === "verify-full" || sslParam === "true") {
        shouldEnableSsl = true;
      } else if (
        env.NODE_ENV === "production" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1"
      ) {
        shouldEnableSsl = true;
      } else {
        shouldEnableSsl = false;
      }
    } catch {
      shouldEnableSsl = false;
    }
  }

  const poolConfig: pg.PoolConfig = {
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
  };

  if (shouldEnableSsl) {
    const sslCa = options.sslCa ?? env.DATABASE_SSL_CA;
    poolConfig.ssl = {
      rejectUnauthorized: true,
      ...(sslCa ? { ca: sslCa } : {}),
    };
  }

  return poolConfig;
}

export function createDatabasePool(
  configOrConnectionString?: string | DatabasePoolOptions
): pg.Pool {
  const options: DatabasePoolOptions =
    typeof configOrConnectionString === "string"
      ? { connectionString: configOrConnectionString }
      : (configOrConnectionString ?? {});

  return new Pool(getDatabasePoolConfig(options));
}

// Singleton connection pool instance for server runtime
export const pool = createDatabasePool();

export function createDrizzleClient(
  dbPool: pg.Pool = pool
): NodePgDatabase<typeof schema> {
  return drizzle(dbPool, { schema });
}

// Singleton Drizzle ORM database instance
export const db = createDrizzleClient(pool);

/**
 * Executes a lightweight `SELECT 1` query to verify database connectivity.
 * Catches any connection/query errors safely without leaking credentials or stack traces.
 */
export async function checkDatabaseHealth(
  dbPool: pg.Pool = pool
): Promise<DatabaseHealthResult> {
  try {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true };
    } finally {
      client.release();
    }
  } catch {
    return { ok: false };
  }
}

/**
 * Gracefully terminates the connection pool.
 */
export async function closeDatabasePool(dbPool: pg.Pool = pool): Promise<void> {
  await dbPool.end();
}
