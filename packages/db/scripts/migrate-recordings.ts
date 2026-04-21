/**
 * Appwrite → Postgres migration for `recordings` + `recording_tracks`.
 *
 * Idempotent: every insert is `ON CONFLICT DO NOTHING` keyed on the
 * preserved Appwrite `$id`, so re-running the script is safe and only
 * new rows get written.
 *
 * Resumable: progress is logged to stdout; if the script crashes, run it
 * again — already-migrated rows are skipped by the conflict clause.
 *
 * Usage:
 *   DATABASE_URL=postgres://...  \
 *   APPWRITE_ENDPOINT=...         \
 *   APPWRITE_PROJECT_ID=...       \
 *   APPWRITE_API_KEY=...          \
 *   pnpm --filter @modus/db run migrate:recordings [--dry-run] [--limit N]
 */
import { Client, Databases, Query } from "node-appwrite";
import { createDb } from "../src/client";
import { RecordingRepository } from "../src/repositories/recordings";

const DATABASE_ID = "discord_bot";
const RECORDINGS_COLLECTION = "recordings";
const RECORDING_TRACKS_COLLECTION = "recording_tracks";
const PAGE_SIZE = 100;

interface Flags {
  dryRun: boolean;
  limit: number | null;
}

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { dryRun: false, limit: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--limit") flags.limit = parseInt(args[++i], 10);
  }
  return flags;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function* paginate(
  databases: Databases,
  collectionId: string,
  flags: Flags,
) {
  let lastId: string | null = null;
  let migrated = 0;

  while (true) {
    const queries = [Query.limit(PAGE_SIZE), Query.orderAsc("$id")];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      queries,
    );

    if (response.documents.length === 0) return;

    for (const doc of response.documents) {
      yield doc;
      migrated++;
      if (flags.limit && migrated >= flags.limit) return;
    }

    lastId = response.documents[response.documents.length - 1].$id;
    if (response.documents.length < PAGE_SIZE) return;
  }
}

async function migrateRecordings(
  databases: Databases,
  repo: RecordingRepository,
  flags: Flags,
) {
  console.log("\n── recordings ─────────────────────────────────────────────");
  let count = 0;
  let skipped = 0;

  for await (const doc of paginate(databases, RECORDINGS_COLLECTION, flags)) {
    const input = {
      id: doc.$id,
      guild_id: doc.guild_id,
      channel_name: doc.channel_name,
      recorded_by: doc.recorded_by,
      title: doc.title ?? null,
      mixed_file_id: doc.mixed_file_id || null,
      duration: typeof doc.duration === "number" ? doc.duration : null,
      bitrate: typeof doc.bitrate === "number" ? doc.bitrate : null,
      multitrack: Boolean(doc.multitrack),
      participants: doc.participants || "[]",
      started_at: doc.started_at,
      ended_at: doc.ended_at || null,
    };

    if (flags.dryRun) {
      console.log(`  [dry-run] would insert ${input.id} (${input.guild_id})`);
      count++;
      continue;
    }

    try {
      await repo.upsertMigratedRecording(input, doc.$createdAt);
      count++;
      if (count % 50 === 0) console.log(`  migrated ${count}…`);
    } catch (err) {
      skipped++;
      console.warn(
        `  skip ${doc.$id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`  done: ${count} recording(s) migrated, ${skipped} skipped`);
  return { count, skipped };
}

async function migrateTracks(
  databases: Databases,
  repo: RecordingRepository,
  flags: Flags,
) {
  console.log("\n── recording_tracks ───────────────────────────────────────");
  let count = 0;
  let skipped = 0;

  for await (const doc of paginate(
    databases,
    RECORDING_TRACKS_COLLECTION,
    flags,
  )) {
    const input = {
      id: doc.$id,
      recording_id: doc.recording_id,
      guild_id: doc.guild_id,
      user_id: doc.user_id,
      username: doc.username,
      file_id: doc.file_id,
      file_size: typeof doc.file_size === "number" ? doc.file_size : null,
      start_offset:
        typeof doc.start_offset === "number" ? doc.start_offset : 0,
      segments: doc.segments || "[]",
    };

    if (flags.dryRun) {
      console.log(
        `  [dry-run] would insert track ${input.id} for recording ${input.recording_id}`,
      );
      count++;
      continue;
    }

    try {
      await repo.upsertMigratedTrack(input, doc.$createdAt);
      count++;
      if (count % 100 === 0) console.log(`  migrated ${count}…`);
    } catch (err) {
      skipped++;
      console.warn(
        `  skip ${doc.$id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`  done: ${count} track(s) migrated, ${skipped} skipped`);
  return { count, skipped };
}

async function main() {
  const flags = parseFlags();
  console.log(
    `Appwrite → Postgres recordings migration${flags.dryRun ? " (dry run)" : ""}`,
  );

  const appwriteClient = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"))
    .setKey(requireEnv("APPWRITE_API_KEY"));
  const databases = new Databases(appwriteClient);

  requireEnv("DATABASE_URL");
  const { db, pool } = createDb();
  const repo = new RecordingRepository(db);

  try {
    const r = await migrateRecordings(databases, repo, flags);
    // Recordings must land before tracks so the FK resolves.
    const t = await migrateTracks(databases, repo, flags);

    console.log("\n── summary ────────────────────────────────────────────────");
    console.log(`  recordings:        ${r.count} migrated, ${r.skipped} skipped`);
    console.log(`  recording_tracks:  ${t.count} migrated, ${t.skipped} skipped`);
    if (flags.dryRun) console.log("  (dry-run — no writes performed)");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
