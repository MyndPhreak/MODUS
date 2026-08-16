import { randomUUID } from "node:crypto";
import type {
  DurableMusicQueueSnapshot,
  MusicApplyMutationInput,
  MusicCheckpointInput,
  MusicRepository,
} from "@modus/db";
import {
  MusicQueueMutationError,
  MusicRevisionConflictError,
} from "@modus/db";
import { MusicError, type MusicErrorCode } from "./errors";
import {
  GuildPlaybackLeaseOwnershipError,
  type GuildPlaybackLease,
} from "./GuildPlaybackLease";
import type {
  LavalinkAdapter,
  LavalinkLoadResult,
  LavalinkPlayerSnapshot,
  LavalinkPlayerUpdate,
  LavalinkSearchSource,
} from "./LavalinkAdapter";
import type { MusicPlaybackEvent, MusicPlaybackTrack } from "./LavalinkEvents";
import type { MusicService } from "./MusicService";
import {
  CHANNEL_MUSIC_STATE,
  MusicRecovery,
  type MusicRecoveryOutcome,
  type MusicStateEvent,
  type RecoverGuildInput,
} from "./MusicRecovery";
import type { NodeRegistry } from "./NodeRegistry";
import { scoreTrackMatch } from "./track-matching";
import type {
  CanonicalTrack,
  LyricsData,
  MusicCommand,
  MusicPlayerState,
  MusicQueueSnapshot,
  MusicResult,
} from "./types";

const DEFAULT_CHECKPOINT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 100;
const MIN_MATCH_SCORE = 0.85;

type CoordinatorRepository = Pick<
  MusicRepository,
  "readSnapshot" | "applyMutation" | "applyCheckpointOperation" | "checkpoint" | "recordNodeAssignment"
>;

type CoordinatorLease = Pick<
  GuildPlaybackLease,
  "acquire" | "renew" | "release" | "assertOwner" | "fenceAndAcquire"
>;

interface CoordinatorAdapter {
  on(eventName: "playback", listener: (event: MusicPlaybackEvent) => void): unknown;
  off(eventName: "playback", listener: (event: MusicPlaybackEvent) => void): unknown;
  loadTracks: LavalinkAdapter["loadTracks"];
  createOrUpdatePlayer: LavalinkAdapter["createOrUpdatePlayer"];
  getPlayer: LavalinkAdapter["getPlayer"];
  destroyPlayer: LavalinkAdapter["destroyPlayer"];
  transferPlayer: LavalinkAdapter["transferPlayer"];
}

interface MusicEventPublisher {
  publish(channel: string, payload: MusicStateEvent): Promise<void>;
}

interface RecoveryCoordinator {
  recoverGuild(input: RecoverGuildInput): Promise<MusicResult<MusicRecoveryOutcome>>;
}

export interface AdvanceQueueOptions {
  /** The finished track failed to load; retire it instead of replaying it. */
  trackFailed?: boolean;
}

export interface StartupRecoveryResult {
  guildId: string;
  ok: boolean;
  errorCode?: MusicErrorCode;
}

export interface LavalinkMusicServiceOptions {
  repository: CoordinatorRepository;
  nodeRegistry: NodeRegistry;
  lease: CoordinatorLease;
  adapter: CoordinatorAdapter;
  eventBus: MusicEventPublisher;
  recovery?: RecoveryCoordinator;
  shardId?: number | ((guildId: string) => number);
  maxAttempts?: number;
  retryDelayMs?: number;
  checkpointIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

interface ActivePlayback {
  nodeId: string;
  fencingToken: number;
  queueRevision: number;
  currentEntryId: string | null;
  trackIdentifier: string | null;
  voiceChannelId?: string;
  shardId?: number;
  paused: boolean;
}

interface DispatchContext {
  durable: DurableMusicQueueSnapshot;
  entry: DurableMusicQueueSnapshot["entries"][number];
  operationId: string;
  voiceChannelId?: string;
  shardId?: number;
  paused?: boolean;
}

/** Coordinates durable queue changes with fenced Lavalink player mutations. */
export class LavalinkMusicService implements MusicService {
  private readonly repository: CoordinatorRepository;
  private readonly nodeRegistry: NodeRegistry;
  private readonly lease: CoordinatorLease;
  private readonly adapter: CoordinatorAdapter;
  private readonly eventBus: MusicEventPublisher;
  private readonly recovery: RecoveryCoordinator;
  private readonly shardId: number | ((guildId: string) => number);
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly checkpointIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly active = new Map<string, ActivePlayback>();
  private readonly checkpointTimes = new Map<string, number>();
  private readonly commandTails = new Map<string, Promise<void>>();
  private closed = false;

  private readonly playbackListener = (event: MusicPlaybackEvent): void => {
    void this.handlePlaybackEvent(event).catch(() => {
      // The command path and next event reconcile state; EventEmitter callbacks cannot reject.
    });
  };

  constructor(options: LavalinkMusicServiceOptions) {
    this.repository = options.repository;
    this.nodeRegistry = options.nodeRegistry;
    this.lease = options.lease;
    this.adapter = options.adapter;
    this.eventBus = options.eventBus;
    this.shardId = options.shardId ?? 0;
    this.maxAttempts = positiveInteger(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, "maxAttempts");
    this.retryDelayMs = nonNegativeInteger(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, "retryDelayMs");
    this.checkpointIntervalMs = positiveInteger(
      options.checkpointIntervalMs ?? DEFAULT_CHECKPOINT_INTERVAL_MS,
      "checkpointIntervalMs",
    );
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.recovery = options.recovery ?? new MusicRecovery({
      repository: options.repository,
      nodeRegistry: options.nodeRegistry,
      lease: options.lease,
      adapter: options.adapter,
      eventBus: options.eventBus,
      maxAttempts: this.maxAttempts,
      retryDelayMs: this.retryDelayMs,
      sleep: this.sleep,
    });
    this.adapter.on("playback", this.playbackListener);
  }

  async execute(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>> {
    const validationError = validateCommand(command);
    if (validationError) return { ok: false, error: validationError };
    if (this.closed) {
      return { ok: false, error: new MusicError("MUSIC_RELAY_OFFLINE", "The music service is shut down.") };
    }

    return this.runExclusive(command.guildId, async () => {
      let result: MusicResult<MusicQueueSnapshot>;
      try {
        result = await this.executeValidated(command);
      } catch (error) {
        result = { ok: false, error: normalizeCoordinatorError(error) };
      }
      await this.publishCommandResult(command, result);
      return result;
    });
  }

  /**
   * Rebuilds players for guilds that were mid-playback when their previous
   * owner stopped. Callers must pass only guilds this process owns, otherwise
   * a healthy remote owner would be fenced out of its own session.
   *
   * The previous owner node is never marked failed here: at startup it is the
   * node this process just connected to, and marking it down would disable
   * placement for every guild.
   */
  async recoverOnStartup(
    sessions: readonly RecoverGuildInput[],
  ): Promise<StartupRecoveryResult[]> {
    const results: StartupRecoveryResult[] = [];

    for (const session of sessions) {
      if (this.closed) return results;
      const result = await this.recovery
        .recoverGuild({ ...session, markNodeFailed: false })
        .catch((error: unknown) => ({ ok: false, error: normalizeCoordinatorError(error) } as const));

      if (!result.ok) {
        results.push({ guildId: session.guildId, ok: false, errorCode: result.error.code });
        continue;
      }
      results.push({ guildId: session.guildId, ok: true });
      if (!result.value.nodeId || !result.value.fencingToken) continue;

      this.active.set(session.guildId, {
        nodeId: result.value.nodeId,
        fencingToken: result.value.fencingToken,
        queueRevision: result.value.queue.revision,
        currentEntryId: result.value.queue.currentEntryId,
        trackIdentifier: result.value.trackIdentifier,
        ...(session.voiceChannelId ? { voiceChannelId: session.voiceChannelId } : {}),
        ...(session.shardId !== undefined ? { shardId: session.shardId } : {}),
        paused: session.paused ?? false,
      });
    }

    return results;
  }

  /**
   * Advances the durable queue after a track ends by itself. The repeat mode
   * decides whether the finished entry replays, requeues, or is retired; a
   * track that failed to load is always retired so it cannot replay forever.
   */
  async advanceQueue(
    guildId: string,
    operationId: string,
    options: AdvanceQueueOptions = {},
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    if (!guildId.trim() || !operationId.trim()) {
      return { ok: false, error: new MusicError("MUSIC_CONFLICT", "The music command is invalid.") };
    }
    if (this.closed) {
      return { ok: false, error: new MusicError("MUSIC_RELAY_OFFLINE", "The music service is shut down.") };
    }

    return this.runExclusive(guildId, async () => {
      try {
        return await this.executeAdvance(guildId, operationId, options);
      } catch (error) {
        return { ok: false, error: normalizeCoordinatorError(error) };
      }
    });
  }

  async getState(guildId: string): Promise<MusicPlayerState> {
    validateGuildId(guildId);
    const durable = await this.repository.readSnapshot(guildId);
    const player = this.adapter.getPlayer(guildId);
    const active = this.active.get(guildId);
    return {
      guildId,
      status: player ? (player.paused ? "paused" : "playing") : durable.entries.length > 0 ? "unavailable" : "idle",
      queueRevision: durable.revision,
      nodeId: player?.nodeId ?? active?.nodeId ?? durable.assignedNodeId,
      currentEntryId: durable.currentEntryId,
      positionMs: player?.positionMs ?? durable.checkpointPositionMs,
    };
  }

  async getQueue(guildId: string): Promise<MusicQueueSnapshot> {
    validateGuildId(guildId);
    return toQueueSnapshot(await this.repository.readSnapshot(guildId));
  }

  async getLyrics(guildId: string, query?: string): Promise<MusicResult<LyricsData>> {
    validateGuildId(guildId);
    const durable = await this.repository.readSnapshot(guildId);
    const current = durable.entries.find((entry) => entry.id === durable.currentEntryId);
    return this.adapter.getLyrics({
      guildId,
      track: current?.track,
      query,
    });
  }

  async isActive(guildId: string): Promise<boolean> {
    validateGuildId(guildId);
    if (this.adapter.getPlayer(guildId)) return true;
    const durable = await this.repository.readSnapshot(guildId);
    return durable.currentEntryId !== null || durable.entries.length > 0;
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.adapter.off("playback", this.playbackListener);
    await Promise.allSettled([...this.active.entries()].map(([guildId, playback]) =>
      this.lease.release(guildId, playback.fencingToken),
    ));
    this.active.clear();
    this.checkpointTimes.clear();
  }

  async handlePlaybackEvent(event: MusicPlaybackEvent): Promise<void> {
    if (this.closed) return;
    if (event.type === "node.unavailable") {
      const recoveries = [...this.active.entries()]
        .filter(([, playback]) => playback.nodeId === event.nodeId)
        .map(async ([guildId, playback]) => {
          const result = await this.recovery.recoverGuild({
            guildId,
            failedNodeId: event.nodeId,
            voiceChannelId: playback.voiceChannelId,
            shardId: playback.shardId,
            paused: playback.paused,
            operationId: `recover:${event.nodeId}`,
          });
          if (result.ok && result.value.nodeId && result.value.fencingToken) {
            this.active.set(guildId, {
              ...playback,
              nodeId: result.value.nodeId,
              fencingToken: result.value.fencingToken,
              queueRevision: result.value.queue.revision,
              trackIdentifier: result.value.trackIdentifier,
            });
          }
        });
      await Promise.all(recoveries);
      return;
    }

    const ownedPlayback = this.active.get(event.guildId);
    if (ownedPlayback && ownedPlayback.nodeId !== event.nodeId) return;
    if (ownedPlayback) {
      try {
        await this.lease.assertOwner(event.guildId, ownedPlayback.fencingToken);
      } catch {
        return;
      }
    }
    const durable = await this.repository.readSnapshot(event.guildId);
    const playback = ownedPlayback;
    const currentEntryId = durable.currentEntryId
      ?? playback?.currentEntryId
      ?? durable.entries.find((entry) => entry.status === "playing")?.id
      ?? durable.entries[0]?.id
      ?? null;
    const currentQueueEntry = durable.entries.find((entry) => entry.id === currentEntryId);
    if (
      isTrackPlaybackEvent(event)
      && currentQueueEntry
      && !matchesPlaybackTrack(currentQueueEntry.track, event.track, playback?.trackIdentifier)
    ) {
      return;
    }

    if (event.type === "track.start") {
      await this.checkpointEvent(durable, currentEntryId, 0);
      this.checkpointTimes.set(event.guildId, this.now());
      this.updateActiveFromEvent(event.guildId, event.nodeId, currentEntryId, false);
      const active = this.active.get(event.guildId);
      if (active) this.active.set(event.guildId, { ...active, trackIdentifier: event.track.identifier });
      await this.publishPlaybackEvent(event.guildId, durable.revision, event.nodeId, "track.start", currentEntryId, 0);
      return;
    }

    if (event.type === "track.end") {
      await this.checkpointEvent(durable, null, 0);
      this.checkpointTimes.set(event.guildId, this.now());
      const active = this.active.get(event.guildId);
      if (active) this.active.set(event.guildId, { ...active, currentEntryId: null, paused: false });
      await this.publishPlaybackEvent(event.guildId, durable.revision, event.nodeId, "track.end", null, 0);
      return;
    }

    if (event.type === "player.update" && event.connected && currentEntryId) {
      const lastCheckpoint = this.checkpointTimes.get(event.guildId) ?? 0;
      if (this.now() - lastCheckpoint >= this.checkpointIntervalMs) {
        await this.checkpointEvent(durable, currentEntryId, event.positionMs);
        this.checkpointTimes.set(event.guildId, this.now());
        await this.publishPlaybackEvent(
          event.guildId,
          durable.revision,
          event.nodeId,
          "player.update",
          currentEntryId,
          event.positionMs,
        );
      }
      return;
    }

    if (event.type === "track.stuck" || event.type === "track.exception" || event.type === "voice.closed") {
      await this.publish({
        guildId: event.guildId,
        queueRevision: durable.revision,
        nodeId: event.nodeId,
        operationId: `playback:${event.type}`,
        errorCode: event.error.code,
        status: "unavailable",
        currentEntryId,
      });
    }
  }

  private async executeValidated(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>> {
    switch (command.type) {
      case "play":
        return this.executePlay(command);
      case "pause":
      case "resume":
      case "seek":
      case "volume":
      case "repeat":
      case "autoplay":
      case "filters":
        return this.executeCheckpointCommand(command);
      case "skip":
        return this.executeSkip(command);
      case "stop":
      case "queue.clear":
        return this.executeClear(command);
      case "queue.remove":
        return this.executeRemove(command);
      case "queue.move":
        return this.applyQueueOnly(command, {
          type: "move",
          entryId: command.entryId,
          position: command.position,
        });
      case "queue.shuffle": {
        const durable = await this.repository.readSnapshot(command.guildId);
        const entryIds = durable.entries.map(({ id }) => id);
        shuffle(entryIds, this.random);
        return this.applyQueueOnly(command, { type: "reorder", entryIds });
      }
    }
  }

  private async executePlay(command: Extract<MusicCommand, { type: "play" }>): Promise<MusicResult<MusicQueueSnapshot>> {
    const before = await this.repository.readSnapshot(command.guildId);
    const currentPosition = before.entries.findIndex((entry) => entry.id === before.currentEntryId);
    const position = command.insertAt === "next" && currentPosition >= 0
      ? currentPosition + 1
      : Number.MAX_SAFE_INTEGER;
    const committed = await this.repository.applyMutation({
      guildId: command.guildId,
      operationId: command.operationId,
      expectedRevision: command.expectedRevision,
      mutation: {
        type: "insert",
        entry: {
          id: command.track.id,
          track: command.track,
          requesterId: command.track.requestedBy,
          status: "pending",
          matchSource: command.track.playbackSource?.name ?? null,
          matchConfidence: command.track.matchConfidence ?? null,
        },
        position,
      },
    });
    if (committed.replayed) {
      const durable = await this.repository.readSnapshot(command.guildId);
      const entry = durable.entries.find((candidate) => candidate.id === command.track.id);
      if (!entry || entry.status !== "pending") {
        return { ok: true, value: toQueueSnapshot(durable) };
      }
      if (durable.revision !== committed.revision) {
        return { ok: true, value: toQueueSnapshot(durable) };
      }
      if (durable.currentEntryId && durable.currentEntryId !== entry.id) {
        await this.repository.applyMutation({
          guildId: command.guildId,
          operationId: `${command.operationId}:ready`,
          expectedRevision: committed.revision,
          mutation: { type: "setStatus", entryId: entry.id, status: "ready" },
        });
        return { ok: true, value: await this.getQueue(command.guildId) };
      }
      const player = this.adapter.getPlayer(command.guildId);
      if (player) {
        return this.reconcilePendingDispatch(durable, entry, command.operationId, player);
      }
      return this.dispatchEntry({
        durable,
        entry,
        operationId: command.operationId,
        voiceChannelId: command.voiceChannelId,
        shardId: this.resolveShardId(command.guildId),
        paused: false,
      });
    }

    let durable = await this.repository.readSnapshot(command.guildId);
    const entry = durable.entries.find((candidate) => candidate.id === command.track.id);
    if (!entry) throw new MusicQueueMutationError("The committed music entry could not be read.");

    if (before.currentEntryId || this.adapter.getPlayer(command.guildId)) {
      const ready = await this.repository.applyMutation({
        guildId: command.guildId,
        operationId: `${command.operationId}:ready`,
        expectedRevision: committed.revision,
        mutation: { type: "setStatus", entryId: entry.id, status: "ready" },
      });
      durable = await this.repository.readSnapshot(command.guildId);
      return { ok: true, value: toQueueSnapshot(durable) };
    }

    return this.dispatchEntry({
      durable,
      entry,
      operationId: command.operationId,
      voiceChannelId: command.voiceChannelId,
      shardId: this.resolveShardId(command.guildId),
      paused: false,
    });
  }

  private async dispatchEntry(context: DispatchContext): Promise<MusicResult<MusicQueueSnapshot>> {
    const source = playbackSource(context.entry.track);
    if (!source) {
      return { ok: false, error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "The track source is not supported.") };
    }

    const selected = this.nodeRegistry.selectNode({
      guildId: context.durable.guildId,
      assignedNodeId: context.durable.assignedNodeId,
      capabilities: [source],
    });
    if (!selected.ok) return selected;

    await this.repository.recordNodeAssignment({
      guildId: context.durable.guildId,
      nodeId: selected.value.id,
    });
    const fencingToken = await this.ensureLease(
      context.durable.guildId,
      selected.value.id,
      context.durable.revision,
    );
    const existingActive = this.active.get(context.durable.guildId);
    this.active.set(context.durable.guildId, {
      nodeId: selected.value.id,
      fencingToken,
      queueRevision: context.durable.revision,
      currentEntryId: context.entry.id,
      trackIdentifier: context.entry.track.playbackSource?.identifier ?? null,
      ...(context.voiceChannelId
        ? { voiceChannelId: context.voiceChannelId }
        : existingActive?.voiceChannelId ? { voiceChannelId: existingActive.voiceChannelId } : {}),
      ...(context.shardId !== undefined
        ? { shardId: context.shardId }
        : existingActive?.shardId !== undefined ? { shardId: existingActive.shardId } : {}),
      paused: context.paused ?? existingActive?.paused ?? false,
    });

    const resolved = await this.retryTransient(() => this.adapter.loadTracks({
      guildId: context.durable.guildId,
      input: context.entry.track.requestedInput,
      requestedBy: context.entry.track.requestedBy,
      requestType: context.entry.track.requestType,
      source,
      nodeId: selected.value.id,
      region: selected.value.region,
    }));
    if (!resolved.ok) return resolved;
    const candidate = selectCandidate(context.entry.track, resolved.value);
    if (!candidate) {
      return { ok: false, error: new MusicError("MUSIC_NO_MATCH", "No safe canonical track match was found.") };
    }
    const activeWithCandidate = this.active.get(context.durable.guildId);
    if (activeWithCandidate) {
      this.active.set(context.durable.guildId, {
        ...activeWithCandidate,
        trackIdentifier: candidate.track.playbackSource?.identifier
          ?? context.entry.track.playbackSource?.identifier
          ?? null,
      });
    }

    const dispatched = await this.retryTransient(async () => {
      await this.lease.assertOwner(context.durable.guildId, fencingToken);
      const playerForAttempt = this.adapter.getPlayer(context.durable.guildId);
      const update: LavalinkPlayerUpdate = {
        guildId: context.durable.guildId,
        nodeId: selected.value.id,
        ...(!playerForAttempt && context.voiceChannelId
          ? { voiceChannelId: context.voiceChannelId, shardId: context.shardId }
          : {}),
        ephemeralEncodedTrack: candidate.ephemeralEncodedTrack,
        positionMs: 0,
        volume: context.durable.volume,
        paused: context.paused ?? false,
        filters: context.durable.filters,
      };
      return this.adapter.createOrUpdatePlayer(update);
    });
    if (!dispatched.ok) return dispatched;

    const playing = await this.repository.applyMutation({
      guildId: context.durable.guildId,
      operationId: `${context.operationId}:playing`,
      expectedRevision: context.durable.revision,
      mutation: { type: "setStatus", entryId: context.entry.id, status: "playing" },
    });
    await this.repository.checkpoint({
      guildId: context.durable.guildId,
      expectedRevision: playing.revision,
      currentEntryId: context.entry.id,
      positionMs: dispatched.value.positionMs,
      volume: context.durable.volume,
      repeatMode: context.durable.repeatMode,
      filters: context.durable.filters,
      checkpointedAt: new Date(this.now()),
    });
    this.checkpointTimes.set(context.durable.guildId, this.now());
    this.active.set(context.durable.guildId, {
      nodeId: selected.value.id,
      fencingToken,
      queueRevision: playing.revision,
      currentEntryId: context.entry.id,
      trackIdentifier: candidate.track.playbackSource?.identifier
        ?? context.entry.track.playbackSource?.identifier
        ?? null,
      ...(context.voiceChannelId ? { voiceChannelId: context.voiceChannelId } : {}),
      ...(context.shardId !== undefined ? { shardId: context.shardId } : {}),
      paused: dispatched.value.paused,
    });
    return { ok: true, value: await this.getQueue(context.durable.guildId) };
  }

  private async reconcilePendingDispatch(
    durable: DurableMusicQueueSnapshot,
    entry: DurableMusicQueueSnapshot["entries"][number],
    operationId: string,
    player: LavalinkPlayerSnapshot,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const playing = await this.repository.applyMutation({
      guildId: durable.guildId,
      operationId: `${operationId}:playing`,
      expectedRevision: durable.revision,
      mutation: { type: "setStatus", entryId: entry.id, status: "playing" },
    });
    await this.repository.checkpoint({
      guildId: durable.guildId,
      expectedRevision: playing.revision,
      currentEntryId: entry.id,
      positionMs: player.positionMs,
      volume: player.volume,
      repeatMode: durable.repeatMode,
      filters: player.filters,
      checkpointedAt: new Date(this.now()),
    });
    const active = this.active.get(durable.guildId);
    if (active) {
      this.active.set(durable.guildId, {
        ...active,
        nodeId: player.nodeId,
        queueRevision: playing.revision,
        currentEntryId: entry.id,
        paused: player.paused,
      });
    }
    this.checkpointTimes.set(durable.guildId, this.now());
    return { ok: true, value: await this.getQueue(durable.guildId) };
  }

  private async executeCheckpointCommand(
    command: Extract<MusicCommand, { type: "pause" | "resume" | "seek" | "volume" | "repeat" | "filters" }>,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const durable = await this.repository.readSnapshot(command.guildId);
    const player = this.adapter.getPlayer(command.guildId);
    const positionMs = command.type === "seek"
      ? command.positionMs
      : player?.positionMs ?? durable.checkpointPositionMs;
    const checkpoint: Omit<MusicCheckpointInput, "guildId" | "expectedRevision"> = {
      currentEntryId: durable.currentEntryId,
      positionMs,
      checkpointedAt: new Date(this.now()),
      ...(command.type === "volume" ? { volume: command.volume } : {}),
      ...(command.type === "repeat" ? { repeatMode: command.repeatMode } : {}),
      ...(command.type === "autoplay" ? { autoplay: command.enabled } : {}),
      ...(command.type === "filters" ? { filters: command.filters } : {}),
    };
    const committed = await this.repository.applyCheckpointOperation({
      guildId: command.guildId,
      operationId: command.operationId,
      expectedRevision: command.expectedRevision,
      checkpoint,
    });
    const latest = await this.repository.readSnapshot(command.guildId);
    if (committed.replayed && latest.revision !== committed.revision) {
      return { ok: true, value: toQueueSnapshot(latest) };
    }

    if (command.type === "repeat" || command.type === "autoplay") {
      return { ok: true, value: await this.getQueue(command.guildId) };
    }
    if (!player) {
      if (command.type === "volume" || command.type === "filters") {
        return { ok: true, value: await this.getQueue(command.guildId) };
      }
      return { ok: false, error: new MusicError("MUSIC_VOICE_FAILED", "No active voice player exists.") };
    }

    const fencingToken = await this.ensureLease(command.guildId, player.nodeId, committed.revision);
    const update: LavalinkPlayerUpdate = {
      guildId: command.guildId,
      nodeId: player.nodeId,
      ...(command.type === "pause" ? { paused: true } : {}),
      ...(command.type === "resume" ? { paused: false } : {}),
      ...(command.type === "seek" ? { positionMs: command.positionMs } : {}),
      ...(command.type === "volume" ? { volume: command.volume } : {}),
      ...(command.type === "filters" ? { filters: command.filters } : {}),
    };
    const dispatched = await this.retryTransient(async () => {
      await this.lease.assertOwner(command.guildId, fencingToken);
      return this.adapter.createOrUpdatePlayer(update);
    });
    if (!dispatched.ok) return dispatched;

    const active = this.active.get(command.guildId);
    this.active.set(command.guildId, {
      nodeId: player.nodeId,
      fencingToken,
      queueRevision: committed.revision,
      currentEntryId: latest.currentEntryId,
      trackIdentifier: active?.trackIdentifier
        ?? latest.entries.find((entry) => entry.id === latest.currentEntryId)?.track.playbackSource?.identifier
        ?? null,
      ...(active?.voiceChannelId ? { voiceChannelId: active.voiceChannelId } : {}),
      ...(active?.shardId !== undefined ? { shardId: active.shardId } : {}),
      paused: dispatched.value.paused,
    });
    this.checkpointTimes.set(command.guildId, this.now());
    return { ok: true, value: await this.getQueue(command.guildId) };
  }

  private async executeSkip(command: Extract<MusicCommand, { type: "skip" }>): Promise<MusicResult<MusicQueueSnapshot>> {
    const before = await this.repository.readSnapshot(command.guildId);
    const current = before.entries.find((entry) => entry.id === before.currentEntryId);
    if (!current) return { ok: true, value: toQueueSnapshot(before) };
    const ended = await this.repository.applyMutation({
      guildId: command.guildId,
      operationId: command.operationId,
      expectedRevision: command.expectedRevision,
      mutation: { type: "setStatus", entryId: current.id, status: "failed" },
    });
    if (
      ended.replayed
      && before.revision > ended.revision
      && current.status === "playing"
    ) {
      return { ok: true, value: toQueueSnapshot(before) };
    }

    const after = await this.repository.readSnapshot(command.guildId);
    const next = after.entries
      .filter((entry) => entry.id !== current.id && entry.status !== "failed")
      .sort((left, right) => left.position - right.position)[0];
    if (!next) {
      if (after.revision !== ended.revision) return { ok: true, value: toQueueSnapshot(after) };
      return this.destroyCommittedPlayer(command.guildId, ended.revision, command.operationId);
    }

    const pending = await this.repository.applyMutation({
      guildId: command.guildId,
      operationId: `${command.operationId}:pending`,
      expectedRevision: ended.revision,
      mutation: { type: "setStatus", entryId: next.id, status: "pending" },
    });
    const durable = await this.repository.readSnapshot(command.guildId);
    const durableNext = durable.entries.find((entry) => entry.id === next.id);
    if (!durableNext) return { ok: true, value: toQueueSnapshot(durable) };
    if (pending.replayed && durable.revision !== pending.revision) {
      return { ok: true, value: toQueueSnapshot(durable) };
    }
    if (durable.currentEntryId === next.id && durableNext.status === "playing") {
      return { ok: true, value: toQueueSnapshot(durable) };
    }
    return this.dispatchEntry({
      durable: { ...durable, revision: pending.revision },
      entry: durableNext,
      operationId: command.operationId,
    });
  }

  private async executeAdvance(
    guildId: string,
    operationId: string,
    options: AdvanceQueueOptions,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const durable = await this.repository.readSnapshot(guildId);
    const finished = durable.entries.find((entry) => entry.id === durable.currentEntryId)
      ?? durable.entries.find((entry) => entry.status === "playing")
      ?? null;

    // A track that could not load must never replay: repeating it would loop
    // load failure → advance → load failure without bound.
    const retire = options.trackFailed === true;

    if (!retire && durable.repeatMode === "track" && finished) {
      return this.dispatchEntry({ durable, entry: finished, operationId });
    }

    let revision = durable.revision;
    if (finished) {
      const retired = await this.repository.applyMutation({
        guildId,
        operationId,
        expectedRevision: revision,
        mutation: {
          type: "setStatus",
          entryId: finished.id,
          // A requeued entry stays playable; a retired one must not be replayed.
          status: !retire && durable.repeatMode === "queue" ? "ready" : "failed",
        },
      });
      revision = retired.revision;
    }

    const after = await this.repository.readSnapshot(guildId);
    if (after.revision !== revision) {
      // Another writer moved the queue while this advance ran; it decided what
      // plays next, so reporting success here would hide a stalled queue.
      return {
        ok: false,
        error: new MusicError("MUSIC_CONFLICT", "The music queue changed before the advance completed."),
      };
    }

    const next = nextPlayableEntry(after, finished?.id ?? null);
    if (!next) {
      if (durable.autoplay && finished?.track) {
        const query = `${finished.track.artists[0] ?? ""} ${finished.track.title}`.trim();
        const loadResult = await this.adapter.loadTracks({
          guildId,
          input: `ytsearch:${query} mix`,
          requestedBy: "Autoplay",
          requestType: "search",
          source: "youtube",
        });

        if (loadResult.ok && loadResult.value.candidates.length > 0) {
          const existingTitles = new Set(durable.entries.map((e) => e.track.title.toLowerCase().trim()));
          const candidate = loadResult.value.candidates.find(
            (c) => !existingTitles.has(c.track.title.toLowerCase().trim()) && c.track.title.toLowerCase() !== finished.track.title.toLowerCase(),
          ) ?? loadResult.value.candidates[0];

          if (candidate) {
            const autoTrack: CanonicalTrack = {
              ...candidate.track,
              requestedBy: "Autoplay",
              requestedAt: new Date(this.now()).toISOString(),
            };
            const insertOpId = `autoplay_${operationId}_${randomUUID()}`;
            const inserted = await this.repository.applyMutation({
              guildId,
              operationId: insertOpId,
              expectedRevision: revision,
              mutation: {
                type: "insert",
                entry: {
                  id: autoTrack.id,
                  track: autoTrack,
                  requesterId: "Autoplay",
                  status: "ready",
                  matchSource: autoTrack.playbackSource?.name ?? null,
                  matchConfidence: autoTrack.matchConfidence ?? null,
                },
                position: after.entries.length,
              },
            });

            const freshDurable = await this.repository.readSnapshot(guildId);
            const freshNext = freshDurable.entries.find((e) => e.id === autoTrack.id);
            if (freshNext) {
              return this.dispatchEntry({
                durable: { ...freshDurable, revision: inserted.revision },
                entry: freshNext,
                operationId: `dispatch_${insertOpId}`,
              });
            }
          }
        }
      }

      return this.destroyCommittedPlayer(guildId, revision, operationId);
    }
    return this.dispatchEntry({ durable: { ...after, revision }, entry: next, operationId });
  }

  private async executeClear(
    command: Extract<MusicCommand, { type: "stop" | "queue.clear" }>,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const committed = await this.repository.applyMutation({
      guildId: command.guildId,
      operationId: command.operationId,
      expectedRevision: command.expectedRevision,
      mutation: { type: "clear" },
    });
    const durable = await this.repository.readSnapshot(command.guildId);
    if (committed.replayed && durable.revision !== committed.revision) {
      return { ok: true, value: toQueueSnapshot(durable) };
    }
    return this.destroyCommittedPlayer(command.guildId, committed.revision, command.operationId);
  }

  private async executeRemove(
    command: Extract<MusicCommand, { type: "queue.remove" }>,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const before = await this.repository.readSnapshot(command.guildId);
    const committed = await this.repository.applyMutation({
      guildId: command.guildId,
      operationId: command.operationId,
      expectedRevision: command.expectedRevision,
      mutation: { type: "remove", entryId: command.entryId },
    });
    const durable = await this.repository.readSnapshot(command.guildId);
    if (committed.replayed) {
      if (durable.revision !== committed.revision) return { ok: true, value: toQueueSnapshot(durable) };
      if (durable.currentEntryId === null && this.adapter.getPlayer(command.guildId)) {
        return this.destroyCommittedPlayer(command.guildId, committed.revision, command.operationId);
      }
      return { ok: true, value: toQueueSnapshot(durable) };
    }
    if (before.currentEntryId === command.entryId) {
      return this.destroyCommittedPlayer(command.guildId, committed.revision, command.operationId);
    }
    return { ok: true, value: await this.getQueue(command.guildId) };
  }

  private async applyQueueOnly(
    command: Extract<MusicCommand, { type: "queue.move" | "queue.shuffle" }>,
    mutation: Extract<MusicApplyMutationInput["mutation"], { type: "move" | "reorder" }>,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const committed = await this.repository.applyMutation({
      guildId: command.guildId,
      operationId: command.operationId,
      expectedRevision: command.expectedRevision,
      mutation,
    });
    return { ok: true, value: await this.getQueue(command.guildId) };
  }

  private async destroyCommittedPlayer(
    guildId: string,
    revision: number,
    operationId: string,
  ): Promise<MusicResult<MusicQueueSnapshot>> {
    const player = this.adapter.getPlayer(guildId);
    const active = this.active.get(guildId);
    if (player) {
      const fencingToken = await this.ensureLease(guildId, player.nodeId, revision);
      const destroyed = await this.retryTransient(async () => {
        await this.lease.assertOwner(guildId, fencingToken);
        return this.adapter.destroyPlayer(guildId);
      });
      if (!destroyed.ok) return destroyed;
      await this.lease.release(guildId, fencingToken);
    } else if (active) {
      await this.lease.release(guildId, active.fencingToken);
    }
    this.active.delete(guildId);
    this.checkpointTimes.delete(guildId);
    await this.clearTerminalSession(guildId, revision);
    return { ok: true, value: await this.getQueue(guildId) };
  }

  /**
   * Retires the durable session once no player remains. Without this a queue
   * that ran to completion keeps its current entry and node assignment, so
   * startup recovery would treat a finished session as still playable.
   */
  private async clearTerminalSession(guildId: string, revision: number): Promise<void> {
    try {
      await this.repository.checkpoint({
        guildId,
        expectedRevision: revision,
        currentEntryId: null,
        positionMs: 0,
        checkpointedAt: new Date(this.now()),
      });
      await this.repository.recordNodeAssignment({ guildId, nodeId: null });
    } catch {
      // Best effort: the player is already gone and the queue state is durable.
    }
  }

  private async ensureLease(guildId: string, nodeId: string, queueRevision: number): Promise<number> {
    const active = this.active.get(guildId);
    if (active) {
      if (active.nodeId !== nodeId) {
        throw new GuildPlaybackLeaseOwnershipError(guildId);
      }
      return this.lease.renew(guildId, active.fencingToken, nodeId, queueRevision);
    }
    const fencingToken = await this.lease.acquire(guildId, nodeId, queueRevision);
    this.active.set(guildId, {
      nodeId,
      fencingToken,
      queueRevision,
      currentEntryId: null,
      trackIdentifier: null,
      paused: false,
    });
    return fencingToken;
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

  private async checkpointEvent(
    durable: DurableMusicQueueSnapshot,
    currentEntryId: string | null,
    positionMs: number,
  ): Promise<void> {
    await this.repository.checkpoint({
      guildId: durable.guildId,
      expectedRevision: durable.revision,
      currentEntryId,
      positionMs,
      checkpointedAt: new Date(this.now()),
      volume: durable.volume,
      repeatMode: durable.repeatMode,
      filters: durable.filters,
    });
  }

  private updateActiveFromEvent(
    guildId: string,
    nodeId: string,
    currentEntryId: string | null,
    paused: boolean,
  ): void {
    const active = this.active.get(guildId);
    if (!active) return;
    this.active.set(guildId, { ...active, nodeId, currentEntryId, paused });
  }

  private async publishCommandResult(
    command: MusicCommand,
    result: MusicResult<MusicQueueSnapshot>,
  ): Promise<void> {
    const durable = await this.safeSnapshot(command.guildId);
    const player = this.adapter.getPlayer(command.guildId);
    await this.publish({
      guildId: command.guildId,
      queueRevision: result.ok ? result.value.revision : durable?.revision ?? command.expectedRevision,
      nodeId: player?.nodeId ?? this.active.get(command.guildId)?.nodeId ?? durable?.assignedNodeId ?? null,
      operationId: command.operationId,
      ...(!result.ok ? { errorCode: result.error.code } : {}),
      status: !result.ok
        ? "unavailable"
        : player
          ? player.paused ? "paused" : "playing"
          : result.value.entries.length > 0 ? "unavailable" : "idle",
      currentEntryId: result.ok ? result.value.currentEntryId : durable?.currentEntryId,
      positionMs: player?.positionMs ?? durable?.checkpointPositionMs,
    });
  }

  private async publishPlaybackEvent(
    guildId: string,
    queueRevision: number,
    nodeId: string,
    operation: string,
    currentEntryId: string | null,
    positionMs: number,
  ): Promise<void> {
    const player = this.adapter.getPlayer(guildId);
    await this.publish({
      guildId,
      queueRevision,
      nodeId,
      operationId: `playback:${operation}`,
      status: player?.paused ? "paused" : currentEntryId ? "playing" : "idle",
      currentEntryId,
      positionMs,
    });
  }

  private async publish(event: MusicStateEvent): Promise<void> {
    try {
      await this.eventBus.publish(CHANNEL_MUSIC_STATE, event);
    } catch {
      // Realtime state is observational; command durability and fencing already decided the result.
    }
  }

  private async safeSnapshot(guildId: string): Promise<DurableMusicQueueSnapshot | null> {
    try {
      return await this.repository.readSnapshot(guildId);
    } catch {
      return null;
    }
  }

  private resolveShardId(guildId: string): number {
    const shardId = typeof this.shardId === "function" ? this.shardId(guildId) : this.shardId;
    return nonNegativeInteger(shardId, "shardId");
  }

  private async runExclusive<T>(guildId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.commandTails.get(guildId) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.commandTails.set(guildId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.commandTails.get(guildId) === tail) this.commandTails.delete(guildId);
    }
  }
}

function validateCommand(command: MusicCommand): MusicError | null {
  try {
    validateGuildId(command.guildId);
    if (!command.operationId.trim()) throw new Error("operationId must not be empty.");
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
      throw new Error("expectedRevision must be a non-negative integer.");
    }

    switch (command.type) {
      case "play":
        if (!command.voiceChannelId.trim()) throw new Error("voiceChannelId must not be empty.");
        if (!command.track.id.trim() || !command.track.requestedInput.trim()) throw new Error("track is invalid.");
        break;
      case "seek":
        if (!Number.isFinite(command.positionMs) || command.positionMs < 0) throw new Error("positionMs is invalid.");
        break;
      case "volume":
        if (!Number.isInteger(command.volume) || command.volume < 0 || command.volume > 100) {
          throw new Error("volume is invalid.");
        }
        break;
      case "repeat":
        if (command.repeatMode !== "off" && command.repeatMode !== "track" && command.repeatMode !== "queue") {
          throw new Error("repeatMode is invalid.");
        }
        break;
      case "autoplay":
        if (typeof command.enabled !== "boolean") {
          throw new Error("autoplay is invalid.");
        }
        break;
      case "filters":
        if (!command.filters || typeof command.filters !== "object" || Array.isArray(command.filters)) {
          throw new Error("filters are invalid.");
        }
        break;
      case "queue.remove":
      case "queue.move":
        if (!command.entryId.trim()) throw new Error("entryId must not be empty.");
        if (command.type === "queue.move" && (!Number.isFinite(command.position) || command.position < 0)) {
          throw new Error("position is invalid.");
        }
        break;
    }
    return null;
  } catch {
    return new MusicError("MUSIC_CONFLICT", "The music command is invalid.");
  }
}

function validateGuildId(guildId: string): void {
  if (!guildId.trim()) throw new Error("guildId must not be empty.");
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function playbackSource(track: CanonicalTrack): LavalinkSearchSource | null {
  return toSearchSource(track.playbackSource?.name) ?? toSearchSource(track.requestedSource.name);
}

function toSearchSource(value: string | undefined): LavalinkSearchSource | null {
  return value === "youtube" || value === "youtube-music" || value === "soundcloud" ? value : null;
}

function selectCandidate(requested: CanonicalTrack, result: LavalinkLoadResult) {
  return result.candidates
    .map((candidate) => ({ candidate, score: scoreTrackMatch(requested, candidate.track) }))
    .filter(({ score }) => score >= MIN_MATCH_SCORE)
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;
}

/**
 * Picks the entry that follows the finished one. `queue` repeat wraps to the
 * front once the tail is reached; every other mode stops at the last entry.
 */
function nextPlayableEntry(
  snapshot: DurableMusicQueueSnapshot,
  finishedEntryId: string | null,
): DurableMusicQueueSnapshot["entries"][number] | null {
  const ordered = [...snapshot.entries].sort((left, right) => left.position - right.position);
  const playable = ordered.filter((entry) => entry.status !== "failed");
  const finished = ordered.find((entry) => entry.id === finishedEntryId) ?? null;
  const following = playable.find((entry) => (
    entry.id !== finishedEntryId && (!finished || entry.position > finished.position)
  ));
  if (following) return following;
  if (snapshot.repeatMode === "queue") return playable[0] ?? null;
  return playable.find((entry) => entry.id !== finishedEntryId) ?? null;
}

function isTrackPlaybackEvent(
  event: MusicPlaybackEvent,
): event is Extract<MusicPlaybackEvent, { type: "track.start" | "track.end" | "track.stuck" }> {
  return event.type === "track.start" || event.type === "track.end" || event.type === "track.stuck";
}

function matchesPlaybackTrack(
  canonical: CanonicalTrack,
  playback: MusicPlaybackTrack,
  activeIdentifier?: string | null,
): boolean {
  const expectedIdentifier = activeIdentifier?.trim() || canonical.playbackSource?.identifier?.trim();
  if (expectedIdentifier) return expectedIdentifier === playback.identifier.trim();
  return scoreTrackMatch(canonical, {
    title: playback.title,
    artists: [playback.artist],
    durationMs: playback.durationMs,
    isrc: playback.isrc,
  }) >= MIN_MATCH_SCORE;
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
    autoplay: snapshot.autoplay,
    volume: snapshot.volume,
    filters: snapshot.filters,
  };
}

function normalizeCoordinatorError(error: unknown): MusicError {
  if (error instanceof MusicError) return error;
  if (
    error instanceof MusicRevisionConflictError
    || error instanceof MusicQueueMutationError
    || error instanceof GuildPlaybackLeaseOwnershipError
  ) {
    return new MusicError("MUSIC_CONFLICT", "The music state changed before the command completed.");
  }
  return new MusicError("MUSIC_RELAY_OFFLINE", "The music command could not be completed.", {
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

function shuffle(values: string[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target]!, values[index]!];
  }
}
