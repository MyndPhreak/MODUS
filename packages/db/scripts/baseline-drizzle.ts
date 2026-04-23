/**
 * One-time baseline for existing deployments.
 *
 * Marks the drizzle-kit baseline migration as already applied so subsequent
 * `pnpm db:migrate` runs only execute NEW migrations — without re-running
 * CREATE TABLE against live tables.
 *
 * Safe to run multiple times: inserts are idempotent on (hash).
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm db:baseline
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const drizzleDir = join(__dirname, "..", "drizzle");
  const journal: Journal = JSON.parse(
    readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"),
  );

  if (journal.entries.length === 0) {
    console.error("No migrations in journal — nothing to baseline.");
    process.exit(1);
  }

  const baseline = journal.entries[0];
  const sqlPath = join(drizzleDir, `${baseline.tag}.sql`);
  const sql = readFileSync(sqlPath, "utf-8");
  const hash = createHash("sha256").update(sql).digest("hex");

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    // Quick sanity check — baselining an empty DB is almost certainly a mistake.
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname = 'public'`,
    );
    const publicTableCount = Number(rows[0]?.count ?? 0);
    if (publicTableCount === 0) {
      console.error(
        "Refusing to baseline: public schema has 0 tables. " +
          "Run `pnpm db:migrate` for a fresh setup instead.",
      );
      process.exit(1);
    }

    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    const existing = await client.query(
      `SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`,
      [hash],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`↷ baseline ${baseline.tag} already recorded (hash ${hash.slice(0, 12)}…)`);
      return;
    }

    await client.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, baseline.when],
    );
    console.log(
      `✓ baseline ${baseline.tag} recorded (hash ${hash.slice(0, 12)}…, ts ${baseline.when})`,
    );
    console.log(
      `  Existing tables preserved. Future \`pnpm db:migrate\` runs will only apply new migrations.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
