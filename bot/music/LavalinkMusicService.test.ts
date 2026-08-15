import { EventEmitter } from "node:events";
import type {
  DurableMusicQueueSnapshot,
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
  playbackSource: { name: "youtube", identifier: "video-1" },
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
  readonly checkpointInputs: MusicCheckpointInput[] = [];
  readonly assignmentInputs: MusicNodeAssignmentInput[] = [];

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
    expect(repository.checkpointInputs.at(-1)).toMatchObject({ expectedRevision: 3, ...expectedCheckpoint });
    expect(adapter.playerUpdates.at(-1)).toMatchObject(expectedUpdate);
    expect(order.indexOf("checkpoint")).toBeLessThan(order.indexOf("assert"));
    expect(order[order.indexOf("dispatch") - 1]).toBe("assert");
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
});
