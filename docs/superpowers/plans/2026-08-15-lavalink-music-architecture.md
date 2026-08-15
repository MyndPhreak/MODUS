# Lavalink Music Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bot-local Discord Player playback with a durable, horizontally scalable Lavalink v4 music control plane while preserving MODUS commands and dashboard behavior.

**Architecture:** MODUS owns canonical tracks, queues, authorization, node placement, leases, recovery, and user-facing state through an engine-neutral `MusicService`. Upstream Lavalink owns extraction, decoding, filters, active players, and Discord voice; Postgres persists recoverable state and Redis coordinates distributed ownership.

**Tech Stack:** Node.js 22, TypeScript 6, discord.js 14, Shoukaku 4, Lavalink 4.2.2, youtube-source 1.18.1, Vitest, Drizzle ORM/Postgres, Redis/ioredis, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-15-lavalink-music-architecture-design.md`

## Global Constraints

- Use pnpm 10.9.0 only; do not use npm or yarn.
- Use upstream Lavalink v4 without a MODUS fork.
- Lavalink is the single permanent playback engine; the embedded adapter is temporary migration code.
- MODUS owns durable queues; Lavalink-encoded tracks and signed media URLs are ephemeral.
- Postgres mutations commit before playback dispatch.
- Distributed playback mutations require a renewable guild lease and expected queue revision.
- Never expose Lavalink publicly; use the Compose network locally and Tailscale across hosts.
- Do not implement IP rotation, residential proxy rotation, or platform-enforcement evasion.
- Preserve current Discord commands, dashboard controls, saved filters, nickname behavior, and music/recording exclusion.
- Match the repository's surrounding style; no linter or formatter is configured.
- Stage specific files for every commit; never use `git add .` or `git add -A`.

---

### Task 1: Music domain contract and test harness

**Files:**
- Modify: `bot/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `bot/music/types.ts`
- Create: `bot/music/errors.ts`
- Create: `bot/music/MusicService.ts`
- Create: `bot/music/track-matching.ts`
- Test: `bot/music/track-matching.test.ts`

**Interfaces:**
- Produces: `MusicService`, `CanonicalTrack`, `MusicQueueSnapshot`, `MusicPlayerState`, `MusicCommand`, `MusicResult<T>`, `MusicErrorCode`, `scoreTrackMatch()`.

- [ ] **Step 1: Install the test and Lavalink client dependencies**

Run: `pnpm --filter bot add shoukaku@^4 && pnpm --filter bot add -D vitest@^3`

Edit `bot/package.json` scripts to contain `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 2: Write the failing track-matching tests**

```ts
import { describe, expect, it } from "vitest";
import { scoreTrackMatch } from "./track-matching";

describe("scoreTrackMatch", () => {
  it("accepts the same artist, normalized title, and close duration", () => {
    expect(scoreTrackMatch(
      { title: "Song (Official Video)", artists: ["Artist"], durationMs: 180_000 },
      { title: "Song", artists: ["Artist"], durationMs: 181_000 },
    )).toBeGreaterThanOrEqual(0.9);
  });

  it("rejects a materially different duration", () => {
    expect(scoreTrackMatch(
      { title: "Song", artists: ["Artist"], durationMs: 180_000 },
      { title: "Song", artists: ["Artist"], durationMs: 300_000 },
    )).toBeLessThan(0.85);
  });
});
```

- [ ] **Step 3: Verify the new test fails**

Run: `pnpm --filter bot test -- music/track-matching.test.ts`

Expected: FAIL because `track-matching.ts` does not exist.

- [ ] **Step 4: Define the engine-neutral contract**

Define discriminated commands (`play`, `pause`, `resume`, `seek`, `skip`, `stop`, `queue.remove`, `queue.move`, `queue.clear`, `queue.shuffle`, `volume`, `repeat`, `filters`) with `guildId`, `operationId`, and `expectedRevision` on every mutation. Define:

```ts
export interface MusicService {
  execute(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>>;
  getState(guildId: string): Promise<MusicPlayerState>;
  getQueue(guildId: string): Promise<MusicQueueSnapshot>;
  isActive(guildId: string): Promise<boolean>;
  shutdown(): Promise<void>;
}
```

Define `MusicErrorCode` as the exact stable codes from the spec, including `MUSIC_CONFLICT`. Implement title normalization and a deterministic 0–1 match score using title, artist, duration, and ISRC.

- [ ] **Step 5: Run focused tests and TypeScript build**

Run: `pnpm --filter bot test -- music/track-matching.test.ts && pnpm --filter bot build`

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/package.json pnpm-lock.yaml bot/music/types.ts bot/music/errors.ts bot/music/MusicService.ts bot/music/track-matching.ts bot/music/track-matching.test.ts
git commit -m "feat(bot): define engine-neutral music service"
```

### Task 2: Durable music schema and repository

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/repositories/music.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/drizzle/0006_music_playback_state.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Create: `packages/db/drizzle/meta/0006_snapshot.json`
- Modify: `bot/DatabaseService.ts`
- Test: `bot/music/queue-state.test.ts`

**Interfaces:**
- Consumes: `CanonicalTrack`, `MusicQueueSnapshot` from Task 1.
- Produces: `MusicRepository.readSnapshot(guildId)`, `applyMutation(input)`, `checkpoint(input)`, and `recordNodeAssignment(input)`.

- [ ] **Step 1: Write failing repository-domain tests**

Test a pure exported `applyQueueMutation(snapshot, mutation)` helper for ordered insertion, remove, move, revision conflict, and idempotent replay. Assert that replaying the same `operationId` returns the existing revision without duplicating an entry.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm --filter bot test -- music/queue-state.test.ts`

Expected: FAIL because the queue-state helper is absent.

- [ ] **Step 3: Add schema tables**

Add `musicSessions`, `musicQueueEntries`, and `musicOperations` to `schema.ts`. `music_sessions.guild_id` is unique and stores revision, current entry ID, checkpoint position/time, volume, repeat mode, filters JSON, assigned node ID, and timestamps. `music_queue_entries` stores canonical metadata JSON, requester, position, status, match source/confidence, and timestamps. `music_operations` has a unique `(guild_id, operation_id)` key and resulting revision.

- [ ] **Step 4: Implement transactional repository methods**

`applyMutation` must lock the guild session row, compare `expectedRevision`, return an existing operation result on idempotent replay, apply the ordered mutation, increment revision once, and insert the operation record in one transaction. `checkpoint` updates only current entry, position, and player settings without incrementing the queue revision.

- [ ] **Step 5: Generate the named migration**

Run from `packages/db`: `pnpm db:generate --name music_playback_state`

Expected: Drizzle creates `drizzle/0006_music_playback_state.sql`, updates `_journal.json`, and creates `0006_snapshot.json`. Inspect the SQL for three tables, foreign keys, unique operation index, and guild/position indexes.

- [ ] **Step 6: Expose the repository through `@modus/db` and `DatabaseService`**

Export `MusicRepository` from `packages/db/src/index.ts`; instantiate it as `DatabaseService.music` using the existing shared database client.

- [ ] **Step 7: Run tests and builds**

Run: `pnpm --filter bot test -- music/queue-state.test.ts && pnpm --filter @modus/db build && pnpm --filter bot build`

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/repositories/music.ts packages/db/src/index.ts packages/db/drizzle/0006_music_playback_state.sql packages/db/drizzle/meta/_journal.json packages/db/drizzle/meta/0006_snapshot.json bot/DatabaseService.ts bot/music/queue-state.test.ts bot/music/queue-state.ts
git commit -m "feat(db): persist recoverable music sessions"
```

### Task 3: Node configuration, health, and placement

**Files:**
- Create: `bot/music/NodeRegistry.ts`
- Create: `bot/music/node-config.ts`
- Test: `bot/music/NodeRegistry.test.ts`
- Modify: `bot/.env.example`

**Interfaces:**
- Produces: `LavalinkNodeConfig`, `NodeSnapshot`, `NodeRegistry.update()`, `markUnavailable()`, `setAdministrativeState()`, `selectNode(request)`.

- [ ] **Step 1: Write failing placement tests**

Cover single-node selection, guild affinity, capability exclusion, capacity exclusion, draining exclusion, region preference, weighted-load ordering, and no eligible node returning `MUSIC_NODE_CAPACITY` or `MUSIC_RELAY_OFFLINE` as appropriate.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter bot test -- music/NodeRegistry.test.ts`

Expected: FAIL because `NodeRegistry` is absent.

- [ ] **Step 3: Parse and validate node configuration**

Use Zod to parse `LAVALINK_NODES_JSON` as an array with exact fields `id`, `url`, `password`, `region`, `capabilities`, and `maxPlayers`. Reject public HTTP URLs unless `NODE_ENV=development`; redact passwords from serialization and errors.

- [ ] **Step 4: Implement deterministic placement**

Compute a documented penalty from active/maximum players, Lavalink penalty, CPU, and frame-loss state. Preserve a healthy assigned node. Never assign active or new work to draining/disabled nodes. Break equal scores by stable node ID ordering.

- [ ] **Step 5: Document local defaults**

Add a one-node `LAVALINK_NODES_JSON` example pointing to `http://lavalink:2333`, with the password referenced as an environment-expanded deployment secret rather than a guild setting.

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter bot test -- music/NodeRegistry.test.ts && pnpm --filter bot build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bot/music/NodeRegistry.ts bot/music/node-config.ts bot/music/NodeRegistry.test.ts bot/.env.example
git commit -m "feat(bot): add Lavalink node placement"
```

### Task 4: Guild playback leases and fencing

**Files:**
- Create: `bot/music/GuildPlaybackLease.ts`
- Test: `bot/music/GuildPlaybackLease.test.ts`

**Interfaces:**
- Produces: `GuildPlaybackLease.acquire()`, `renew()`, `release()`, `fenceAndAcquire()`, and `assertOwner()` returning a monotonically increasing fencing token.
- Consumes: existing `RedisClients`; supports an in-process backend only when Redis is absent and the bot has one process.

- [ ] **Step 1: Write failing lease tests with a fake Redis adapter**

Assert exclusive acquisition, renewal by the same owner, rejection of stale tokens, expiry takeover, explicit fencing, and safe single-process fallback.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter bot test -- music/GuildPlaybackLease.test.ts`

Expected: FAIL because the lease class is absent.

- [ ] **Step 3: Implement Redis lease scripts**

Use Lua compare-and-set scripts so acquire/renew/release are atomic. Store `{ ownerId, nodeId, queueRevision, fencingToken }` in the value and use a bounded TTL. A mutation must call `assertOwner` immediately before Lavalink dispatch.

- [ ] **Step 4: Implement single-process fallback**

Use an in-memory map only when Redis is absent and `client.shard` belongs to one process. Reject startup for multi-process/sharded music without Redis rather than permitting split brain.

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter bot test -- music/GuildPlaybackLease.test.ts && pnpm --filter bot build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/music/GuildPlaybackLease.ts bot/music/GuildPlaybackLease.test.ts
git commit -m "feat(bot): fence distributed music players"
```

### Task 5: Shoukaku/Lavalink adapter

**Files:**
- Create: `bot/music/LavalinkAdapter.ts`
- Create: `bot/music/LavalinkEvents.ts`
- Test: `bot/music/LavalinkAdapter.test.ts`

**Interfaces:**
- Produces: `LavalinkAdapter.connect()`, `loadTracks()`, `createOrUpdatePlayer()`, `destroyPlayer()`, `getPlayer()`, `transferPlayer()`, and normalized `MusicPlaybackEvent` events.
- Consumes: Discord client, `NodeRegistry`, Shoukaku `Connectors.DiscordJS`, canonical tracks, and stable music errors.

- [ ] **Step 1: Write failing adapter tests**

Mock the Shoukaku node/player boundary. Assert query prefix selection, empty/no-match translation, playlist normalization, voice-player creation, filter payload mapping, exception translation, URL/password redaction, and normalized track start/end/stuck/exception events.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter bot test -- music/LavalinkAdapter.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Initialize Shoukaku through Discord.js**

Construct one Shoukaku instance with `new Connectors.DiscordJS(client)`, configured nodes, session resuming, bounded reconnect attempts, `moveOnDisconnect: false`, and a custom resolver that delegates to `NodeRegistry`. MODUS, not the client library, decides controlled failover.

- [ ] **Step 4: Implement source loading and normalized events**

Map Lavalink load results into canonical candidates. Convert all library exceptions into `MusicError` without exposing headers, passwords, voice tokens, or signed URLs. Emit node health/statistics updates into `NodeRegistry`.

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter bot test -- music/LavalinkAdapter.test.ts && pnpm --filter bot build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/music/LavalinkAdapter.ts bot/music/LavalinkEvents.ts bot/music/LavalinkAdapter.test.ts
git commit -m "feat(bot): connect MODUS to Lavalink"
```

### Task 6: Durable coordinator and recovery

**Files:**
- Create: `bot/music/LavalinkMusicService.ts`
- Create: `bot/music/MusicRecovery.ts`
- Test: `bot/music/LavalinkMusicService.test.ts`
- Test: `bot/music/MusicRecovery.test.ts`

**Interfaces:**
- Produces: the production `MusicService` implementation.
- Consumes: `MusicRepository`, `NodeRegistry`, `GuildPlaybackLease`, `LavalinkAdapter`, and `EventBus`.

- [ ] **Step 1: Write failing command-flow tests**

Assert validate/commit/lease/dispatch ordering, revision conflicts, idempotent replay, pending state after dispatch failure, bounded source retry, filter persistence, and event-driven checkpoint updates.

- [ ] **Step 2: Write failing recovery tests**

Assert node failure fences the old lease, selects a compatible node, re-resolves the canonical track, restores approximate position/settings, and never creates two players. Assert no healthy node retains the queue and returns `MUSIC_RELAY_OFFLINE`.

- [ ] **Step 3: Verify tests fail**

Run: `pnpm --filter bot test -- music/LavalinkMusicService.test.ts music/MusicRecovery.test.ts`

Expected: FAIL because the service and recovery coordinator are absent.

- [ ] **Step 4: Implement `LavalinkMusicService`**

Every mutation validates `expectedRevision`, persists through `MusicRepository`, acquires/asserts a lease, then dispatches. Publish one normalized state event containing guild ID, queue revision, node ID, operation ID, and stable error code when applicable.

- [ ] **Step 5: Implement bounded checkpointing and recovery**

Checkpoint on track start, pause, seek, filter/volume change, track end, and at a bounded interval while playing. Recovery uses the most recent checkpoint but treats Lavalink voice credentials and encoded tracks as disposable.

- [ ] **Step 6: Run focused and aggregate tests**

Run: `pnpm --filter bot test -- music/LavalinkMusicService.test.ts music/MusicRecovery.test.ts && pnpm --filter bot test && pnpm --filter bot build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bot/music/LavalinkMusicService.ts bot/music/MusicRecovery.ts bot/music/LavalinkMusicService.test.ts bot/music/MusicRecovery.test.ts
git commit -m "feat(bot): coordinate durable Lavalink playback"
```

### Task 7: Wire commands and bot lifecycle to `MusicService`

**Files:**
- Create: `bot/music/index.ts`
- Modify: `bot/index.ts`
- Modify: `bot/modules/music.ts`
- Modify: `bot/modules/recording.ts`
- Test: `bot/music/music-module.test.ts`

**Interfaces:**
- Consumes: production `MusicService` from Task 6.
- Produces: `createMusicService(dependencies)` and music module handlers with no `discord-player` types.

- [ ] **Step 1: Write failing handler tests**

Use a fake `MusicService` to verify `/play`, pause, resume, seek, skip, stop, queue mutation, volume, repeat, filters, dashboard pre-queue loading, nickname events, and recording exclusion. Assert user responses retain current command wording where practical.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter bot test -- music/music-module.test.ts`

Expected: FAIL because handlers still call `useMainPlayer()`.

- [ ] **Step 3: Create and inject the production service**

Initialize music after Discord client, Redis, database, and event bus creation. Pass it to module registration and the HTTP music API. Await `musicService.shutdown()` in the existing graceful shutdown path.

- [ ] **Step 4: Replace direct Discord Player usage**

Remove `GuildQueue`, `QueueRepeatMode`, `useMainPlayer`, player event registration, and direct FFmpeg filter access from `music.ts`. Translate command inputs to domain commands. Change recording checks to `await musicService.isActive(guildId)`.

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter bot test -- music/music-module.test.ts && pnpm --filter bot test && pnpm --filter bot build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/music/index.ts bot/index.ts bot/modules/music.ts bot/modules/recording.ts bot/music/music-module.test.ts
git commit -m "refactor(bot): route music through Lavalink service"
```

### Task 8: Adapt the dashboard control API and realtime state

**Files:**
- Modify: `bot/MusicAPI.ts`
- Modify: `bot/EventBus.ts`
- Modify: `web/server/utils/eventbus.ts`
- Modify: `web/app/composables/useMusicPlayer.ts`
- Test: `bot/music/MusicAPI.test.ts`

**Interfaces:**
- Consumes: `MusicService.getState()`, `getQueue()`, and `execute()`.
- Produces: backward-compatible HTTP responses plus `revision`, `health`, `nodeId`, `requestedSource`, `playbackSource`, and stable `errorCode` fields.

- [ ] **Step 1: Write failing Music API tests**

Verify authentication, guild/action validation, expected revision forwarding, conflict response `409`, unavailable response `503`, idempotency header/body handling, queue snapshots, and secret/error redaction.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter bot test -- music/MusicAPI.test.ts`

Expected: FAIL because the API still calls Discord Player.

- [ ] **Step 3: Replace API queue access**

Inject `MusicService` into `registerMusicAPI`. Preserve existing routes and fields, append new state fields, and accept an operation ID generated by Nitro when absent. Require `expectedRevision` for reorder/remove operations after the composable has loaded a snapshot.

- [ ] **Step 4: Extend realtime events and composable state**

Add one shared music state channel constant to both EventBus files. Update `useMusicPlayer` to store the queue revision, ignore older snapshots, show relay/source health, and send the current revision on mutations.

- [ ] **Step 5: Run bot tests and web verification**

Run: `pnpm --filter bot test -- music/MusicAPI.test.ts && pnpm --filter bot build && pnpm --filter web typecheck && pnpm --filter web build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/MusicAPI.ts bot/EventBus.ts web/server/utils/eventbus.ts web/app/composables/useMusicPlayer.ts bot/music/MusicAPI.test.ts
git commit -m "feat(api): expose durable Lavalink player state"
```

### Task 9: Add the pinned local Lavalink service

**Files:**
- Create: `lavalink/application.yml`
- Modify: `docker-compose.yml`
- Modify: `bot/.env.example`
- Modify: `INSTALLATION.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: private `lavalink:2333` service running Lavalink `4.2.2` with youtube-source `1.18.1`.

- [ ] **Step 1: Create the versioned Lavalink configuration**

Set the server password from `LAVALINK_SERVER_PASSWORD`, disable the built-in YouTube source, install `dev.lavalink.youtube:youtube-plugin:1.18.1`, configure current supported clients without OAuth/PoToken defaults, enable session resuming and Prometheus metrics, and keep sensitive logging off.

- [ ] **Step 2: Add the Compose service**

Use a pinned official Lavalink `4.2.2` image, mount `lavalink/application.yml` read-only, add a health check against `/version` with the authorization header, use `restart: unless-stopped`, attach only to `modus`, and make `bot` depend on Lavalink health. Do not publish port 2333 to the host by default.

- [ ] **Step 3: Document local and remote-node configuration**

Document local Compose defaults, Tailscale-only remote addresses, password generation/rotation, outbound Discord requirements, node capabilities, and the `MUSIC_RELAY_OFFLINE` failure behavior.

- [ ] **Step 4: Add CI configuration validation**

Add `lavalink/**` to the bot change filter. Add a job step that starts the pinned container with the repository configuration, waits for `/version`, prints sanitized logs on failure, and stops the container.

- [ ] **Step 5: Verify Compose and configuration**

Run: `docker compose config`

Run: `docker compose up -d lavalink && docker compose ps lavalink`

Expected: configuration renders successfully and Lavalink becomes healthy. Then run `docker compose stop lavalink`; this preserves volumes and does not disturb unrelated services.

- [ ] **Step 6: Commit**

```bash
git add lavalink/application.yml docker-compose.yml bot/.env.example INSTALLATION.md .github/workflows/ci.yml
git commit -m "feat(bot): bundle upstream Lavalink service"
```

### Task 10: Observability, cutover, and embedded-engine removal

**Files:**
- Create: `bot/music/MusicMetrics.ts`
- Modify: `bot/ServerStatusService.ts`
- Modify: `bot/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `bot/index.ts`
- Delete: `bot/lib/ytdlp-stream.ts`
- Modify: `bot/Dockerfile`
- Modify: `THIRD_PARTY_LICENSES.md`
- Test: `bot/music/cutover.test.ts`

**Interfaces:**
- Produces: music health in bot status and structured metrics keyed by guild, shard, node, revision, operation, source, and stable error code.

- [ ] **Step 1: Write failing cutover tests**

Assert bot startup fails fast on malformed node configuration, starts with a healthy node, exposes degraded music health without failing global health when all nodes are down, and contains no embedded playback fallback.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter bot test -- music/cutover.test.ts`

Expected: FAIL until health and cutover behavior exist.

- [ ] **Step 3: Add metrics and health reporting**

Record command-to-audio latency, resolution latency/failures, active players, recovery attempts/gaps, queue conflicts, lease fencing, frame loss, and node load. Expose an aggregate music status of `healthy`, `degraded`, or `unavailable` without changing the bot's global health to failed solely because music is unavailable.

- [ ] **Step 4: Remove embedded playback dependencies and code**

Remove `discord-player`, `discord-player-youtubei`, `@discord-player/extractor`, `youtube-dl-exec`, `youtubei.js`, bot-local FFmpeg playback initialization, the YouTube log override, and `ytdlp-stream.ts`. Retain `@discordjs/voice` only if recording/TTS still imports it. Remove yt-dlp installation from `bot/Dockerfile`; retain FFmpeg only if recording/TTS still requires it.

- [ ] **Step 5: Regenerate licenses and run full verification**

Run: `pnpm install --no-frozen-lockfile && pnpm run licenses:generate`

Run: `pnpm --filter @modus/db build && pnpm --filter bot test && pnpm --filter bot build && pnpm --filter web typecheck && pnpm --filter web build && docker compose config`

Expected: all commands PASS; `rg -n "discord-player|discord-player-youtubei|ytdlp-stream|youtube-dl-exec" bot package.json pnpm-lock.yaml` finds no live bot dependency or import.

- [ ] **Step 6: Perform controlled resilience checks**

With a test Discord guild, verify play, queue, filters, pause/resume, seek, repeat, dashboard control, nickname restoration, and recording exclusion. Stop Lavalink during playback and confirm the bot reports music unavailable while other commands remain healthy; with a second test node configured, confirm one fenced recovery and no duplicate audio.

- [ ] **Step 7: Commit**

```bash
git add bot/music/MusicMetrics.ts bot/ServerStatusService.ts bot/package.json pnpm-lock.yaml bot/index.ts bot/Dockerfile THIRD_PARTY_LICENSES.md bot/music/cutover.test.ts
git add -u -- bot/lib/ytdlp-stream.ts
git commit -m "refactor(bot): complete Lavalink music cutover"
```

## Execution Notes

- Review after every task; do not batch all ten commits into one change.
- Task 9 requires Docker and network access to pull the pinned upstream image and plugin.
- Task 10's live Discord resilience checks require a test guild and bot credentials; automated tests must still pass without those credentials.
- Apply the generated database migration to a disposable Postgres instance before any hosted rollout.
- Roll out hosted guilds in batches only after local feature parity and single-node failure behavior are verified.
