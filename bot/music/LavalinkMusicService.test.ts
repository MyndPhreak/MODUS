import { EventEmitter } from "node:events";
import type {
  DurableMusicQueueSnapshot,
  MusicApplyCheckpointOperationInput,
  MusicApplyMutationInput,
  MusicCheckpointInput,
  MusicMutationResult,
  MusicNodeAssignmentInput,
} from "@modus/db";
import { MusicRevisionConflictError } from "@modus/db";
import { describe, expect, it } from "vitest";
import { MusicError } from "./errors";
import type {
  LavalinkLoadRequest,
  LavalinkLoadResult,
  LavalinkPlayerSnapshot,
  LavalinkPlayerUpdate,
} from "./LavalinkAdapter";
import { LavalinkMusicService } from "./LavalinkMusicService";
import type { MusicPlaybackEvent } from "./LavalinkEvents";
import type { MusicStateEvent } from "./MusicRecovery";
import { NodeRegistry, type LavalinkNodeConfig } from "./NodeRegistry";
import type { CanonicalTrack, MusicCommand, MusicFilters, MusicResult } from "./types";

const config = (id: string): LavalinkNodeConfig => ({
  id,
  url: `https://${id}.lavalink.internal:2333`,
  password: "secret",
  region: "us-east",
  capabilities: ["youtube", "youtube-music", "soundcloud"],
  maxPlayers: 100,
});

const track = (id = "track-1"): CanonicalTrack => ({
  id,
  requestedInput: "Durable Song",
  requestType: "search",
  title: "Durable Song",
  artists: ["MODUS"],
  durationMs: 180_000,
  requestedBy: "user-1",
  requestedAt: "2026-08-15T12:00:00.000Z",
  requestedSource: { name: "youtube" },
  playbackSource: { name: "youtube", identifier: id === "track-1" ? "video-1" : `video-${id}` },
  matchConfidence: 1,
});

const emptySnapshot = (revision = 0): DurableMusicQueueSnapshot => ({
  guildId: "guild-1",
  revision,
  entries: [],
  currentEntryId: null,
  checkpointPositionMs: 0,
  checkpointedAt: null,
  repeatMode: "off",
  volume: 100,
  filters: {},
  assignedNodeId: null,
});

class FakeMusicRepository {
  readonly operations = new Map<string, number>();
  readonly mutationInputs: MusicApplyMutationInput[] = [];
  readonly checkpointOperationInputs: MusicApplyCheckpointOperationInput[] = [];
  readonly checkpointInputs: MusicCheckpointInput[] = [];
  readonly assignmentInputs: MusicNodeAssignmentInput[] = [];
  throwAfterCommittedOperationId: string | null = null;

  constructor(
    public snapshot: DurableMusicQueueSnapshot,
    private readonly order: string[] = [],
  ) {}

  async readSnapshot(): Promise<DurableMusicQueueSnapshot> {
    return structuredClone(this.snapshot);
  }

  async applyMutation(input: MusicApplyMutationInput): Promise<MusicMutationResult> {
    this.order.push(input.mutation.type === "setStatus" ? "commit:status" : "commit");
    this.mutationInputs.push(structuredClone(input));
    const operationKey = `${input.guildId}:${input.operationId}`;
    const replayRevision = this.operations.get(operationKey);
    if (replayRevision !== undefined) return { revision: replayRevision, replayed: true };
    if (input.expectedRevision !== this.snapshot.revision) {
      throw new MusicRevisionConflictError(input.expectedRevision, this.snapshot.revision);
    }

    const mutation = input.mutation;
    if (mutation.type === "insert") {
      const position = Math.max(0, Math.min(mutation.position, this.snapshot.entries.length));
      this.snapshot.entries.splice(position, 0, { ...mutation.entry, position });
    } else if (mutation.type === "remove") {
      this.snapshot.entries = this.snapshot.entries.filter((entry) => entry.id !== mutation.entryId);
      if (this.snapshot.currentEntryId === mutation.entryId) this.snapshot.currentEntryId = null;
    } else if (mutation.type === "move") {
      const index = this.snapshot.entries.findIndex((entry) => entry.id === mutation.entryId);
      if (index >= 0) {
        const [entry] = this.snapshot.entries.splice(index, 1);
        if (entry) this.snapshot.entries.splice(Math.min(mutation.position, this.snapshot.entries.length), 0, entry);
      }
    } else if (mutation.type === "clear") {
      this.snapshot.entries = [];
      this.snapshot.currentEntryId = null;
    } else if (mutation.type === "reorder") {
      const byId = new Map(this.snapshot.entries.map((entry) => [entry.id, entry]));
      this.snapshot.entries = mutation.entryIds.flatMap((id) => byId.get(id) ?? []);
    } else {
      const entry = this.snapshot.entries.find((candidate) => candidate.id === mutation.entryId);
      if (entry) entry.status = mutation.status;
    }

    this.snapshot.entries.forEach((entry, position) => {
      entry.position = position;
    });
    this.snapshot.revision += 1;
    this.operations.set(operationKey, this.snapshot.revision);
    if (this.throwAfterCommittedOperationId === input.operationId) {
      throw new Error("Simulated process crash after durable commit.");
    }
    return { revision: this.snapshot.revision, replayed: false };
  }

  async checkpoint(input: MusicCheckpointInput): Promise<boolean> {
    this.order.push("checkpoint");
    this.checkpointInputs.push(structuredClone(input));
    if (input.expectedRevision !== this.snapshot.revision) return false;
    this.snapshot.currentEntryId = input.currentEntryId;
    this.snapshot.checkpointPositionMs = input.positionMs;
    this.snapshot.checkpointedAt = input.checkpointedAt ?? new Date();
    if (input.volume !== undefined) this.snapshot.volume = input.volume;
    if (input.repeatMode !== undefined) this.snapshot.repeatMode = input.repeatMode;
    if (input.filters !== undefined) this.snapshot.filters = structuredClone(input.filters);
    return true;
  }

  async applyCheckpointOperation(input: MusicApplyCheckpointOperationInput): Promise<MusicMutationResult> {
    this.order.push("commit:checkpoint");
    this.checkpointOperationInputs.push(structuredClone(input));
    const key = `${input.guildId}:${input.operationId}`;
    const replayRevision = this.operations.get(key);
    if (replayRevision !== undefined) return { revision: replayRevision, replayed: true };
    if (input.expectedRevision !== this.snapshot.revision) {
      throw new MusicRevisionConflictError(input.expectedRevision, this.snapshot.revision);
    }

    const checkpoint = input.checkpoint;
    this.snapshot.currentEntryId = checkpoint.currentEntryId;
    this.snapshot.checkpointPositionMs = checkpoint.positionMs;
    this.snapshot.checkpointedAt = checkpoint.checkpointedAt ?? new Date();
    if (checkpoint.volume !== undefined) this.snapshot.volume = checkpoint.volume;
    if (checkpoint.repeatMode !== undefined) this.snapshot.repeatMode = checkpoint.repeatMode;
    if (checkpoint.filters !== undefined) this.snapshot.filters = structuredClone(checkpoint.filters);
    this.snapshot.revision += 1;
    this.operations.set(key, this.snapshot.revision);
    return { revision: this.snapshot.revision, replayed: false };
  }

  async recordNodeAssignment(input: MusicNodeAssignmentInput): Promise<void> {
    this.order.push("assignment");
    this.assignmentInputs.push(structuredClone(input));
    this.snapshot.assignedNodeId = input.nodeId;
  }
}

class FakeLease {
  token = 17;

  constructor(private readonly order: string[]) {}

  async acquire(): Promise<number> {
    this.order.push("acquire");
    return this.token;
  }

  async renew(): Promise<number> {
    this.order.push("renew");
    return this.token;
  }

  async assertOwner(): Promise<number> {
    this.order.push("assert");
    return this.token;
  }

  async fenceAndAcquire(): Promise<number> {
    this.order.push("fence");
    return this.token;
  }

  async release(): Promise<number> {
    this.order.push("release");
    return this.token;
  }
}

class FakeAdapter extends EventEmitter {
  readonly loadRequests: LavalinkLoadRequest[] = [];
  readonly playerUpdates: LavalinkPlayerUpdate[] = [];
  readonly destroyCalls: string[] = [];
  loadResults: Array<MusicResult<LavalinkLoadResult>> = [];
  updateResults: Array<MusicResult<LavalinkPlayerSnapshot>> = [];
  destroyResults: Array<MusicResult<void>> = [];
  player: LavalinkPlayerSnapshot | null = null;
  materializePlayerOnFailure = false;

  constructor(private readonly order: string[]) {
    super();
  }

  async loadTracks(request: LavalinkLoadRequest): Promise<MusicResult<LavalinkLoadResult>> {
    this.order.push("resolve");
    this.loadRequests.push(structuredClone(request));
    return this.loadResults.shift() ?? {
      ok: true,
      value: {
        kind: "track",
        candidates: [{ track: track(), ephemeralEncodedTrack: "ephemeral-secret" }],
      },
    };
  }

  async createOrUpdatePlayer(update: LavalinkPlayerUpdate): Promise<MusicResult<LavalinkPlayerSnapshot>> {
    this.order.push("dispatch");
    this.playerUpdates.push(structuredClone(update));
    const result = this.updateResults.shift();
    if (result) {
      if (!result.ok && this.materializePlayerOnFailure) {
        this.player = {
          guildId: update.guildId,
          nodeId: update.nodeId,
          positionMs: update.positionMs ?? 0,
          volume: update.volume ?? 100,
          paused: update.paused ?? false,
          filters: structuredClone(update.filters ?? {}),
        };
      }
      return result;
    }
    this.player = {
      guildId: update.guildId,
      nodeId: update.nodeId,
      positionMs: update.positionMs ?? this.player?.positionMs ?? 0,
      volume: update.volume ?? this.player?.volume ?? 100,
      paused: update.paused ?? this.player?.paused ?? false,
      filters: structuredClone(update.filters ?? this.player?.filters ?? {}),
    };
    return { ok: true, value: this.player };
  }

  getPlayer(): LavalinkPlayerSnapshot | null {
    return this.player ? structuredClone(this.player) : null;
  }

  async destroyPlayer(guildId: string): Promise<MusicResult<void>> {
    this.order.push("dispatch");
    this.destroyCalls.push(guildId);
    const result = this.destroyResults.shift();
    if (result) return result;
    this.player = null;
    return { ok: true, value: undefined };
  }

  async transferPlayer(guildId: string, nodeId: string): Promise<MusicResult<LavalinkPlayerSnapshot>> {
    if (!this.player) {
      return { ok: false, error: new MusicError("MUSIC_VOICE_FAILED", "No player.") };
    }
    this.player = { ...this.player, guildId, nodeId };
    return { ok: true, value: structuredClone(this.player) };
  }

  emitPlayback(event: MusicPlaybackEvent): void {
    this.emit("playback", event);
  }
}

class FakeEventBus {
  readonly events: Array<{ channel: string; payload: MusicStateEvent }> = [];

  async publish(channel: string, payload: MusicStateEvent): Promise<void> {
    this.events.push({ channel, payload: structuredClone(payload) });
  }
}

function setup(snapshot = emptySnapshot(), now = () => Date.parse("2026-08-15T12:00:00.000Z")) {
  const order: string[] = [];
  const repository = new FakeMusicRepository(snapshot, order);
  const nodeRegistry = new NodeRegistry([config("primary")]);
  nodeRegistry.update("primary", { available: true });
  const lease = new FakeLease(order);
  const adapter = new FakeAdapter(order);
  const eventBus = new FakeEventBus();
  const service = new LavalinkMusicService({
    repository,
    nodeRegistry,
    lease,
    adapter,
    eventBus,
    shardId: 2,
    maxAttempts: 3,
    retryDelayMs: 0,
    checkpointIntervalMs: 30_000,
    now,
  });
  return { adapter, eventBus, lease, nodeRegistry, order, repository, service };
}

const playCommand = (overrides: Partial<Extract<MusicCommand, { type: "play" }>> = {}): Extract<MusicCommand, { type: "play" }> => ({
  type: "play",
  guildId: "guild-1",
  operationId: "play-1",
  expectedRevision: 0,
  track: track(),
  voiceChannelId: "voice-1",
  ...overrides,
});

describe("LavalinkMusicService", () => {
  it("validates, commits pending state, leases, asserts ownership immediately before dispatch, and publishes one state event", async () => {
    const { adapter, eventBus, order, repository, service } = setup();

    const invalid = await service.execute(playCommand({ expectedRevision: -1 }));
    expect(invalid).toMatchObject({ ok: false, error: { code: "MUSIC_CONFLICT" } });
    expect(order).toEqual([]);

    const result = await service.execute(playCommand());

    expect(result).toMatchObject({
      ok: true,
      value: {
        revision: 2,
        currentEntryId: "track-1",
        entries: [{ id: "track-1", status: "playing" }],
      },
    });
    expect(order.indexOf("commit")).toBeLessThan(order.indexOf("acquire"));
    expect(order[order.indexOf("dispatch") - 1]).toBe("assert");
    expect(repository.mutationInputs[0]).toMatchObject({
      expectedRevision: 0,
      mutation: { type: "insert", entry: { id: "track-1", status: "pending" } },
    });
    expect(JSON.stringify(repository.mutationInputs)).not.toContain("ephemeral-secret");
    expect(adapter.playerUpdates[0]).toMatchObject({
      guildId: "guild-1",
      nodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 2,
      ephemeralEncodedTrack: "ephemeral-secret",
    });
    expect(eventBus.events).toEqual([{
      channel: "modus:realtime:music",
      payload: expect.objectContaining({
        guildId: "guild-1",
        queueRevision: 2,
        nodeId: "primary",
        operationId: "play-1",
      }),
    }]);
  });

  it("returns a stable conflict without leasing or dispatching when expectedRevision is stale", async () => {
    const { adapter, order, service } = setup(emptySnapshot(4));

    const result = await service.execute(playCommand({ expectedRevision: 3 }));

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_CONFLICT", retryable: false } });
    expect(adapter.playerUpdates).toHaveLength(0);
    expect(order).not.toContain("acquire");
    expect(order).not.toContain("assert");
  });

  it("replays a durable operation without duplicating its queue entry or player dispatch", async () => {
    const { adapter, repository, service } = setup();
    const command = playCommand();

    const first = await service.execute(command);
    const replay = await service.execute(command);

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect(repository.snapshot.entries.map(({ id }) => id)).toEqual(["track-1"]);
    expect(adapter.playerUpdates).toHaveLength(1);
  });

  it("keeps the committed queue entry pending when a non-retryable dispatch fails", async () => {
    const { adapter, repository, service } = setup();
    adapter.updateResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Voice failed.", { retryable: false }),
    });

    const result = await service.execute(playCommand());

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_VOICE_FAILED" } });
    expect(repository.snapshot).toMatchObject({
      revision: 1,
      entries: [{ id: "track-1", status: "pending" }],
    });
  });

  it("resumes a replayed pending operation without inserting a second entry", async () => {
    const { adapter, repository, service } = setup();
    adapter.updateResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Voice failed.", { retryable: false }),
    });
    const command = playCommand();

    const failed = await service.execute(command);
    const replay = await service.execute(command);

    expect(failed.ok).toBe(false);
    expect(replay).toMatchObject({
      ok: true,
      value: { entries: [{ id: "track-1", status: "playing" }] },
    });
    expect(repository.snapshot.entries).toHaveLength(1);
    expect(adapter.playerUpdates).toHaveLength(2);
  });

  it("resumes replayed clear destruction only while its durable revision is still current", async () => {
    const durable = emptySnapshot(3);
    durable.entries = [{
      id: "track-1",
      track: track(),
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    }];
    durable.currentEntryId = "track-1";
    durable.assignedNodeId = "primary";
    const { adapter, service } = setup(durable);
    adapter.player = {
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 30_000,
      volume: 100,
      paused: false,
      filters: {},
    };
    adapter.destroyResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Temporary destroy failure."),
    });
    const command: MusicCommand = {
      type: "queue.clear",
      guildId: "guild-1",
      operationId: "clear-1",
      expectedRevision: 3,
    };

    const failed = await service.execute(command);
    const replay = await service.execute(command);

    expect(failed).toMatchObject({ ok: false, error: { code: "MUSIC_VOICE_FAILED" } });
    expect(replay).toMatchObject({ ok: true, value: { revision: 4, entries: [] } });
    expect(adapter.destroyCalls).toEqual(["guild-1", "guild-1"]);
    expect(adapter.player).toBeNull();
  });

  it("resumes replayed current-entry removal destruction after its first live dispatch fails", async () => {
    const durable = emptySnapshot(3);
    durable.entries = [{
      id: "track-1",
      track: track(),
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    }];
    durable.currentEntryId = "track-1";
    durable.assignedNodeId = "primary";
    const { adapter, service } = setup(durable);
    adapter.player = {
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 30_000,
      volume: 100,
      paused: false,
      filters: {},
    };
    adapter.destroyResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Temporary destroy failure."),
    });
    const command: MusicCommand = {
      type: "queue.remove",
      guildId: "guild-1",
      operationId: "remove-current",
      expectedRevision: 3,
      entryId: "track-1",
    };

    const failed = await service.execute(command);
    const replay = await service.execute(command);

    expect(failed).toMatchObject({ ok: false, error: { code: "MUSIC_VOICE_FAILED" } });
    expect(replay.ok).toBe(true);
    expect(adapter.destroyCalls).toEqual(["guild-1", "guild-1"]);
    expect(adapter.player).toBeNull();
  });

  it("resumes the persisted skip pending phase after the first next-track dispatch fails", async () => {
    const durable = emptySnapshot(3);
    durable.entries = ["track-1", "track-2"].map((id, position) => ({
      id,
      track: track(id),
      requesterId: "user-1",
      position,
      status: position === 0 ? "playing" as const : "ready" as const,
      matchSource: "youtube",
      matchConfidence: 1,
    }));
    durable.currentEntryId = "track-1";
    durable.assignedNodeId = "primary";
    const { adapter, repository, service } = setup(durable);
    adapter.player = {
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 30_000,
      volume: 100,
      paused: false,
      filters: {},
    };
    adapter.updateResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Temporary next-track failure."),
    });
    const command: MusicCommand = {
      type: "skip",
      guildId: "guild-1",
      operationId: "skip-1",
      expectedRevision: 3,
    };

    const failed = await service.execute(command);
    const replay = await service.execute(command);

    expect(failed).toMatchObject({ ok: false, error: { code: "MUSIC_VOICE_FAILED" } });
    expect(replay).toMatchObject({
      ok: true,
      value: {
        currentEntryId: "track-2",
        entries: expect.arrayContaining([expect.objectContaining({ id: "track-2", status: "playing" })]),
      },
    });
    expect(repository.snapshot.entries).toHaveLength(2);
    expect(adapter.playerUpdates).toHaveLength(2);
  });

  it("replays enqueue-behind-active as ready without promoting it or checkpointing the old player", async () => {
    const durable = emptySnapshot(3);
    durable.entries = [{
      id: "track-1",
      track: track(),
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    }];
    durable.currentEntryId = "track-1";
    durable.assignedNodeId = "primary";
    const { adapter, eventBus, lease, nodeRegistry, repository, service } = setup(durable);
    adapter.player = {
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 30_000,
      volume: 100,
      paused: false,
      filters: {},
    };
    repository.throwAfterCommittedOperationId = "enqueue-2";
    const command = playCommand({
      operationId: "enqueue-2",
      expectedRevision: 3,
      track: track("track-2"),
    });

    const crashed = await service.execute(command);
    repository.throwAfterCommittedOperationId = null;
    await service.shutdown();
    const restarted = new LavalinkMusicService({
      repository,
      nodeRegistry,
      lease,
      adapter,
      eventBus,
      shardId: 2,
      retryDelayMs: 0,
    });
    const checkpointsBeforeReplay = repository.checkpointInputs.length;
    const replay = await restarted.execute(command);

    expect(crashed.ok).toBe(false);
    expect(replay).toMatchObject({
      ok: true,
      value: {
        currentEntryId: "track-1",
        entries: expect.arrayContaining([expect.objectContaining({ id: "track-2", status: "ready" })]),
      },
    });
    expect(adapter.playerUpdates).toHaveLength(0);
    expect(repository.checkpointInputs).toHaveLength(checkpointsBeforeReplay);
  });

  it("retries only the same transient source resolution a bounded number of times", async () => {
    const { adapter, service } = setup();
    adapter.loadResults.push(
      { ok: false, error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Temporary.", { retryable: true }) },
      { ok: false, error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Temporary.", { retryable: true }) },
    );

    const result = await service.execute(playCommand());

    expect(result.ok).toBe(true);
    expect(adapter.loadRequests).toHaveLength(3);
    expect(adapter.loadRequests.map(({ source }) => source)).toEqual(["youtube", "youtube", "youtube"]);
    expect(adapter.playerUpdates).toHaveLength(1);
  });

  it("returns MUSIC_RETRY_EXHAUSTED after the bounded transient source attempts", async () => {
    const { adapter, repository, service } = setup();
    adapter.loadResults.push(...Array.from({ length: 3 }, () => ({
      ok: false as const,
      error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Temporary.", { retryable: true }),
    })));

    const result = await service.execute(playCommand());

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_RETRY_EXHAUSTED", retryable: false } });
    expect(adapter.loadRequests).toHaveLength(3);
    expect(repository.snapshot.entries[0]?.status).toBe("pending");
  });

  it("does not retry a placement error merely because the boundary marks it retryable", async () => {
    const { adapter, service } = setup();
    adapter.loadResults.push({
      ok: false,
      error: new MusicError("MUSIC_NODE_CAPACITY", "Full.", { retryable: true }),
    });

    const result = await service.execute(playCommand());

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_NODE_CAPACITY" } });
    expect(adapter.loadRequests).toHaveLength(1);
  });

  it("reuses a player materialized by a transient transport failure instead of joining voice twice", async () => {
    const { adapter, service } = setup();
    adapter.materializePlayerOnFailure = true;
    adapter.updateResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Temporary.", { retryable: true }),
    });

    const result = await service.execute(playCommand());

    expect(result.ok).toBe(true);
    expect(adapter.playerUpdates).toHaveLength(2);
    expect(adapter.playerUpdates[0]).toMatchObject({ voiceChannelId: "voice-1", shardId: 2 });
    expect(adapter.playerUpdates[1]?.voiceChannelId).toBeUndefined();
    expect(adapter.playerUpdates[1]?.shardId).toBeUndefined();
  });

  it.each<{
    name: string;
    command: MusicCommand;
    expectedUpdate: Partial<LavalinkPlayerUpdate>;
    expectedCheckpoint: Partial<MusicCheckpointInput>;
  }>([
    {
      name: "pause",
      command: { type: "pause", guildId: "guild-1", operationId: "pause-1", expectedRevision: 3 },
      expectedUpdate: { paused: true },
      expectedCheckpoint: { positionMs: 25_000 },
    },
    {
      name: "seek",
      command: { type: "seek", guildId: "guild-1", operationId: "seek-1", expectedRevision: 3, positionMs: 42_000 },
      expectedUpdate: { positionMs: 42_000 },
      expectedCheckpoint: { positionMs: 42_000 },
    },
    {
      name: "volume",
      command: { type: "volume", guildId: "guild-1", operationId: "volume-1", expectedRevision: 3, volume: 64 },
      expectedUpdate: { volume: 64 },
      expectedCheckpoint: { volume: 64 },
    },
    {
      name: "filters",
      command: {
        type: "filters",
        guildId: "guild-1",
        operationId: "filters-1",
        expectedRevision: 3,
        filters: { timescale: { speed: 1.1 } },
      },
      expectedUpdate: { filters: { timescale: { speed: 1.1 } } },
      expectedCheckpoint: { filters: { timescale: { speed: 1.1 } } },
    },
  ])("persists the $name checkpoint before asserting and dispatching", async ({ command, expectedCheckpoint, expectedUpdate }) => {
    const currentTrack = track();
    const durable = emptySnapshot(3);
    durable.entries = [{
      id: currentTrack.id,
      track: currentTrack,
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    }];
    durable.currentEntryId = currentTrack.id;
    durable.checkpointPositionMs = 25_000;
    durable.assignedNodeId = "primary";
    const { adapter, order, repository, service } = setup(durable);
    adapter.player = {
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 25_000,
      volume: 100,
      paused: false,
      filters: {},
    };

    const result = await service.execute(command);

    expect(result.ok).toBe(true);
    expect(repository.checkpointOperationInputs.at(-1)).toMatchObject({
      expectedRevision: 3,
      checkpoint: expectedCheckpoint,
    });
    expect(adapter.playerUpdates.at(-1)).toMatchObject(expectedUpdate);
    expect(order.indexOf("commit:checkpoint")).toBeLessThan(order.indexOf("assert"));
    expect(order[order.indexOf("dispatch") - 1]).toBe("assert");
  });

  it("treats a delayed checkpoint-command replay after restart as success without overwriting newer settings", async () => {
    const currentTrack = track();
    const durable = emptySnapshot(3);
    durable.entries = [{
      id: currentTrack.id,
      track: currentTrack,
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    }];
    durable.currentEntryId = currentTrack.id;
    durable.assignedNodeId = "primary";
    const { adapter, eventBus, lease, nodeRegistry, repository, service } = setup(durable);
    adapter.player = {
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 25_000,
      volume: 100,
      paused: false,
      filters: {},
    };

    const first = await service.execute({
      type: "volume",
      guildId: "guild-1",
      operationId: "volume-64",
      expectedRevision: 3,
      volume: 64,
    });
    await service.shutdown();
    const restarted = new LavalinkMusicService({
      repository,
      nodeRegistry,
      lease,
      adapter,
      eventBus,
      shardId: 2,
      retryDelayMs: 0,
    });
    const newer = await restarted.execute({
      type: "volume",
      guildId: "guild-1",
      operationId: "volume-80",
      expectedRevision: 4,
      volume: 80,
    });
    const dispatchesBeforeDelayedReplay = adapter.playerUpdates.length;
    await restarted.shutdown();
    const secondRestart = new LavalinkMusicService({
      repository,
      nodeRegistry,
      lease,
      adapter,
      eventBus,
      shardId: 2,
      retryDelayMs: 0,
    });

    const delayedReplay = await secondRestart.execute({
      type: "volume",
      guildId: "guild-1",
      operationId: "volume-64",
      expectedRevision: 3,
      volume: 64,
    });

    expect(first).toMatchObject({ ok: true, value: { revision: 4, volume: 64 } });
    expect(newer).toMatchObject({ ok: true, value: { revision: 5, volume: 80 } });
    expect(delayedReplay).toMatchObject({ ok: true, value: { revision: 5, volume: 80 } });
    expect(repository.snapshot).toMatchObject({ revision: 5, volume: 80 });
    expect(adapter.playerUpdates).toHaveLength(dispatchesBeforeDelayedReplay);
  });

  it("checkpoints track transitions and throttles player updates to the bounded playing interval", async () => {
    let now = Date.parse("2026-08-15T12:00:00.000Z");
    const currentTrack = track();
    const durable = emptySnapshot(5);
    durable.entries = [{
      id: currentTrack.id,
      track: currentTrack,
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    }];
    durable.currentEntryId = currentTrack.id;
    durable.assignedNodeId = "primary";
    const { repository, service } = setup(durable, () => now);

    await service.handlePlaybackEvent({
      type: "track.start",
      guildId: "guild-1",
      nodeId: "primary",
      track: { identifier: "video-1", title: "Durable Song", artist: "MODUS", durationMs: 180_000, sourceName: "youtube" },
    });
    now += 10_000;
    await service.handlePlaybackEvent({
      type: "player.update",
      guildId: "guild-1",
      nodeId: "primary",
      connected: true,
      positionMs: 10_000,
      timestamp: now,
      pingMs: 20,
    });
    now += 21_000;
    await service.handlePlaybackEvent({
      type: "player.update",
      guildId: "guild-1",
      nodeId: "primary",
      connected: true,
      positionMs: 31_000,
      timestamp: now,
      pingMs: 20,
    });
    await service.handlePlaybackEvent({
      type: "track.end",
      guildId: "guild-1",
      nodeId: "primary",
      reason: "finished",
      track: { identifier: "video-1", title: "Durable Song", artist: "MODUS", durationMs: 180_000, sourceName: "youtube" },
    });

    expect(repository.checkpointInputs.map(({ currentEntryId, positionMs }) => ({ currentEntryId, positionMs }))).toEqual([
      { currentEntryId: "track-1", positionMs: 0 },
      { currentEntryId: "track-1", positionMs: 31_000 },
      { currentEntryId: null, positionMs: 0 },
    ]);
  });

  it("ignores a late checkpoint event from a node that does not own the active player", async () => {
    const { repository, service } = setup();
    await service.execute(playCommand());
    const checkpointsBeforeLateEvent = repository.checkpointInputs.length;

    await service.handlePlaybackEvent({
      type: "track.end",
      guildId: "guild-1",
      nodeId: "fenced-node",
      reason: "finished",
      track: { identifier: "video-1", title: "Durable Song", artist: "MODUS", durationMs: 180_000, sourceName: "youtube" },
    });

    expect(repository.checkpointInputs).toHaveLength(checkpointsBeforeLateEvent);
    expect(repository.snapshot.currentEntryId).toBe("track-1");
  });

  it("ignores a delayed same-node track end whose track identity is not current", async () => {
    const { repository, service } = setup();
    await service.execute(playCommand());
    const checkpointsBeforeLateEvent = repository.checkpointInputs.length;

    await service.handlePlaybackEvent({
      type: "track.end",
      guildId: "guild-1",
      nodeId: "primary",
      reason: "finished",
      track: {
        identifier: "old-video",
        title: "Old Song",
        artist: "Old Artist",
        durationMs: 120_000,
        sourceName: "youtube",
      },
    });

    expect(repository.checkpointInputs).toHaveLength(checkpointsBeforeLateEvent);
    expect(repository.snapshot.currentEntryId).toBe("track-1");
  });

  it("accepts the selected transport candidate identity when it differs from canonical metadata", async () => {
    const { adapter, repository, service } = setup();
    const requested = {
      ...track(),
      playbackSource: { name: "youtube", identifier: "canonical-video" },
    };
    adapter.loadResults.push({
      ok: true,
      value: {
        kind: "track",
        candidates: [{
          track: {
            ...requested,
            playbackSource: { name: "youtube", identifier: "resolved-video" },
          },
          ephemeralEncodedTrack: "resolved-encoding",
        }],
      },
    });
    await service.execute(playCommand({ track: requested }));
    const checkpointsBeforeEnd = repository.checkpointInputs.length;

    await service.handlePlaybackEvent({
      type: "track.end",
      guildId: "guild-1",
      nodeId: "primary",
      reason: "finished",
      track: {
        identifier: "resolved-video",
        title: "Durable Song",
        artist: "MODUS",
        durationMs: 180_000,
        sourceName: "youtube",
      },
    });

    expect(repository.checkpointInputs).toHaveLength(checkpointsBeforeEnd + 1);
    expect(repository.snapshot.currentEntryId).toBeNull();
  });
});

const queuedSnapshot = (
  overrides: Partial<DurableMusicQueueSnapshot> = {},
): DurableMusicQueueSnapshot => ({
  ...emptySnapshot(5),
  entries: [
    {
      id: "entry-1",
      track: track("entry-1"),
      requesterId: "user-1",
      position: 0,
      status: "playing",
      matchSource: "youtube",
      matchConfidence: 1,
    },
    {
      id: "entry-2",
      track: track("entry-2"),
      requesterId: "user-1",
      position: 1,
      status: "ready",
      matchSource: "youtube",
      matchConfidence: 1,
    },
  ],
  currentEntryId: "entry-1",
  assignedNodeId: "primary",
  ...overrides,
});

const livePlayer = (): LavalinkPlayerSnapshot => ({
  guildId: "guild-1",
  nodeId: "primary",
  positionMs: 180_000,
  volume: 100,
  paused: false,
  filters: {},
});

function statusMutations(repository: FakeMusicRepository, entryId: string) {
  return repository.mutationInputs.filter((input) =>
    input.mutation.type === "setStatus" && input.mutation.entryId === entryId,
  );
}

describe("LavalinkMusicService.advanceQueue", () => {
  it("retires the finished entry and dispatches the next one when repeat is off", async () => {
    const { adapter, repository, service } = setup(queuedSnapshot());
    adapter.player = livePlayer();

    const result = await service.advanceQueue("guild-1", "advance-1");

    expect(result.ok).toBe(true);
    expect(statusMutations(repository, "entry-1")[0]).toMatchObject({
      mutation: { status: "failed" },
    });
    expect(repository.snapshot.currentEntryId).toBe("entry-2");
    expect(repository.snapshot.entries.find((entry) => entry.id === "entry-2")?.status).toBe("playing");
    expect(adapter.playerUpdates.at(-1)).toMatchObject({ ephemeralEncodedTrack: "ephemeral-secret" });
  });

  it("replays the same entry when repeat is track", async () => {
    const { adapter, repository, service } = setup(queuedSnapshot({ repeatMode: "track" }));
    adapter.player = livePlayer();

    const result = await service.advanceQueue("guild-1", "advance-1");

    expect(result.ok).toBe(true);
    expect(statusMutations(repository, "entry-1").map((input) => (input.mutation as any).status))
      .toEqual(["playing"]);
    expect(repository.snapshot.currentEntryId).toBe("entry-1");
    expect(adapter.playerUpdates).toHaveLength(1);
  });

  it("keeps the finished entry playable and wraps to the front when repeat is queue", async () => {
    const { adapter, repository, service } = setup(queuedSnapshot({
      repeatMode: "queue",
      currentEntryId: "entry-2",
    }));
    repository.snapshot.entries[0]!.status = "ready";
    repository.snapshot.entries[1]!.status = "playing";
    adapter.player = livePlayer();

    const result = await service.advanceQueue("guild-1", "advance-1");

    expect(result.ok).toBe(true);
    expect(statusMutations(repository, "entry-2")[0]).toMatchObject({ mutation: { status: "ready" } });
    expect(repository.snapshot.currentEntryId).toBe("entry-1");
  });

  it("retires a track that failed to load even when repeat is track", async () => {
    const { adapter, repository, service } = setup(queuedSnapshot({
      repeatMode: "track",
      entries: [{
        id: "entry-1",
        track: track("entry-1"),
        requesterId: "user-1",
        position: 0,
        status: "playing",
        matchSource: "youtube",
        matchConfidence: 1,
      }],
    }));
    adapter.player = livePlayer();

    const result = await service.advanceQueue("guild-1", "advance-1", { trackFailed: true });

    expect(result.ok).toBe(true);
    expect(statusMutations(repository, "entry-1")[0]).toMatchObject({ mutation: { status: "failed" } });
    expect(adapter.playerUpdates).toHaveLength(0);
    expect(adapter.destroyCalls).toEqual(["guild-1"]);
  });

  it("destroys the player and retires the durable session when the queue is exhausted", async () => {
    const { adapter, repository, service } = setup(queuedSnapshot({
      entries: [{
        id: "entry-1",
        track: track("entry-1"),
        requesterId: "user-1",
        position: 0,
        status: "playing",
        matchSource: "youtube",
        matchConfidence: 1,
      }],
    }));
    adapter.player = livePlayer();

    const result = await service.advanceQueue("guild-1", "advance-1");

    expect(result.ok).toBe(true);
    expect(adapter.destroyCalls).toEqual(["guild-1"]);
    expect(repository.checkpointInputs.at(-1)).toMatchObject({ currentEntryId: null, positionMs: 0 });
    expect(repository.assignmentInputs.at(-1)).toEqual({ guildId: "guild-1", nodeId: null });
    expect(repository.snapshot.currentEntryId).toBeNull();
    expect(repository.snapshot.assignedNodeId).toBeNull();
  });

  it("reports a conflict instead of success when another writer moved the queue", async () => {
    const durable = queuedSnapshot();
    const repository = {
      snapshot: durable,
      reads: 0,
      async readSnapshot(): Promise<DurableMusicQueueSnapshot> {
        this.reads += 1;
        // The second read models a concurrent command committing first.
        return structuredClone(this.reads > 1 ? { ...durable, revision: durable.revision + 5 } : durable);
      },
      async applyMutation(): Promise<MusicMutationResult> {
        return { revision: durable.revision + 1, replayed: false };
      },
      async applyCheckpointOperation(): Promise<MusicMutationResult> {
        return { revision: durable.revision + 1, replayed: false };
      },
      async checkpoint(): Promise<boolean> {
        return true;
      },
      async recordNodeAssignment(): Promise<void> {},
    };
    const nodeRegistry = new NodeRegistry([config("primary")]);
    nodeRegistry.update("primary", { available: true });
    const order: string[] = [];
    const adapter = new FakeAdapter(order);
    adapter.player = livePlayer();
    const service = new LavalinkMusicService({
      repository,
      nodeRegistry,
      lease: new FakeLease(order),
      adapter,
      eventBus: new FakeEventBus(),
      retryDelayMs: 0,
    });

    const result = await service.advanceQueue("guild-1", "advance-1");

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_CONFLICT" } });
    expect(adapter.playerUpdates).toHaveLength(0);
  });
});

describe("LavalinkMusicService.recoverOnStartup", () => {
  it("restores the session without marking the node it just connected to as failed", async () => {
    const { adapter, nodeRegistry, repository, service } = setup(queuedSnapshot());
    adapter.player = null;

    const results = await service.recoverOnStartup([{
      guildId: "guild-1",
      failedNodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 2,
    }]);

    expect(nodeRegistry.snapshot("primary").available).toBe(true);
    expect(results).toEqual([{ guildId: "guild-1", ok: true }]);
    expect(adapter.playerUpdates.at(-1)).toMatchObject({
      nodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 2,
    });
    expect(repository.assignmentInputs.at(-1)).toEqual({ guildId: "guild-1", nodeId: "primary" });
  });

  it("reports the stable error code when a session cannot be restored", async () => {
    const { adapter, nodeRegistry, service } = setup(queuedSnapshot());
    adapter.player = null;
    adapter.loadResults = [{
      ok: false,
      error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "source down"),
    }];

    const results = await service.recoverOnStartup([{
      guildId: "guild-1",
      failedNodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 2,
    }]);

    expect(results).toEqual([{
      guildId: "guild-1",
      ok: false,
      errorCode: "MUSIC_SOURCE_UNAVAILABLE",
    }]);
    expect(nodeRegistry.snapshot("primary").available).toBe(true);
  });
});
