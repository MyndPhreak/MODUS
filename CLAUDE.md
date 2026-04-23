# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MODUS** (Modular Discord Utility System) is a pnpm-workspace monorepo with three packages:

- **`bot/`** — Discord bot (discord.js v14) with dynamically-loaded feature modules.
- **`web/`** — Nuxt 4 dashboard (Vue 3, SSR for public pages, SPA for `/dashboard/**`).
- **`packages/db/`** (`@modus/db`) — Shared Postgres schema, drizzle client, and repositories consumed by both `bot` and `web`.

**Version:** 1.10.0 | **Runtime:** Node.js 22 | **Package Manager:** pnpm v10.9.0 (enforced via `packageManager` field — do not use npm or yarn).

> **Note:** The branch `refactor/drop-appwrite` is mid-migration from Appwrite to Postgres + R2. If something in the code still mentions Appwrite (env vars, comments, old scripts), cross-reference [docs/backend-migration-plan.md](docs/backend-migration-plan.md) and [docs/migration-runbook.md](docs/migration-runbook.md) before assuming it's current.

## Development Commands

Root has a `postinstall` that builds `@modus/db`, so `pnpm install` at the root is usually what you want.

### Bot (`cd bot/`)

| Command | Description |
|---------|-------------|
| `pnpm run dev` | ts-node + nodemon hot reload |
| `pnpm run dev:sharded` | Sharded with hot reload |
| `pnpm run build` | Compile to `dist/` |
| `pnpm run start` / `start:sharded` | Run compiled output |

### Web (`cd web/`)

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Nuxt dev server on `0.0.0.0:3000` |
| `pnpm run build` / `preview` / `generate` | Standard Nuxt targets |

### Database (`cd packages/db/`)

| Command | Description |
|---------|-------------|
| `pnpm run build` | Compile to `dist/` (production consumers read from here) |
| `pnpm db:generate` | drizzle-kit: diff `src/schema.ts` against snapshot, emit new SQL into `./drizzle` |
| `pnpm db:migrate` | drizzle-kit: apply pending migrations, track in `drizzle.__drizzle_migrations` |
| `pnpm db:studio` | drizzle-kit: launch schema/data browser |
| `pnpm db:baseline` | One-time: mark the drizzle-kit baseline applied on a DB created by the legacy runner (existing deployments only) |
| `pnpm run migrate` | **Legacy** — raw SQL runner for `./migrations/0001-0004_*.sql`, tracked in `_db_migrations`. Kept for pre-drizzle-kit records; new migrations go through `db:generate` |
| `pnpm run migrate:recordings` | Backfill recordings metadata |
| `pnpm run migrate:all` | One-shot Appwrite → Postgres migration (transitional) |

### Docker

```sh
docker compose up -d          # both services
docker compose up -d bot      # bot only (port 3005)
docker compose up -d web      # web only (port 3000)
```

No test runner is wired up (the `bot` `test` script is a placeholder). No linter or formatter is configured — match surrounding style.

## Architecture

### Bot module system

Each file in [bot/modules/](bot/modules/) exports a `Module` object consumed by [bot/ModuleManager.ts](bot/ModuleManager.ts):

- **`data`** — `SlashCommandBuilder` command definition.
- **`execute(interaction)`** — Command handler.
- **`buttons` / `selectMenus` / `modals`** — Optional interaction handlers, routed by `customId` prefix.
- **`events`** — Optional Discord.js event listeners.
- **`autoDefer`** — Auto-reply-deferral toggle (default `true`).

`ModuleManager` discovers modules at boot, registers their commands with Discord, and dispatches interactions. No manual registration step.

### Data layer

- **Postgres** is the system of record. Schema + repositories live in [packages/db/src/](packages/db/src/); repositories are the only public way to read/write rows.
- **[bot/DatabaseService.ts](bot/DatabaseService.ts)** is the single facade modules use. It wraps the `@modus/db` repositories and owns [bot/CacheService.ts](bot/CacheService.ts) (L1 cache with Redis-pub/sub invalidation) and [bot/StorageService.ts](bot/StorageService.ts) (Cloudflare R2 blobs for recordings + welcome backgrounds).
- **Postgres (`DATABASE_URL`) and R2 (`R2_*`) are required** — the bot fails fast at startup if they're missing.
- **Redis (`REDIS_URL`) is optional but recommended** for sharded deployments. It enables: cross-shard cache invalidation, leader election for background workers (so only one shard runs the recording retention sweep), and dashboard SSE. Without it, the bot uses in-process cache + shard-0 as the implicit worker leader, and the dashboard realtime stream is unavailable.
- **Settings validation** — runtime Zod schemas in [bot/lib/schemas.ts](bot/lib/schemas.ts).

### Cross-shard coordination

- **[bot/EventBus.ts](bot/EventBus.ts)** — JSON-framed pub/sub over Redis. Channels are shared with the Nitro SSE bridge in `web/server/utils/eventbus.ts`; keep channel constants in sync between the two files.
- **[bot/LeaderElection.ts](bot/LeaderElection.ts)** — Redis-backed leader lease. Gate any new periodic/background worker through this before adding it, otherwise every shard will run it.

### Web dashboard

- SSR is disabled for `/dashboard/**` (client-only, requires Discord OAuth); public pages like `/` and `/login` render server-side.
- [web/server/api/](web/server/api/) Nitro routes proxy Discord API calls server-side so the bot token never reaches the browser.
- Settings read/write flows through the `useServerSettings` composable; module-specific UI state goes into `use<Feature>.ts` composables.
- Route files use the `<name>.<method>.ts` convention (e.g., `bot-health.get.ts`).
- Tailwind + `@nuxt/ui` with a glassmorphism theme in [web/tailwind.config.js](web/tailwind.config.js).

## Commit Conventions

Conventional commits drive **Release Please** for automated versioning and `CHANGELOG.md`.

Format:
```
type(scope): subject

- Optional bullet body with rationale for non-obvious decisions
```

Changelog-visible types: `feat`, `fix`, `perf`, `refactor`, `docs`. Silent: `chore`, `ci`, `style`, `test`.

Scopes: `bot`, `web`, `api`, `db`.

**Granular commits.** When multiple changes are pending, make one commit per logical change so Release Please produces one changelog bullet per feature. Commit in dependency order: infra/config → bot/db → API routes → web UI → docs/chore. See [.agent/workflows/stage-comment-commit.md](.agent/workflows/stage-comment-commit.md).

**Always stage specific files** (`git add path/to/file`) — never `git add .` or `-A`. This is load-bearing because `.env` files and other local state occasionally appear in the tree.

## CI/CD

- **[.github/workflows/ci.yml](.github/workflows/ci.yml)** — On push to `main`: detects changed service, builds Docker image, pushes to GHCR tagged `latest` + `sha-<hash>`.
- **[.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)** — On release: builds both services with semver tags.
- **[.github/workflows/release-please.yml](.github/workflows/release-please.yml)** — Opens version-bump PRs from conventional commits.

## Adding features

**New bot module.** Create `bot/modules/<name>.ts` exporting a `Module`. If it needs persistence: define the table(s) in `packages/db/src/schema.ts`, add a repository in `packages/db/src/repositories/`, run `pnpm db:generate` to emit a migration into `packages/db/drizzle/`, re-export from `packages/db/src/index.ts`, then surface the methods you need on `bot/DatabaseService.ts`. For hot-read data, wire it through `CacheService` so Redis-backed invalidation works across shards. If it needs settings, add a Zod schema in `bot/lib/schemas.ts`.

**New dashboard page for a module.** Add `web/app/pages/dashboard/[guild_id]/<module>.vue`, a `use<Module>.ts` composable if state is non-trivial, and any server-side operations under `web/server/api/<module>/`. Read/write settings through `useServerSettings`.

**New background worker.** Gate it with `LeaderElection` so only one shard runs it. Don't assume shard-0 — sharded deployments need the lease. See [bot/RecordingRetentionWorker.ts](bot/RecordingRetentionWorker.ts) for a reference pattern.
