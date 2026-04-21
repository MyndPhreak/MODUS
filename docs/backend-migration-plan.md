# MODUS Backend Migration Plan: Off Appwrite

> **Status:** Proposal / design draft
> **Scope:** Replace Appwrite (Database + Storage + Realtime + Auth sessions) across `bot/` and `web/` with a self-hostable, shard-aware stack.
> **Branch:** `claude/explore-backend-alternatives-WNhoe`

---

## 1. Why move

Appwrite currently fills four roles in MODUS:

| Role | Current usage |
|---|---|
| Database | 14 collections (modules, servers, bot_status, logs, guild_configs, recordings, recording_tracks, milestone_users, automod_rules, ai_usage_log, tags, temp_voice_channels, triggers, plus a `recordings` bucket) managed through `bot/AppwriteService.ts` (~1,370 lines) |
| Storage | `recordings` bucket, welcome background uploads |
| Realtime | Dashboard subscribes to bot health and admin logs (`web/app/composables/useBotHealth.ts`, `web/app/pages/dashboard/admin/logs.vue`) |
| Auth sessions | Sits alongside Discord OAuth (`web/server/api/auth/`) |

Pain points at scale:

- **Document model** — no joins, no transactions, expensive for growth queries (milestones, AI usage aggregation).
- **Sharded bot needs shared state** — in-memory `TTLCache` in `AppwriteService.ts:14` doesn't cross shards.
- **Recording egress cost** — Appwrite Storage egress is not free; streaming previews from the dashboard will hurt.
- **Realtime lock-in** — `appwrite`'s websocket client requires globals shimmed in Node (`AppwriteService.ts:88-99`), which is fragile.

## 2. Target stack

| Layer | Replacement |
|---|---|
| Relational data | **PostgreSQL 16** + **Drizzle ORM** (shared schema package consumed by bot and web) |
| Object storage | **Cloudflare R2** (S3-compatible) via `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` |
| Cross-shard cache / pub-sub / locks | **Redis 7** (Upstash managed or self-hosted Cluster) via `ioredis` |
| Dashboard realtime | **SSE** from Nitro, fed by Redis pub/sub |
| Dashboard sessions | **`nuxt-auth-utils`** cookie sessions, Redis-backed store |
| Auth provider | Discord OAuth (unchanged) |

### Why R2 for recordings

Recordings are OGG/Opus (`bot/modules/recording.ts:358`) at a configurable bitrate; at 64 kbps that's ~0.48 MB/min/user. A 1-hour 5-speaker session is ~145 MB. Access pattern is write-once, download-sometimes, stream-from-dashboard.

- **R2** — $0.015/GB-mo storage, **$0 egress**. Predictable bill even if a clip is streamed repeatedly.
- **B2** — $0.006/GB-mo storage, free egress up to 3× storage then $0.01/GB. Cheaper if egress stays bounded; exposed if it spikes.
- **S3** — $0.023/GB-mo + $0.09/GB egress. Avoid.

At 2 TB stored + 4 TB egress/month: R2 ≈ $31, B2 ≈ $12, S3 ≈ $415. R2 chosen because the dashboard stream endpoint (`web/server/api/recordings/stream.get.ts`) makes egress unpredictable and we'd rather cap cost than optimize it.

## 3. Data model (Drizzle)

Map each Appwrite collection to a Postgres table. All tables are partitioned by `guild_id` (index it).

| Collection | Table | Notes |
|---|---|---|
| `modules` | `modules` | Static per-guild module enablement |
| `servers` | `servers` | Guild metadata, owner, premium flag |
| `bot_status` | `bot_status` | Heartbeat rows, TTL via cron |
| `logs` | `logs` | High-insert volume — consider partitioning by month |
| `guild_configs` | `guild_configs` | One row per (guild, module); JSONB payload validated by existing Zod schemas in `bot/lib/schemas.ts` |
| `recordings` | `recordings` | Session metadata |
| `recording_tracks` | `recording_tracks` | Per-user tracks, FK to `recordings.id`, stores R2 object key |
| `milestone_users` | `milestone_users` | Unique index on (guild_id, user_id) |
| `automod_rules` | `automod_rules` | JSONB rule config |
| `ai_usage_log` | `ai_usage_log` | High-insert — partition by month, aggregate nightly |
| `tags` | `tags` | Unique (guild_id, name) |
| `temp_voice_channels` | `temp_voice_channels` | Ephemeral; TTL by cron |
| `triggers` | `triggers` | Webhook triggers |

### Shared package layout

```
packages/db/
├── package.json
├── schema.ts          # Drizzle table definitions
├── client.ts          # pg Pool + drizzle() export
├── migrations/        # drizzle-kit generated SQL
└── index.ts           # re-exports
```

Both `bot/` and `web/` add `@modus/db` as a workspace dependency.

## 4. Service facade

Keep the public method surface of `AppwriteService` so callers in `bot/modules/**` and `web/server/api/**` need minimal edits.

```
bot/
├── DatabaseService.ts   # was AppwriteService.ts — same method names, Drizzle inside
├── StorageService.ts    # R2 uploads, presigned URLs, lifecycle policy writes
├── CacheService.ts      # Redis-backed TTL cache (replaces in-memory TTLCache)
└── EventBus.ts          # Redis pub/sub wrapper (publish logs, health, cross-shard events)
```

Rename is cosmetic but useful — makes the dependency change explicit in PR diffs.

## 5. Realtime

Replace Appwrite Realtime with SSE fan-out:

1. Bot publishes events to Redis channels:
   - `logs:<guildId>` — structured log entries from `Logger.ts`
   - `bot:health` — heartbeat & shard status
   - `music:<guildId>` — queue/playback state changes (already partly there via `MusicAPI.ts`)
2. Nitro exposes `/api/events/:channel` as SSE. Handler subscribes to the Redis channel and streams to the client.
3. Web composables (`useBotHealth`, logs page) swap Appwrite's `client.subscribe(...)` for `new EventSource('/api/events/bot:health')`.

Auth on SSE: same Discord session cookie; server-side check before subscribing to guild-scoped channels.

## 6. Redis responsibilities

Beyond caching:

| Use | Pattern |
|---|---|
| Config cache (replaces `TTLCache` in `AppwriteService.ts:14`) | `config:<guildId>:<module>` string, `PX 60000` |
| Dashboard realtime | pub/sub channels per above |
| Leader election for `AlertsWorker` | `SET alerts:leader <shardId> NX PX 15000`, refresh every 5 s |
| Scheduled events / cron leases | same lease pattern per job name |
| Cross-shard music queue handoff | `LIST queue:<guildId>` if we ever need it; optional |
| Rate limits (AI, command throttles) | token-bucket Lua script |
| Dashboard sessions | `nuxt-auth-utils` Redis driver |

Client: `ioredis` with `enableAutoPipelining: true`. Managed: Upstash (pay-per-request suits bursty bot traffic). Self-hosted: Redis Cluster in `docker-compose.yml`.

## 7. Recordings pipeline

Current path buffers through Appwrite; new path streams bot → R2 directly.

1. FFmpeg in `bot/modules/recording.ts` already writes OGG/Opus per user track (line ~358).
2. Pipe FFmpeg `stdout` into `@aws-sdk/lib-storage` `Upload` with `partSize: 8 MB`. No local file, no full-buffer-in-memory.
3. On completion, insert a `recording_tracks` row referencing the R2 object key (`guild_id/recording_id/user_id.ogg`).
4. `web/server/api/recordings/stream.get.ts` returns a presigned R2 GET URL (5-minute TTL) instead of proxying bytes. Browser fetches directly from R2.
5. `recordings/delete.post.ts` issues `DeleteObjectCommand` and removes the DB row in a transaction.

Cost controls:

- **Lifecycle expiry** — configurable per guild (default 30 days); enforced by a nightly worker that issues batched deletes. Most recordings are never re-listened after the first week.
- **Per-guild quota** — track `bytes_used` on the `servers` row, check before allowing new recordings. Surface on dashboard; gates a future premium tier.
- **Bitrate cap** — expose the existing `settings.bitrate` in the dashboard with a 48–64 kbps default.
- **R2 bucket lifecycle rule** — abort incomplete multipart uploads after 24 h.

## 8. Auth

Today: Discord OAuth flow in `web/server/api/auth/discord.get.ts` and `callback.get.ts`, session stored server-side via Appwrite.

After:

- Keep the exact OAuth flow.
- Install `nuxt-auth-utils`, configure a Redis session driver.
- Replace `setCookie` / Appwrite session calls with `setUserSession(event, { user, tokens })`.
- `web/server/utils/refreshDiscordToken.ts` reads the refresh token from the session, writes the new access token back.
- Admin checks (`dashboard/admin/**`) read `event.context.user.id` and compare against an `admin_user_ids` table or env-driven allowlist.

## 9. Infrastructure (`docker-compose.yml`)

Add:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: modus
      POSTGRES_USER: modus
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

Remove the Appwrite stack. R2 is external, no container needed.

New environment variables:

```
DATABASE_URL=postgres://modus:***@postgres:5432/modus
REDIS_URL=redis://redis:6379
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=modus-recordings
R2_PUBLIC_URL=https://<custom-domain>   # optional
SESSION_SECRET=...                       # for nuxt-auth-utils cookie sealing
```

Retire:

```
APPWRITE_ENDPOINT
APPWRITE_PROJECT_ID
APPWRITE_API_KEY
```

## 10. Migration phases

Each phase is a separate PR so review stays tractable.

### Phase 0 — scaffolding (no behavior change)

- Add `packages/db` workspace with Drizzle schema mirroring the 14 collections.
- Add `docker-compose.yml` services for Postgres and Redis (dev profile).
- Generate initial migration with `drizzle-kit`.
- CI: run migrations against a throwaway Postgres container.

### Phase 1 — data plane swap

- Implement `DatabaseService` with the same public surface as `AppwriteService`.
- Implement `CacheService` (Redis TTL cache).
- Feature-flag `USE_POSTGRES=true` to choose between the two services at boot.
- One-shot migration script: read every Appwrite document, write to Postgres. Idempotent, resumable.
- Dual-write period: keep Appwrite writes live until verification passes.
- Cut over when row counts and spot-checks match.

### Phase 2 — storage swap

- Implement `StorageService` for R2.
- Update `bot/modules/recording.ts` upload path to stream into R2 multipart.
- Update `web/server/api/recordings/*` to return presigned URLs.
- Copy existing recordings from Appwrite Storage to R2 (background worker, rate-limited).
- Update welcome background upload endpoint (`web/server/api/welcome/upload-bg.post.ts`).

### Phase 3 — realtime swap

- Add Redis pub/sub in `Logger.ts` and bot health emitters.
- Add `/api/events/:channel` SSE route in Nitro.
- Swap client-side `appwrite` subscriptions for `EventSource` in `useBotHealth.ts` and `admin/logs.vue`.

### Phase 4 — auth swap

- Install `nuxt-auth-utils`, wire Redis session driver.
- Port OAuth handlers.
- Remove Appwrite client from `web/app/plugins/appwrite.ts`, `web/app/utils/appwrite.ts`, `web/app/composables/useAppwrite.ts`.

### Phase 5 — decommission

- Delete `AppwriteService.ts`, `setup-db.ts`, `web/app/types/appwrite.d.ts`.
- Drop `appwrite` and `node-appwrite` from `package.json` in both services.
- Remove Appwrite env vars from `.env.example` files.
- Remove the Appwrite service from production compose / infra.

## 11. Rollback strategy

- Phases 1 and 2 dual-write until cutover. Rollback = flip the feature flag and keep Appwrite traffic live.
- Phase 3 is read-only realtime — no data risk, rollback is a revert.
- Phase 4 rolls back by re-enabling the Appwrite session plugin; the OAuth flow itself doesn't change.
- Keep the Appwrite project in read-only mode for 30 days after Phase 5 as an escape hatch.

## 12. Observability checklist

- Postgres: `pg_stat_statements`, slow-query log, connection-pool saturation alert.
- Redis: memory ceiling, eviction policy (`allkeys-lru` for cache DB, `noeviction` for sessions DB — use separate DB numbers or instances).
- R2: lifecycle rule metrics, 4xx/5xx rate, bandwidth dashboard.
- Bot: existing `Logger.ts` continues to work; additionally emit to Redis for dashboard.

## 13. Open questions

- **Analytics on `ai_usage_log`** — if we want live dashboards, TimescaleDB or a rollup table beats ad-hoc aggregates.
- **Recording transcription** — if we add Whisper, do we transcribe on upload (cheap but slow) or on first playback (lazy)?
- **Multi-region R2** — R2 buckets are single-region; if a Discord region mismatch hurts upload latency, look at jurisdictional bucket placement.
- **Shard count sizing** — Redis lease TTLs must be longer than worst-case shard GC pauses; tune once we have real p99 numbers.

## 14. Effort estimate (rough)

| Phase | Effort |
|---|---|
| 0 — scaffolding | 1–2 days |
| 1 — data plane | 3–5 days + migration script + verification window |
| 2 — storage | 2–3 days + background copy |
| 3 — realtime | 1–2 days |
| 4 — auth | 1–2 days |
| 5 — decommission | 0.5 day |

Total working time ≈ 2 weeks focused, plus a dual-write verification window of 1–2 weeks before final cutover.
