/**
 * Minimal SQL migration runner for packages/db/migrations.
 *
 * We roll our own rather than pull drizzle-kit into the runtime surface —
 * it's 40 lines, deterministic, and avoids an extra dev-only dependency in
 * the production bot image.
 *
 * Behavior:
 *  - Creates `_db_migrations` the first time it runs.
 *  - Applies every `*.sql` file in ./migrations alphabetically.
 *  - Skips files whose name is already recorded in `_db_migrations`.
 *  - Each file runs inside its own transaction; a failure rolls back only
 *    that file, not the whole run.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _db_migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const dir = join(__dirname, "..", "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM _db_migrations WHERE name = $1",
        [file],
      );
      if (rows.length > 0) {
        console.log(`↷ skip ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(dir, file), "utf-8");
      console.log(`→ apply ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _db_migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`✓ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ ${file}:`, err);
        throw err;
      }
    }

    console.log("migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
