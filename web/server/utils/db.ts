/**
 * Shared Postgres access for Nitro endpoints.
 *
 * Behavior mirrors web/server/utils/r2.ts: feature-flagged via
 * NUXT_USE_POSTGRES_RECORDINGS, lazy-initialized, returns null when disabled
 * or misconfigured so callers can fall back to Appwrite cleanly.
 */
import { createDb, RecordingRepository, type Database } from "@modus/db";

let cached: {
  db: Database;
  recordings: RecordingRepository;
} | null = null;

/**
 * Lazy-initialized Postgres client + recording repo. Returns null when the
 * feature flag is off or DATABASE_URL isn't set.
 */
export function getRecordingRepo(): RecordingRepository | null {
  if (cached) return cached.recordings;

  const config = useRuntimeConfig();
  if (String(config.usePostgresRecordings) !== "true") return null;

  const url = (config.databaseUrl as string) || process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "[db] NUXT_USE_POSTGRES_RECORDINGS=true but DATABASE_URL / NUXT_DATABASE_URL is unset.",
    );
    return null;
  }

  try {
    const { db } = createDb({ url });
    cached = { db, recordings: new RecordingRepository(db) };
    return cached.recordings;
  } catch (err) {
    console.warn(
      `[db] Failed to initialize Postgres: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
