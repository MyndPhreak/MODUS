/**
 * Postgres client + Drizzle binding.
 *
 * One `Pool` per process. Bot shards each get their own pool; the web service
 * has its own. Pool config is tuned for a typical workload — override via env
 * if you see saturation.
 */
import { Pool, PoolConfig } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface CreateDbOptions {
  /** Override connection string (defaults to env `DATABASE_URL`). */
  url?: string;
  /** Max pool size. Default 10. */
  max?: number;
  /** Idle timeout in ms. Default 30_000. */
  idleTimeoutMillis?: number;
  /** Extra pg Pool options for cases env doesn't cover (TLS, etc.). */
  pool?: Partial<PoolConfig>;
}

let defaultPool: Pool | null = null;
let defaultDb: Database | null = null;

export function createDb(options: CreateDbOptions = {}): {
  pool: Pool;
  db: Database;
} {
  const url = options.url || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Either export it or pass `url` to createDb().",
    );
  }

  const pool = new Pool({
    connectionString: url,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    ...options.pool,
  });

  const db = drizzle(pool, { schema });
  return { pool, db };
}

/**
 * Process-wide singleton. Most callers should use this; tests and the
 * migration script create their own pools.
 */
export function getDb(): Database {
  if (!defaultDb) {
    const created = createDb();
    defaultPool = created.pool;
    defaultDb = created.db;
  }
  return defaultDb;
}

/** Close the singleton pool (for graceful shutdown / tests). */
export async function closeDb(): Promise<void> {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = null;
    defaultDb = null;
  }
}
