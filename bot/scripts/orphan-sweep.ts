/**
 * Scan R2 for objects no longer referenced anywhere in Postgres — identity
 * avatars, welcome backgrounds, announce clips, and recording files — and
 * report them. Also reports the inverse: DB rows/settings that point at an
 * R2 key which doesn't exist (dangling references), report-only since
 * deleting a DB row is a bigger action than deleting a blob.
 *
 * Dry-run by default. Pass --delete to actually remove orphaned R2 objects.
 *
 * Note on the `recordings/` sweep: a key only counts as orphaned if it
 * doesn't fall under any *known* recording's own prefix
 * (`recordings/<guildId>/<recordingId>/`). A file sitting inside a still-valid
 * recording's prefix but not equal to the recording's current mixed_file_id
 * (e.g. a superseded remix attempt) is intentionally not flagged here — only
 * whole-recording orphans (DB row gone, R2 objects left behind) are safe to
 * infer from key shape alone.
 *
 * Usage:
 *   DATABASE_URL=postgres://...          \
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
 *   pnpm --filter bot run sweep:orphans [--delete] [--verbose]
 */
import dotenv from "dotenv";
import { createDb, RecordingRepository, GuildConfigRepository } from "@modus/db";
import { StorageService, looksLikeR2Key } from "../StorageService";

dotenv.config();

interface Flags {
  delete: boolean;
  verbose: boolean;
}

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  return {
    delete: args.includes("--delete"),
    verbose: args.includes("--verbose"),
  };
}

const IDENTITY_KEY_RE = /^identity\/\d{10,}\/[a-f0-9]{16}\.[a-z0-9]+$/;
const WELCOME_KEY_RE = /^welcome\/\d{10,}\/[a-f0-9]{16}\.[a-z0-9]+$/;

function extractProxyKey(
  prefix: string,
  re: RegExp,
  value: unknown,
): string | null {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const key = value.slice(prefix.length);
  return re.test(key) ? key : null;
}

function printOrphans(orphans: string[], flags: Flags) {
  const shown = flags.verbose ? orphans : orphans.slice(0, 20);
  for (const key of shown) console.log(`    - ${key}`);
  if (!flags.verbose && orphans.length > shown.length) {
    console.log(
      `    ... and ${orphans.length - shown.length} more (--verbose to list all)`,
    );
  }
}

async function sweepPrefix(params: {
  name: string;
  storage: StorageService;
  prefix: string;
  referenced: Set<string>;
  flags: Flags;
}): Promise<string[]> {
  const { name, storage, prefix, referenced, flags } = params;
  const allKeys = await storage.listPrefix(prefix);
  const orphans = allKeys.filter((key) => !referenced.has(key));

  console.log(`\n── ${name} ─────────────────────────────────────`);
  console.log(`  scanned:    ${allKeys.length} object(s) under ${prefix}`);
  console.log(`  referenced: ${referenced.size}`);
  console.log(`  orphaned:   ${orphans.length}`);
  printOrphans(orphans, flags);

  if (flags.delete && orphans.length > 0) {
    await storage.deleteMany(orphans);
    console.log(`  deleted ${orphans.length} orphaned object(s).`);
  }

  return orphans;
}

async function main() {
  const flags = parseFlags();
  console.log(
    `Orphan sweep — ${flags.delete ? "DELETE MODE" : "dry run (pass --delete to remove orphans)"}`,
  );

  const r2Config = StorageService.fromEnv();
  if (!r2Config) {
    console.error(
      "R2 env vars not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).",
    );
    process.exit(1);
  }
  const storage = new StorageService(r2Config);

  const { db, pool } = createDb();
  const recordingRepo = new RecordingRepository(db);
  const guildConfigRepo = new GuildConfigRepository(db);

  try {
    // ── identity avatars ──
    const identityConfigs = await guildConfigRepo.listByModule("identity");
    const identityReferenced = new Set<string>();
    for (const row of identityConfigs) {
      const settings = JSON.parse(row.settings);
      const key = extractProxyKey(
        "/api/identity/avatar/",
        IDENTITY_KEY_RE,
        settings.avatarImage,
      );
      if (key) identityReferenced.add(key);
    }
    await sweepPrefix({
      name: "identity avatars",
      storage,
      prefix: "identity/",
      referenced: identityReferenced,
      flags,
    });

    // ── welcome backgrounds ──
    const welcomeConfigs = await guildConfigRepo.listByModule("welcome");
    const welcomeReferenced = new Set<string>();
    for (const row of welcomeConfigs) {
      const settings = JSON.parse(row.settings);
      const key = extractProxyKey(
        "/api/welcome/bg/",
        WELCOME_KEY_RE,
        settings.backgroundImage,
      );
      if (key) welcomeReferenced.add(key);
    }
    await sweepPrefix({
      name: "welcome backgrounds",
      storage,
      prefix: "welcome/",
      referenced: welcomeReferenced,
      flags,
    });

    // ── announce clips (stored as a raw R2 key, no proxy-URL wrapping) ──
    const recordingConfigs = await guildConfigRepo.listByModule("recording");
    const announceReferenced = new Set<string>();
    for (const row of recordingConfigs) {
      const settings = JSON.parse(row.settings);
      if (
        typeof settings.announceSoundFileId === "string" &&
        settings.announceSoundFileId.startsWith("announce/")
      ) {
        announceReferenced.add(settings.announceSoundFileId);
      }
    }
    await sweepPrefix({
      name: "announce clips",
      storage,
      prefix: "announce/",
      referenced: announceReferenced,
      flags,
    });

    // ── recordings (tracks + mixed files) ──
    const refs = await recordingRepo.listAllRefs();
    const trackFileIds = await recordingRepo.listAllTrackFileIds();
    const validPrefixes = refs.map((r) => `recordings/${r.guildId}/${r.id}/`);

    const recordingFileRefs = new Set<string>();
    for (const t of trackFileIds) {
      if (looksLikeR2Key(t.fileId)) recordingFileRefs.add(t.fileId);
    }
    for (const r of refs) {
      if (r.mixedFileId && looksLikeR2Key(r.mixedFileId)) {
        recordingFileRefs.add(r.mixedFileId);
      }
    }

    const allRecordingKeys = await storage.listPrefix("recordings/");
    const recordingKeySet = new Set(allRecordingKeys);
    const recordingOrphans = allRecordingKeys.filter(
      (key) => !validPrefixes.some((p) => key.startsWith(p)),
    );

    console.log(`\n── recordings (tracks + mixed files) ─────────────────────`);
    console.log(`  scanned:              ${allRecordingKeys.length} object(s) under recordings/`);
    console.log(`  known recordings:     ${refs.length}`);
    console.log(`  orphaned:             ${recordingOrphans.length}`);
    printOrphans(recordingOrphans, flags);

    if (flags.delete && recordingOrphans.length > 0) {
      await storage.deleteMany(recordingOrphans);
      console.log(`  deleted ${recordingOrphans.length} orphaned object(s).`);
    }

    // ── dangling DB references (report only — never auto-deleted) ──
    const dangling = [...recordingFileRefs].filter(
      (key) => !recordingKeySet.has(key),
    );
    console.log(`\n── dangling DB references (report only) ──────────────────`);
    console.log(
      `  recording track/mix rows pointing at a file missing from R2: ${dangling.length}`,
    );
    printOrphans(dangling, flags);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("orphan sweep failed:", err);
  process.exit(1);
});
