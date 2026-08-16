import type {
  DurableMusicQueueSnapshot,
  MusicCheckpointInput,
  MusicRepository,
} from "@modus/db";
import { CHANNEL_MUSIC_STATE } from "../EventBus";
import { MusicError } from "./errors";
import {
  GuildPlaybackLeaseOwnershipError,
  type GuildPlaybackLease,
} from "./GuildPlaybackLease";
import type {
  LavalinkAdapter,
  LavalinkLoadResult,
  LavalinkPlayerSnapshot,
  LavalinkSearchSource,
} from "./LavalinkAdapter";
import type { NodeRegistry } from "./NodeRegistry";
import { scoreTrackMatch } from "./track-matching";
import type {
  CanonicalTrack,
  MusicQueueSnapshot,
  MusicResult,
} from "./types";

// The channel itself is declared with every other realtime channel in
// bot/EventBus.ts (kept in sync with web/server/utils/eventbus.ts) and
// re-exported here so music callers keep importing it from the music package.
export { CHANNEL_MUSIC_STATE };

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 100;
const MIN_MATCH_SCORE = 0.85;

type RecoveryRepository = Pick<
  MusicRepository,
  "readSnapshot" | "checkpoint" | "recordNodeAssignment"
>;

type RecoveryLease = Pick<
  GuildPlaybackLease,
  "fenceAndAcquire" | "renew" | "assertOwner"
>;

type RecoveryAdapter = Pick<
  LavalinkAdapter,
  "loadTracks" | "getPlayer" | "transferPlayer" | "createOrUpdatePlayer"
>;

interface MusicEventPublisher {
  publish(channel: string, payload: MusicStateEvent): Promise<void>;
}

export interface MusicStateEvent {
  guildId: string;
  queueRevision: number;
  nodeId: string | null;
  operationId: string;
  errorCode?: MusicError["code"];
  status?: "idle" | "connecting" | "playing" | "paused" | "unavailable";
  currentEntryId?: string | null;
  positionMs?: number;
}

export interface MusicRecoveryOptions {
  repository: RecoveryRepository;
  nodeRegistry: NodeRegistry;
  lease: RecoveryLease;
  adapter: RecoveryAdapter;
  eventBus: MusicEventPublisher;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface RecoverGuildInput {
  guildId: string;
  /** The node that owned the session before recovery started. */
  failedNodeId: string;
  /**
   * False when the previous owner node is not known to be unhealthy — a
   * startup restore reuses the node it just connected to, so marking it
   * unavailable would disable placement for the whole process.
   */
  markNodeFailed?: boolean;
  voiceChannelId?: string;
  shardId?: number;
  paused?: boolean;
  operationId?: string;
}

export interface MusicRecoveryOutcome {
  queue: MusicQueueSnapshot;
  nodeId: string | null;
  fencingToken: number | null;
  trackIdentifier: string | null;
}

/**
 * Rebuilds a guild player from durable canonical state after a node failure.
 * Lavalink encodings and Discord voice credentials remain transport-only.
 */
export class MusicRecovery {
  private readonly repository: RecoveryRepository;
  private readonly nodeRegistry: NodeRegistry;
  private readonly lease: RecoveryLease;
  private readonly adapter: RecoveryAdapter;
  private readonly eventBus: MusicEventPublisher;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly inFlight = new Map<string, Promise<MusicResult<MusicRecoveryOutcome>>>();

  constructor(options: MusicRecoveryOptions) {
    this.repository = options.repository;
    this.nodeRegistry = options.nodeRegistry;
    this.lease = options.lease;
    this.adapter = options.adapter;
    this.eventBus = options.eventBus;
    this.maxAttempts = positiveInteger(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, "maxAttempts");
    this.retryDelayMs = nonNegativeInteger(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, "retryDelayMs");
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  recoverGuild(input: RecoverGuildInput): Promise<MusicResult<MusicRecoveryOutcome>> {
    validateRecoveryInput(input);
    const existing = this.inFlight.get(input.guildId);
    if (existing) return existing;

    const recovery = this.performRecovery(input).finally(() => {
      if (this.inFlight.get(input.guildId) === recovery) this.inFlight.delete(input.guildId);
    });
    this.inFlight.set(input.guildId, recovery);
    return recovery;
  }

  private async performRecovery(input: RecoverGuildInput): Promise<MusicResult<MusicRecoveryOutcome>> {
    const operationId = input.operationId ?? `recover:${input.failedNodeId}`;
    let queueRevision = 0;
    let selectedNodeId: string | null = null;

    try {
      if (input.markNodeFailed !== false) this.markFailedNodeUnavailable(input.failedNodeId);
      const durable = await this.repository.readSnapshot(input.guildId);
      queueRevision = durable.revision;
      const queue = toQueueSnapshot(durable);
      const current = currentEntry(durable);

      if (!current) {
        const outcome: MusicRecoveryOutcome = {
          queue,
          nodeId: null,
          fencingToken: null,
          trackIdentifier: null,
        };
        await this.publish({
          guildId: input.guildId,
          queueRevision,
          nodeId: null,
          operationId,
          status: "idle",
          currentEntryId: null,
          positionMs: 0,
        });
        return { ok: true, value: outcome };
      }

      const currentPlayer = this.adapter.getPlayer(input.guildId);
      if (currentPlayer && currentPlayer.nodeId !== input.failedNodeId) {
        const outcome: MusicRecoveryOutcome = {
          queue,
          nodeId: currentPlayer.nodeId,
          fencingToken: null,
          trackIdentifier: current.track.playbackSource?.identifier ?? null,
        };
        await this.publish({
          guildId: input.guildId,
          queueRevision,
          nodeId: currentPlayer.nodeId,
          operationId,
          status: currentPlayer.paused ? "paused" : "playing",
          currentEntryId: current.id,
          positionMs: currentPlayer.positionMs,
        });
        return { ok: true, value: outcome };
      }

      const fencingToken = await this.lease.fenceAndAcquire(
        input.guildId,
        input.failedNodeId,
        durable.revision,
      );

      const source = recoverySource(current.track);
      if (!source) {
        return await this.failure(
          input,
          operationId,
          queueRevision,
          null,
          new MusicError("MUSIC_SOURCE_UNAVAILABLE", "The canonical track source is not supported."),
        );
      }

      const failedNode = safeNodeSnapshot(this.nodeRegistry, input.failedNodeId);
      const selected = this.nodeRegistry.selectNode({
        guildId: input.guildId,
        assignedNodeId: null,
        region: failedNode?.region,
        capabilities: [source],
      });
      if (!selected.ok) {
        return await this.failure(input, operationId, queueRevision, null, selected.error);
      }
      selectedNodeId = selected.value.id;
      await this.lease.renew(input.guildId, fencingToken, selectedNodeId, durable.revision);
      await this.repository.recordNodeAssignment({ guildId: input.guildId, nodeId: selectedNodeId });

      const resolved = await this.retryTransient(() => this.adapter.loadTracks({
        guildId: input.guildId,
        input: current.track.requestedInput,
        requestedBy: current.track.requestedBy,
        requestType: current.track.requestType,
        source,
        nodeId: selectedNodeId!,
        region: selected.value.region,
      }));
      if (!resolved.ok) {
        return await this.failure(input, operationId, queueRevision, selectedNodeId, resolved.error);
      }
      await this.assertCurrentRevision(input.guildId, durable.revision, current.id);

      const candidate = selectCandidate(current.track, resolved.value);
      if (!candidate) {
        return await this.failure(
          input,
          operationId,
          queueRevision,
          selectedNodeId,
          new MusicError("MUSIC_NO_MATCH", "The canonical track could not be re-resolved."),
        );
      }

      if (currentPlayer) {
        const transferred = await this.retryTransient(async () => {
          await this.assertCurrentRevision(input.guildId, durable.revision, current.id);
          await this.lease.assertOwner(input.guildId, fencingToken);
          return this.adapter.transferPlayer(input.guildId, selectedNodeId!);
        });
        if (!transferred.ok) {
          return await this.failure(input, operationId, queueRevision, selectedNodeId, transferred.error);
        }
      } else if (!input.voiceChannelId || input.shardId === undefined) {
        return await this.failure(
          input,
          operationId,
          queueRevision,
          selectedNodeId,
          new MusicError("MUSIC_VOICE_FAILED", "Recovery requires the guild voice channel and shard."),
        );
      }

      const positionMs = recoverablePosition(durable.checkpointPositionMs, current.track.durationMs);
      const restored = await this.retryTransient(async () => {
        await this.assertCurrentRevision(input.guildId, durable.revision, current.id);
        await this.lease.assertOwner(input.guildId, fencingToken);
        const playerForAttempt = this.adapter.getPlayer(input.guildId);
        return this.adapter.createOrUpdatePlayer({
          guildId: input.guildId,
          nodeId: selectedNodeId!,
          ...(!playerForAttempt ? { voiceChannelId: input.voiceChannelId, shardId: input.shardId } : {}),
          ephemeralEncodedTrack: candidate.ephemeralEncodedTrack,
          positionMs,
          volume: durable.volume,
          paused: input.paused ?? false,
          filters: durable.filters,
        });
      });
      if (!restored.ok) {
        return await this.failure(input, operationId, queueRevision, selectedNodeId, restored.error);
      }

      const checkpoint: MusicCheckpointInput = {
        guildId: input.guildId,
        expectedRevision: durable.revision,
        currentEntryId: current.id,
        positionMs: restored.value.positionMs,
        volume: durable.volume,
        repeatMode: durable.repeatMode,
        filters: durable.filters,
      };
      const checkpointed = await this.repository.checkpoint(checkpoint);
      if (!checkpointed) {
        return await this.failure(
          input,
          operationId,
          queueRevision,
          selectedNodeId,
          new MusicError("MUSIC_CONFLICT", "The music queue changed before recovery could checkpoint."),
        );
      }

      const outcome: MusicRecoveryOutcome = {
        queue,
        nodeId: selectedNodeId,
        fencingToken,
        trackIdentifier: candidate.track.playbackSource?.identifier
          ?? current.track.playbackSource?.identifier
          ?? null,
      };
      await this.publish({
        guildId: input.guildId,
        queueRevision,
        nodeId: selectedNodeId,
        operationId,
        status: restored.value.paused ? "paused" : "playing",
        currentEntryId: current.id,
        positionMs: restored.value.positionMs,
      });
      return { ok: true, value: outcome };
    } catch (error) {
      return this.failure(
        input,
        operationId,
        queueRevision,
        selectedNodeId,
        normalizeRecoveryError(error),
      );
    }
  }

  private async retryTransient<T>(operation: () => Promise<MusicResult<T>>): Promise<MusicResult<T>> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const result = await operation();
      if (result.ok || !isTransientBoundaryError(result.error)) return result;
      if (attempt === this.maxAttempts) {
        return {
          ok: false,
          error: new MusicError(
            "MUSIC_RETRY_EXHAUSTED",
            "The transient music operation exhausted its retry limit.",
          ),
        };
      }
      if (this.retryDelayMs > 0) await this.sleep(this.retryDelayMs);
    }
    throw new Error("Unreachable music retry state.");
  }

  private async assertCurrentRevision(
    guildId: string,
    expectedRevision: number,
    currentEntryId: string,
  ): Promise<void> {
    const latest = await this.repository.readSnapshot(guildId);
    if (latest.revision !== expectedRevision || latest.currentEntryId !== currentEntryId) {
      throw new MusicError("MUSIC_CONFLICT", "The music queue changed during recovery.");
    }
  }

  private async failure(
    input: RecoverGuildInput,
    operationId: string,
    queueRevision: number,
    nodeId: string | null,
    error: MusicError,
  ): Promise<MusicResult<never>> {
    await this.publish({
      guildId: input.guildId,
      queueRevision,
      nodeId,
      operationId,
      errorCode: error.code,
      status: "unavailable",
    });
    return { ok: false, error };
  }

  private async publish(event: MusicStateEvent): Promise<void> {
    try {
      await this.eventBus.publish(CHANNEL_MUSIC_STATE, event);
    } catch {
      // Realtime fan-out is observational and must not replay a player mutation.
    }
  }

  private markFailedNodeUnavailable(nodeId: string): void {
    try {
      this.nodeRegistry.markUnavailable(nodeId);
    } catch {
      // A removed deployment node has no placement eligibility to update.
    }
  }
}

function validateRecoveryInput(input: RecoverGuildInput): void {
  if (!input.guildId.trim()) throw new Error("Recovery guildId must not be empty.");
  if (!input.failedNodeId.trim()) throw new Error("Recovery failedNodeId must not be empty.");
  if (input.voiceChannelId !== undefined && !input.voiceChannelId.trim()) {
    throw new Error("Recovery voiceChannelId must not be empty.");
  }
  if (input.shardId !== undefined && (!Number.isSafeInteger(input.shardId) || input.shardId < 0)) {
    throw new Error("Recovery shardId must be a non-negative integer.");
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function safeNodeSnapshot(registry: NodeRegistry, nodeId: string) {
  try {
    return registry.snapshot(nodeId);
  } catch {
    return null;
  }
}

function recoverySource(track: CanonicalTrack): LavalinkSearchSource | null {
  return toSearchSource(track.playbackSource?.name) ?? toSearchSource(track.requestedSource.name);
}

function toSearchSource(value: string | undefined): LavalinkSearchSource | null {
  return value === "youtube" || value === "youtube-music" || value === "soundcloud" ? value : null;
}

/**
 * The entry recovery may resurrect. A checkpointed current entry that has
 * already finished (or failed) must never be re-dispatched, so only entries
 * that were mid-flight when the owner stopped are eligible.
 */
function currentEntry(snapshot: DurableMusicQueueSnapshot) {
  if (!snapshot.currentEntryId) return null;
  const entry = snapshot.entries.find((candidate) => candidate.id === snapshot.currentEntryId) ?? null;
  if (!entry) return null;
  return entry.status === "playing" || entry.status === "ready" ? entry : null;
}

function selectCandidate(requested: CanonicalTrack, result: LavalinkLoadResult) {
  return result.candidates
    .map((candidate) => ({ candidate, score: scoreTrackMatch(requested, candidate.track) }))
    .filter(({ score }) => score >= MIN_MATCH_SCORE)
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;
}

function recoverablePosition(positionMs: number, durationMs: number | undefined): number {
  const position = Math.max(0, Math.trunc(positionMs));
  if (durationMs === undefined || durationMs <= 0) return position;
  return Math.min(position, Math.max(0, Math.trunc(durationMs) - 1));
}

function toQueueSnapshot(snapshot: DurableMusicQueueSnapshot): MusicQueueSnapshot {
  return {
    guildId: snapshot.guildId,
    revision: snapshot.revision,
    entries: snapshot.entries.map((entry) => ({
      id: entry.id,
      track: entry.track,
      position: entry.position,
      status: entry.status,
    })),
    currentEntryId: snapshot.currentEntryId,
    repeatMode: snapshot.repeatMode,
    autoplay: snapshot.autoplay ?? false,
    volume: snapshot.volume,
    filters: snapshot.filters,
  };
}

function normalizeRecoveryError(error: unknown): MusicError {
  if (error instanceof MusicError) return error;
  if (error instanceof GuildPlaybackLeaseOwnershipError) {
    return new MusicError("MUSIC_CONFLICT", "Playback ownership changed during recovery.");
  }
  return new MusicError("MUSIC_RELAY_OFFLINE", "The music player could not be recovered.", {
    retryable: true,
  });
}

function isTransientBoundaryError(error: MusicError): boolean {
  return error.retryable && (
    error.code === "MUSIC_SOURCE_UNAVAILABLE"
    || error.code === "MUSIC_RELAY_OFFLINE"
    || error.code === "MUSIC_VOICE_FAILED"
  );
}
