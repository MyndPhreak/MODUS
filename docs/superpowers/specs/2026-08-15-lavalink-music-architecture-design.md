# Lavalink Music Architecture Design

**Date:** 2026-08-15
**Status:** Approved in conversation; awaiting written-spec review

## Summary

Replace MODUS's embedded `discord-player` playback engine with upstream Lavalink v4. MODUS remains the music control plane: it owns commands, authorization, canonical track metadata, durable queues, node placement, dashboard state, and recovery policy. Lavalink becomes the audio plane: it owns source resolution, decoding, filters, active players, and direct Discord voice transport.

The same architecture serves local and hosted installations. Local Docker Compose includes one Lavalink node with minimal coordination. Hosted deployments may add capability-aware and regional node pools without changing the music command or dashboard interfaces.

This design does not include deployment of the Nuxt dashboard, bot, database, or Redis. It covers only the music subsystem and its required persistence and coordination interfaces.

## Goals

- Use a mature, actively maintained audio engine with Discord DAVE support.
- Remove audio extraction, FFmpeg processing, and Discord voice transport from bot shard processes.
- Preserve the existing music commands and dashboard experience.
- Support local installations through a one-command Compose deployment.
- Scale horizontally to many bot shards, guilds, and Lavalink nodes.
- Isolate source-specific failures behind stable MODUS interfaces and errors.
- Recover queue state after bot or audio-node restarts without duplicate players.
- Make additional playback sources replaceable and independently configurable.

## Non-goals

- Guarantee uninterrupted audio during node failure. Recovery may produce a brief gap.
- Guarantee availability of any unofficial third-party extractor.
- Implement IP rotation, residential proxy rotation, or platform-enforcement evasion.
- Maintain embedded and Lavalink playback engines indefinitely.
- Redesign the music commands or dashboard UI.
- Select production hosting locations for the bot, dashboard, Postgres, Redis, or audio fleet.

## Current State

The bot currently creates a `discord-player` `Player` in `bot/index.ts`. It registers the default extractors, `discord-player-youtubei`, and a Spotify extractor. `bot/lib/ytdlp-stream.ts` shells out to `yt-dlp` to resolve direct YouTube media URLs; Discord Player then uses its FFmpeg pipeline and owns the Discord voice connection.

`bot/modules/music.ts` and `bot/MusicAPI.ts` access `discord-player` queues directly. Active queues are process-local. The dashboard pre-queue is persisted in music settings, but active playback state is not a durable, engine-neutral model. This couples commands, dashboard controls, playback, extraction, and voice lifecycle to one bot process.

## Selected Approach

Use an unmodified upstream Lavalink v4 release as the initial audio engine. Configure maintained plugins, beginning with `lavalink-devs/youtube-source`, rather than embedding extractor libraries in MODUS. Do not begin with a MODUS-specific Lavalink fork. A fork is justified only if a concrete requirement cannot be implemented through Lavalink's protocol or plugin API.

MODUS communicates with Lavalink through an internal `MusicService` boundary. The chosen TypeScript Lavalink client remains an implementation detail behind that boundary and will be selected during implementation planning based on DAVE support, session resumption, maintenance activity, and testability.

## Component Ownership

### MODUS music control plane

MODUS owns:

- Command and dashboard request validation.
- Guild settings, DJ roles, queue limits, and recording/music exclusion.
- Canonical track metadata and source provenance.
- Durable queue mutations and monotonically increasing queue revisions.
- Guild-to-node placement, affinity, leases, and failover decisions.
- User-facing error translation and retry policy.
- Dashboard snapshots and realtime event publication.
- Nickname changes, audit logging, and other MODUS-specific behavior.

### Lavalink audio plane

Lavalink owns:

- Source search and track loading through configured plugins.
- Active player sessions and ephemeral playback position.
- Audio decoding, transcoding, volume, and filters.
- Discord voice WebSocket, UDP, Opus, and DAVE handling.
- Playback events, node statistics, frame-loss metrics, and session resumption.

### Persistence and coordination

Postgres is the durable source of truth for recoverable music state. Redis coordinates live ownership, low-latency state, and dashboard fan-out. Lavalink state is authoritative only for the currently active audio session.

Durable state includes:

- Ordered canonical queue entries and queue revision.
- Current track identity and last checkpointed position.
- Requester, repeat mode, volume, filters, and guild playback settings.
- Node assignment history needed for diagnostics.

Ephemeral state includes:

- Discord voice credentials and encryption/session keys.
- Decoder buffers and live sockets.
- High-frequency playback position between checkpoints.
- Lavalink-encoded tracks and direct media URLs.

Encoded tracks must not be treated as permanent because plugin or protocol upgrades may invalidate them. MODUS re-resolves canonical tracks when necessary.

## Music Service Interface

Commands, HTTP routes, dashboard integration, and recording checks must depend on an engine-neutral `MusicService`, not a Lavalink client or `discord-player` types.

The interface covers:

- `play`, `enqueue`, and batch enqueue.
- `pause`, `resume`, `seek`, `skip`, and `stop`.
- Queue read, remove, reorder, clear, and shuffle.
- Volume, repeat mode, and filter changes.
- Guild player state and health.
- Player events such as start, end, exception, stuck, disconnect, and queue completion.

Mutating operations carry an idempotency key and expected queue revision. This prevents duplicate dashboard or interaction retries from applying the same mutation twice and prevents stale writers from silently overwriting newer queue state.

## Request and Playback Flow

1. A Discord interaction or dashboard route sends a request to `MusicService`.
2. MODUS validates the actor, guild, voice channel, module settings, DJ policy, and queue capacity.
3. The request is resolved into a canonical track and one or more source candidates.
4. MODUS commits the queue mutation and new revision to Postgres.
5. The node registry returns the guild's healthy assigned node or selects a new compatible node.
6. The Lavalink adapter creates or updates the player on that node.
7. Lavalink events update the durable checkpoint, Redis live state, audit log, nickname behavior, and dashboard event stream.

Postgres commit precedes dispatch. If dispatch fails, the queue entry remains durable and is marked pending or failed rather than disappearing. Reconciliation retries only failures classified as transient.

## Track Identity and Source Matching

A canonical track records:

- Original user input and request type.
- Title, artists, album, duration, and artwork.
- Requester and request timestamp.
- Original source name, URI, and source identifier.
- ISRC or another stable catalog identifier when available.
- Resolved playback source and match confidence when different from the request source.

Direct playable URLs retain priority. Metadata-oriented links may be matched against enabled searchable playback sources. Automatic substitution requires a high-confidence match based on normalized title, primary artist, duration tolerance, and stable identifiers when available. Low-confidence results are rejected or returned as user choices; MODUS must not silently play a merely similar track.

The UI exposes both the requested source and actual playback source when they differ.

## Node Registry and Placement

Each configured Lavalink node has:

- Stable node ID and region.
- Supported source capabilities.
- Administrative state: active, draining, or disabled.
- Connection and health state.
- Configured player limit.
- Reported player count, CPU load, memory pressure, frame loss, and penalty metrics.

Placement rules are:

1. Retain guild affinity while the assigned node is healthy.
2. For a new player, exclude nodes without the required source capability or available capacity.
3. Prefer a node near the Discord voice region when that information is available.
4. Choose the lowest weighted load among eligible nodes.
5. Do not move an active player solely to rebalance capacity.
6. A draining node receives no new players; its existing players finish or move only during controlled maintenance.

For a single-node local deployment, selection deterministically returns that node and does not require multi-node operational configuration.

## Guild Ownership and Duplicate Prevention

Redis stores a renewable guild playback lease containing the guild ID, owning bot shard/process, Lavalink node ID, queue revision, and expiry. Only the lease holder may issue player mutations for that guild.

Lease acquisition and reassignment use compare-and-set semantics. A replacement owner must fence the previous lease before creating a replacement player. The queue revision is checked again before restore. This prevents two bot processes or Lavalink nodes from playing simultaneously after a partition or restart.

Redis loss does not delete the durable queue. Playback mutations pause until ownership can be re-established safely. A single-process installation without Redis uses an in-process lease because only one bot process can own the guild.

## Failure and Recovery

### Lavalink node failure

1. Detect WebSocket loss, failed health checks, or a fatal node event.
2. Mark the node unavailable and stop routing new commands to it.
3. Fence affected guild leases.
4. Select another compatible node when available.
5. Re-resolve the canonical current track.
6. Restore volume, filters, repeat mode, queue, and the latest checkpointed position.
7. Resume after a brief gap and publish a recovery event.

If no compatible node is healthy, retain the durable queue and return a temporary music-unavailable response. No request falls back to embedded playback.

### Bot shard failure

Another eligible shard or restarted process reacquires expired guild leases, reads the durable state, discovers or recreates the Lavalink player, and resumes event handling. Lavalink session resumption should be used when supported, but correctness must not depend on successful protocol resumption.

### Source failure

Transient resolution or transport errors receive one bounded retry. MODUS may then try another configured compatible source with a high-confidence match. Authentication failures, blocking responses, and no-match results do not loop.

### Stable errors

Provider and client exceptions map to stable MODUS codes:

- `MUSIC_NO_MATCH`
- `MUSIC_SOURCE_UNAVAILABLE`
- `MUSIC_NODE_CAPACITY`
- `MUSIC_VOICE_FAILED`
- `MUSIC_RELAY_OFFLINE`
- `MUSIC_RETRY_EXHAUSTED`
- `MUSIC_CONFLICT`

Commands and dashboard APIs use these codes to provide consistent user messages and retry guidance.

## Networking and Security

- Lavalink is never intentionally exposed to the public Internet.
- Local services communicate over the private Docker network.
- Cross-host services communicate over Tailscale or another explicitly configured private network.
- Every Lavalink node uses a unique strong password stored in runtime secrets.
- MODUS validates configured node addresses and never accepts arbitrary node URLs from guild settings or user input.
- Logs redact node credentials, media URLs, source credentials, and Discord voice tokens.
- Health and metrics endpoints are limited to the private network and monitoring principals.
- Node credentials can rotate by adding a replacement connection, draining the old connection, and then revoking the old secret.

## Local Deployment

The root Compose configuration adds one upstream Lavalink v4 service and its versioned configuration. `docker compose up -d` starts the bot, web dashboard, Postgres, Redis, and Lavalink. The bot connects using the Compose service name and an environment-provided password.

Local deployments do not need to understand leases, regions, or weighted placement. Defaults create one node named `local`, use the local Docker network, and select it for every guild. Advanced operators may configure additional nodes through environment or deployment configuration, not through guild settings.

## Hosted Scaling

The first hosted topology may use one Unraid Lavalink node reached over Tailscale. Additional nodes join the registry with explicit capabilities and capacity. Larger deployments form regional pools, but all nodes implement the same Lavalink contract.

Capacity planning is based on measured concurrent players, CPU, memory, network throughput, frame loss, and source behavior—not total guild count. Operational limits prevent any node or source adapter from accepting more work than configured.

At large scale, a single home node is neither a reliability boundary nor a sufficient source strategy. The architecture permits multiple nodes, but it does not prescribe or implement techniques intended to evade third-party platform enforcement.

## Observability

Expose and aggregate:

- Node connection state and administrative state.
- Active and connecting players per node.
- Node CPU, memory, uptime, frame loss, and Lavalink penalty.
- Resolution latency and failures by source and stable error code.
- Command-to-audio-start latency.
- Player recovery attempts, success rate, and recovery gap.
- Queue revision conflicts and idempotent replay counts.
- Guild lease acquisitions, expirations, and fenced owners.

Structured logs include guild ID, shard ID, node ID, queue revision, operation ID, source, and error code where applicable. They never include secrets or transient signed media URLs.

## Migration

Migration proceeds in dependency order:

1. Define engine-neutral music domain types, errors, and `MusicService`.
2. Adapt commands, `MusicAPI`, dashboard state, nickname updates, and recording exclusion to the interface while retaining current behavior.
3. Add durable queue schema, repository methods, queue revisions, checkpoints, and idempotency records.
4. Add the Redis-backed node registry and guild lease manager with single-process fallbacks.
5. Add the Lavalink adapter and local Compose service.
6. Achieve command, dashboard, filter, and recovery parity in local and test deployments.
7. Enable Lavalink for controlled hosted guild batches and compare errors and playback metrics.
8. Make Lavalink the default after the acceptance criteria pass.
9. Remove the temporary embedded adapter, `discord-player`, `discord-player-youtubei`, the custom yt-dlp bridge, and bot-local audio processing.

The temporary embedded adapter exists only for rollout comparison and rollback during migration. It is removed in the same overall program once Lavalink is accepted; MODUS does not retain two permanent music engines.

## Verification

### Unit tests

- Canonical track normalization and confidence scoring.
- Queue mutation ordering, expected revisions, and idempotent replay.
- Node capability filtering, scoring, affinity, and draining.
- Lease acquisition, renewal, expiry, fencing, and reassignment.
- Provider exception translation into stable MODUS errors.
- Recovery state construction from durable checkpoints.

### Integration tests

- Start a disposable Lavalink container and exercise load, play, pause, seek, filter, stop, and event flows.
- Verify dashboard actions and Discord commands produce equivalent `MusicService` mutations.
- Restart the bot while Lavalink remains alive and verify ownership recovery.
- Restart Lavalink during playback and verify fencing and restore on a healthy replacement node.
- Stop Redis and verify safe degradation without duplicate players.
- Stop Postgres and verify mutations fail closed rather than producing untracked playback state.

### Voice and feature parity

- DAVE connection and sustained playback.
- Queue, skip, pause, resume, seek, stop, shuffle, and repeat modes.
- Volume and every supported saved filter.
- Spotify metadata request matched to the intended playable track.
- Dashboard state, pre-queue loading, and realtime updates.
- Bot nickname updates and restoration.
- Music/recording mutual exclusion.

### Load and resilience

- Simulate many guild sessions and queue mutations without requiring matching live Discord guilds for every control-plane test.
- Measure node selection distribution, Redis contention, Postgres write rate, and event fan-out.
- Run controlled live-voice tests at increasing concurrency before raising node capacity.
- Validate that configured capacity limits reject or queue new sessions cleanly.

## Acceptance Criteria

- Local installation starts a working Lavalink-backed music system through root Docker Compose.
- Existing music commands and dashboard controls retain functional parity.
- Audio extraction, FFmpeg, and Discord music voice transport no longer run in bot shard processes.
- A Lavalink outage cannot crash or disable non-music bot functionality.
- No healthy guild has more than one active player after failover testing.
- Durable queues survive bot and Lavalink restarts.
- A second node can be added and selected without changing command or dashboard code.
- Stable error codes and health state are visible to both Discord commands and dashboard APIs.
- Embedded playback dependencies and temporary migration code are removed after rollout acceptance.

## Risks and Mitigations

- **Unofficial source breakage:** isolate sources as plugins, use stable MODUS errors, monitor failure rates, and avoid making provider exceptions part of public interfaces.
- **Migration regression:** preserve UX, use a temporary interface-compatible adapter, and roll out in controlled guild batches.
- **Split-brain playback:** use renewable leases, fencing, queue revisions, and idempotency keys.
- **Database write amplification:** checkpoint position at bounded intervals and on meaningful player transitions, not every playback event.
- **Redis outage:** fail closed for distributed mutations and retain durable state in Postgres.
- **Lavalink client abandonment:** keep the client behind `MusicService` and test against the Lavalink protocol boundary.
- **Operational complexity for local users:** ship one versioned Compose service with safe defaults and no mandatory cluster configuration.

## Deferred Decisions

The following implementation choices are deliberately deferred to the implementation plan because they do not alter the approved architecture:

- The TypeScript Lavalink client library.
- Exact Postgres table and column names.
- Concrete Redis key names and lease durations.
- Node scoring weights and checkpoint interval defaults.
- Exact initial plugin versions, pinned at implementation time.

Each choice must satisfy the interfaces, ownership rules, failure semantics, and acceptance criteria in this design.
