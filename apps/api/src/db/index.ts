import pg from "pg";
import { env } from "../config/env.js";

import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

export interface DatabaseHealthResult {
  ok: boolean;
}

export function createDatabasePool(connectionString: string = env.DATABASE_URL): pg.Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
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
