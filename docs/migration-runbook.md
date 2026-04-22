# MODUS Migration Runbook: Appwrite → Postgres + Redis + R2

> **Audience:** operator running an existing Appwrite-backed MODUS deployment.
> **Goal:** end up on Postgres + R2 (and optionally Redis) with all guild data, recordings metadata, and configs intact.
> **Companion doc:** `backend-migration-plan.md` (the *why*; this doc is the *how*).

A typical run is 60–90 minutes for a small deployment, longer if `logs` and `ai_usage_log` are large. The data migration script is idempotent and resumable, so partial failures are safe to re-run.

---

## 1. Pre-flight checklist

Before you start, have these in hand:

- [ ] **Appwrite admin access** to the project backing your current deployment, with a server API key that can read every collection in the `discord_bot` database.
- [ ] **Cloudflare account** for R2. (Free tier is fine for testing; storage is $0.015/GB-mo, egress is $0.)
- [ ] **A host with Docker** and the existing `docker-compose.yml` working. The new Postgres/Redis services run on this same host via opt-in compose profiles.
- [ ] **A maintenance window**, even a short one. The data migration itself can run with the bot online (it reads from Appwrite, writes to Postgres), but the cutover step requires a bot+web restart.
- [ ] **Disk headroom** for the Postgres volume. Estimate ~1.5× the size of your Appwrite database; `logs` and `ai_usage_log` dominate.
- [ ] **`pnpm` installed** on the host that will run the migration scripts. The scripts run from `packages/db` and need the workspace to be installed.

Take a snapshot of the Appwrite project (or at least export the four high-value collections: `guild_configs`, `recordings`, `recording_tracks`, `automod_rules`) before you start. Rollback assumes Appwrite is still around and untouched.

---

## 2. Provision Cloudflare R2

R2 holds recording audio files and welcome background images. The bot streams uploads directly into R2 (no local buffer) and the dashboard hands clients presigned URLs (no egress through Nitro).

1. **Create the bucket.** Cloudflare dashboard → **R2** → **Create bucket**. Name it `modus-recordings` (or anything; you'll set `R2_BUCKET` to match). Pick the region closest to your bot host.
2. **Get an API token.** R2 → **Manage R2 API Tokens** → **Create API token**. Permissions: **Object Read & Write**, scoped to the bucket you just created. Save the **Access Key ID** and **Secret Access Key** — Cloudflare only shows the secret once.
3. **Note your Account ID.** Visible on the R2 overview page; you'll set `R2_ACCOUNT_ID` to this.
4. **Add a lifecycle rule** (R2 dashboard → bucket → **Settings** → **Object lifecycle rules**):
   - **Abort incomplete multipart uploads after 1 day.** Prevents orphaned upload parts from stuck recording sessions.
   - Optional: **expire objects after N days** if you want a hard retention ceiling on top of `RECORDING_RETENTION_DAYS` (the bot does its own nightly sweep).
5. **(Optional) Custom domain.** If you want pretty playback URLs, attach a custom domain in **Settings** → **Public access**. The dashboard uses presigned URLs by default and doesn't need this.

You should now have four values: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

---

## 3. Stand up Postgres + Redis

Both services are defined in `docker-compose.yml` as opt-in profiles, so they don't run unless you ask for them.

```sh
# Postgres only (Redis is optional for single-shard deployments)
docker compose --profile postgres up -d postgres

# Or both, if you're sharding or want SSE realtime in the dashboard
docker compose --profile postgres --profile redis up -d postgres redis
```

Verify they're healthy:

```sh
docker compose ps
# Both should show "healthy" within 10–20s.
```

The default credentials in compose are `modus` / `modus` / `modus` (db / user / password). For anything beyond local testing, set `POSTGRES_PASSWORD` (and optionally `POSTGRES_DB`, `POSTGRES_USER`) in your shell or compose `.env` before bringing the stack up.

---

## 4. Wire environment variables

Two `.env` files: `bot/.env` and `web/.env`. The web side prefixes everything with `NUXT_` because Nuxt's runtime config requires it.

### Bot (`bot/.env`)

| Variable | Required? | Notes |
|---|---|---|
| `DISCORD_TOKEN` | yes | Existing — unchanged. |
| `CLIENT_ID` | yes | Existing — unchanged. |
| `DATABASE_URL` | **new, required** | `postgres://modus:modus@postgres:5432/modus` for the compose stack. Use the container DNS name `postgres`, not `localhost`. |
| `R2_ACCOUNT_ID` | **new, required** | From step 2. |
| `R2_ACCESS_KEY_ID` | **new, required** | From step 2. |
| `R2_SECRET_ACCESS_KEY` | **new, required** | From step 2. |
| `R2_BUCKET` | **new, required** | Bucket name from step 2. |
| `R2_ENDPOINT` | optional | Override only for non-Cloudflare S3-compatible providers (B2, MinIO). |
| `R2_PRESIGN_TTL` | optional | Seconds; default `300`. |
| `REDIS_URL` | optional | `redis://redis:6379` for the compose stack. Leave empty on single-process deployments — bot falls back to in-process cache and shard-0 worker gating. |
| `RECORDING_RETENTION_DAYS` | optional | Default `30`. `0` disables the nightly sweep. |
| `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` | **temporary** | The migration scripts in `packages/db` still need these. **Keep them set during the migration, then remove after step 9.** The bot itself no longer reads them. |

All other existing variables (`DASHBOARD_URL`, `RENDER_API_KEY`, `AI_*`, `TWITCH_*`, `SEARXNG_URL`, etc.) are unchanged. Refer to `bot/.env.example` for the full list and inline docs.

### Web (`web/.env`)

| Variable | Required? | Notes |
|---|---|---|
| `NUXT_DISCORD_BOT_TOKEN` | yes | Existing. |
| `NUXT_DISCORD_CLIENT_SECRET` | yes | Existing — Discord OAuth. |
| `NUXT_SESSION_PASSWORD` | yes | ≥32 chars. Generate with `openssl rand -hex 32`. Used by `nuxt-auth-utils` to seal session cookies. |
| `NUXT_RENDER_API_KEY` | yes | Must match `RENDER_API_KEY` on the bot side. |
| `NUXT_DATABASE_URL` | **new, required** | Same Postgres URL as the bot. Endpoints return 503 when unset. |
| `NUXT_R2_ACCOUNT_ID` | **new, required** | Same as bot's `R2_ACCOUNT_ID`. |
| `NUXT_R2_ACCESS_KEY_ID` | **new, required** | Same value, prefixed for Nuxt. |
| `NUXT_R2_SECRET_ACCESS_KEY` | **new, required** | Same value, prefixed for Nuxt. |
| `NUXT_R2_BUCKET` | **new, required** | Same as bot. |
| `NUXT_R2_ENDPOINT` | optional | Same logic as bot. |
| `NUXT_R2_PRESIGN_TTL` | optional | Default `300`. |
| `REDIS_URL` | optional | Required only if you want SSE realtime (log tail, change events). 503 from `/api/events/:channel` when unset. |
| `NUXT_PUBLIC_BASE_URL` | yes | Existing. |
| `NUXT_PUBLIC_BOT_URL` | yes | Existing — internal URL the dashboard uses to hit the bot's health endpoint. |
| `NUXT_PUBLIC_BOT_ADMIN_IDS` | optional | Existing. |

The web app does **not** need any `APPWRITE_*` vars at any point — those are bot-side only and only for the migration scripts.

Both `.env.example` files have inline comments for everything; copy them into `.env` and fill in.

---

## 5. Run schema migrations

This creates the 14 tables, indexes, and the `_db_migrations` tracking table. Safe to re-run at any time.

```sh
# Install workspace deps if you haven't yet
pnpm install

# Apply every *.sql in packages/db/migrations/ in alphabetical order
DATABASE_URL=postgres://modus:modus@localhost:5432/modus \
  pnpm --filter @modus/db run migrate
```

Expected output:

```
→ apply 0001_initial_recordings.sql
✓ 0001_initial_recordings.sql
→ apply 0002_remaining_tables.sql
✓ 0002_remaining_tables.sql
migrations complete.
```

Re-running is a no-op:

```
↷ skip 0001_initial_recordings.sql (already applied)
↷ skip 0002_remaining_tables.sql (already applied)
migrations complete.
```

The runner records each applied filename in `_db_migrations` and runs each file in its own transaction — a failure rolls back only that file, not the whole run. If a migration fails halfway, fix it, then re-run.

> **Note:** when running migrations from your dev machine against the dockerized Postgres, use `localhost:5432`. Inside containers (the bot, the web, the migration if you run it via `docker compose run`), use `postgres:5432`.

---

## 6. Migrate Appwrite data

The migration is two scripts in `packages/db`:

| Script | What it does | When to use |
|---|---|---|
| `migrate:all` | Pages through every Appwrite collection, transforms each document, and upserts to Postgres with `ON CONFLICT DO NOTHING` on the preserved `$id`. Handles all 14 collections. | **The main path. Run this.** |
| `migrate:recordings` | Same as above but scoped to `recordings` + `recording_tracks` only. Useful if you want to re-migrate just recordings without churning through `logs`. | Optional, situational. |

Both require all four env vars: `DATABASE_URL` plus the three `APPWRITE_*`. Both are idempotent and resumable — re-runs skip already-migrated rows by primary key conflict.

### 6a. Dry run first

```sh
DATABASE_URL=postgres://modus:modus@localhost:5432/modus \
APPWRITE_ENDPOINT=https://appwrite.example.com/v1 \
APPWRITE_PROJECT_ID=your-project-id \
APPWRITE_API_KEY=your-server-api-key \
  pnpm --filter @modus/db run migrate:all -- --dry-run
```

This walks every collection and prints what would be written. **No writes occur.** Read the summary at the end — if a collection shows 0 rows but you know it has data, your API key probably lacks read permission on that collection.

### 6b. Real run

Drop `--dry-run`:

```sh
DATABASE_URL=postgres://modus:modus@localhost:5432/modus \
APPWRITE_ENDPOINT=https://appwrite.example.com/v1 \
APPWRITE_PROJECT_ID=your-project-id \
APPWRITE_API_KEY=your-server-api-key \
  pnpm --filter @modus/db run migrate:all
```

Collections migrate in FK-safe order: `modules` → `servers` → `bot_status` → `guild_configs` → `logs` → `recordings` → `recording_tracks` → `milestone_users` → `automod_rules` → `ai_usage_log` → `tags` → `temp_voice_channels` → `triggers`.

The script logs progress every 100 rows per collection and prints a summary at the end:

```
── summary ────────────────────────────────────────────────
  modules                       3 migrated     0 skipped
  servers                      14 migrated     0 skipped
  guild_configs               201 migrated     0 skipped
  logs                      48,217 migrated     0 skipped
  …
```

`skipped` means a row failed to write (logged with reason inline above). Common causes: malformed JSON in a `settings` field, a `recording_tracks` row whose parent `recordings` row was deleted in Appwrite. These are usually safe to leave.

### 6c. Useful flags

| Flag | Effect |
|---|---|
| `--dry-run` | Preview only. No writes. |
| `--limit N` | Cap rows copied per collection (good for spot-checks). |
| `--only logs,ai_usage_log` | Restrict to specific collections. |
| `--skip logs,ai_usage_log` | Exclude specific collections. |

Strategy for large datasets: run without `logs` and `ai_usage_log` first to get the operationally important data across quickly (`--skip logs,ai_usage_log`), verify, then run again without filters to backfill those high-volume tables.

### 6d. Recording audio files (if you used Appwrite Storage)

The data migration moves the **metadata** rows (`recordings`, `recording_tracks`) but does **not** copy audio files from Appwrite Storage to R2. The `file_id` column preserves whatever was there. Two paths:

- **Cold cutover** (recommended for small deployments): accept that pre-migration recordings are no longer playable from the dashboard. New recordings (post-cutover) write straight to R2 and play normally. Delete the stale rows later if you want.
- **Hot copy**: write a one-off script that lists `recording_tracks`, downloads each `file_id` from Appwrite Storage, uploads to R2 at key `recordings/<guildId>/<recordingId>/<userId>.ogg`, and updates the `file_id` column. There's no script for this in-tree; it's a guild-by-guild call based on how much old audio you care about.

---

## 7. Verify

Spot-check that the migration landed what you expect.

```sh
# Connect to Postgres
docker compose exec postgres psql -U modus -d modus
```

Row counts per collection — compare against Appwrite:

```sql
SELECT 'modules' AS table, COUNT(*) FROM modules
UNION ALL SELECT 'servers', COUNT(*) FROM servers
UNION ALL SELECT 'guild_configs', COUNT(*) FROM guild_configs
UNION ALL SELECT 'bot_status', COUNT(*) FROM bot_status
UNION ALL SELECT 'logs', COUNT(*) FROM logs
UNION ALL SELECT 'recordings', COUNT(*) FROM recordings
UNION ALL SELECT 'recording_tracks', COUNT(*) FROM recording_tracks
UNION ALL SELECT 'milestone_users', COUNT(*) FROM milestone_users
UNION ALL SELECT 'automod_rules', COUNT(*) FROM automod_rules
UNION ALL SELECT 'ai_usage_log', COUNT(*) FROM ai_usage_log
UNION ALL SELECT 'tags', COUNT(*) FROM tags
UNION ALL SELECT 'temp_voice_channels', COUNT(*) FROM temp_voice_channels
UNION ALL SELECT 'triggers', COUNT(*) FROM triggers
ORDER BY 1;
```

Sentinel rows to expect in `guild_configs` (these are not bugs):

- `guild_id = '__global__', module_name = 'ai'` — global AI config row.
- `module_name = 'alerts_state'` — per-guild alerts cursor; one per guild that uses alerts.

Sanity-check a known guild's config:

```sql
SELECT module_name, enabled, jsonb_pretty(settings)
FROM guild_configs
WHERE guild_id = '<your test guild id>'
ORDER BY module_name;
```

Verify FKs resolved on tracks:

```sql
SELECT COUNT(*) FROM recording_tracks t
LEFT JOIN recordings r ON r.id = t.recording_id
WHERE r.id IS NULL;
-- Should be 0. If non-zero, those tracks reference recordings that didn't migrate.
```

If everything looks right, proceed.

---

## 8. Cut over

The data is in Postgres but the bot and web are still using whatever they were before. Now flip them.

1. **Bring the bot down**: `docker compose stop bot`.
2. **Bring the web down**: `docker compose stop web`.
3. **Confirm both `.env` files have all the new variables** from step 4.
4. **Bring them back up**: `docker compose up -d bot web`.
5. **Tail logs**: `docker compose logs -f bot web`. Look for:
   - Bot: `Discord bot ready` and no `DATABASE_URL is not set` errors. The health endpoint at `http://<host>:3005` should return 200.
   - Web: Nuxt boots without 503s. Visit the dashboard, log in via Discord OAuth, open a guild settings page.

Smoke-test checklist:

- [ ] Log into the dashboard. OAuth completes; sessions persist after a page refresh (Redis-backed if `REDIS_URL` is set, in-memory otherwise).
- [ ] Open **any guild → any module page**. Settings should load (proves `guild_configs` reads work) and saving should round-trip (proves writes work).
- [ ] Run `/ping` in a Discord channel where the bot is present. Confirms the bot is online and command routing is intact.
- [ ] Start a **new recording**. Stop it. Confirm a row appears in `recordings`, files appear under your R2 bucket at `recordings/<guildId>/<recordingId>/`, and the dashboard playback button works (presigned URL).
- [ ] If `REDIS_URL` is set: open the **admin logs page** in the dashboard. The SSE stream (`/api/events/logs:<guildId>`) should attach without 503 and new log lines from the bot should appear within a second or two.
- [ ] If you sharded: edit a module setting on shard A's guild and confirm shard B picks up the change within a couple seconds (Redis pub/sub cache invalidation).

If any of these fail, jump to **Rollback** (section 11).

---

## 9. Decommission Appwrite

Once you've run for a few days on the new stack with no issues:

1. **Remove Appwrite env vars** from `bot/.env`:
   - `APPWRITE_ENDPOINT`
   - `APPWRITE_PROJECT_ID`
   - `APPWRITE_API_KEY`
2. **Restart the bot** (`docker compose restart bot`) to confirm it boots fine without them.
3. **Lock the Appwrite project to read-only** in the Appwrite admin console. Don't delete it yet — keep it as a 30-day escape hatch.
4. **After 30 days** of stable operation, delete the Appwrite project (or just stop the container if you self-host).
5. **Optional cleanup commit**: drop `node-appwrite` from `packages/db/package.json` devDependencies and delete `packages/db/scripts/migrate-appwrite.ts` + `migrate-recordings.ts` if you'll never need to re-run them. Most operators just leave them — they're inert without the env vars.

---

## 10. Troubleshooting

**`DATABASE_URL is not set`**
The migration script or the bot can't see the env var. From inside Docker, the host is `postgres`, not `localhost`. From your dev machine, it's `localhost:5432`.

**`relation "_db_migrations" does not exist`**
You ran `migrate:all` before `migrate`. Run `pnpm --filter @modus/db run migrate` first to create the schema, then re-run the data migration.

**`insert or update on table "recording_tracks" violates foreign key constraint`**
Tracks migrated before recordings. Re-run `migrate:all` — the script orders them correctly, so this means a single track row references a recording that was deleted in Appwrite. The script logs and skips these; the line shows up under `skipped` in the summary, which is fine.

**R2 returns 403 on upload or playback**
Token doesn't have **Object Read & Write** scope, or it's scoped to a different bucket than `R2_BUCKET`. Re-issue from the Cloudflare dashboard with the correct scope.

**`/api/events/:channel` returns 503**
`REDIS_URL` is not set in `web/.env`. SSE requires Redis pub/sub. Either set it or ignore the realtime stream — the dashboard still works without it (snapshots only, no live updates).

**Bot logs `Module ai/alerts unavailable` after migration**
Check that the sentinel rows exist in `guild_configs`: `SELECT * FROM guild_configs WHERE module_name IN ('ai', 'alerts_state');`. If `migrate:all` skipped them due to malformed `settings` JSON, the underlying Appwrite document had bad data — recreate the row from the dashboard.

**Logs/AI usage migration takes hours**
Expected for high-volume tables. You can run `--skip logs,ai_usage_log` to defer them; the bot doesn't depend on historical logs to function. Backfill them in a second run when convenient.

**Postgres connection pool exhausted under load**
Bump `pg`'s `max` in `packages/db/src/client.ts` (default is 10). Tune based on your shard count × concurrent query rate.

---

## 11. Rollback

You only need rollback if the cutover (step 8) surfaces a problem you can't fix forward.

**Within minutes of cutover** (no new writes have hit Postgres yet):

1. Stop bot and web: `docker compose stop bot web`.
2. Restore the previous `.env` files (the ones with `APPWRITE_*` vars and no `DATABASE_URL` / `R2_*`).
3. Restore the previous `bot/` and `web/` images — the current commit removed Appwrite from the bot/web code, so you need to roll back to a tag from before the Appwrite removal series of commits. Check git log for the last commit referencing `AppwriteService.ts`.
4. Bring services back up. Appwrite traffic resumes; nothing was lost on the Appwrite side because the migration only reads.

**Hours/days after cutover** (real new data exists in Postgres only):

This is harder. Options:

- **Forward-fix.** Whatever broke is almost always faster to fix in code than to migrate data backwards. The team has been operating on the new stack day-to-day.
- **Backwards migration.** No script ships for this. You'd have to read Postgres, transform back to Appwrite document shapes, and write via `node-appwrite`. Plan on writing it from scratch and budget half a day. Only worth it if forward-fixing is genuinely impossible.

Keep the Appwrite project read-only for at least 30 days post-cutover so option 1 stays available even after a delay.
