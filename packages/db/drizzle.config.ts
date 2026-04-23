import type { Config } from "drizzle-kit";

/**
 * drizzle-kit manages schema migrations from src/schema.ts.
 *
 * Workflow:
 *   1. Edit src/schema.ts.
 *   2. `pnpm db:generate` — diffs schema against last snapshot, writes
 *      a new NNNN_name.sql + meta/_journal.json entry into ./drizzle.
 *   3. `pnpm db:migrate` — applies pending migrations, tracking them in
 *      `__drizzle_migrations`.
 *
 * Legacy SQL in ./migrations was applied via scripts/run-migrations.ts and
 * tracked in `_db_migrations`. Existing deployments must run
 * scripts/baseline-drizzle.ts once to mark the drizzle-kit baseline applied
 * without re-executing CREATE TABLE on live tables.
 */
export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://modus:modus@localhost:5432/modus",
  },
  strict: true,
  verbose: true,
} satisfies Config;
