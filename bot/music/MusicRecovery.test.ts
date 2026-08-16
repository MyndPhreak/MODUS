import type {
  DurableMusicQueueSnapshot,
  MusicCheckpointInput,
  MusicNodeAssignmentInput,
} from "@modus/db";
import { describe, expect, it } from "vitest";
import { MusicError } from "./errors";
import type {
  LavalinkLoadRequest,
  LavalinkLoadResult,
  LavalinkPlayerSnapshot,
  LavalinkPlayerUpdate,
} from "./LavalinkAdapter";
import { MusicRecovery, type MusicStateEvent } from "./MusicRecovery";
import { NodeRegistry, type LavalinkNodeConfig } from "./NodeRegistry";
import type { CanonicalTrack, MusicResult } from "./types";

const config = (id: string, capabilities = ["youtube"]): LavalinkNodeConfig => ({
  id,
  url: `https://${id}.lavalink.internal:2333`,
  password: "secret",
  region: "us-east",
  capabilities,
  maxPlayers: 100,
});

const canonicalTrack: CanonicalTrack = {
  id: "track-1",
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
};

const durableSnapshot = (): DurableMusicQueueSnapshot => ({
  guildId: "guild-1",
  revision: 8,
  entries: [{
    id: "track-1",
    track: canonicalTrack,
    requesterId: "user-1",
    position: 0,
    status: "playing",
    matchSource: "youtube",
    matchConfidence: 1,
  }],
  currentEntryId: "track-1",
  checkpointPositionMs: 73_000,
  checkpointedAt: new Date("2026-08-15T12:01:13.000Z"),
  repeatMode: "queue",
  volume: 61,
  filters: { timescale: { speed: 1.1 } },
  assignedNodeId: "primary",
});

class FakeRepository {
  readonly assignments: MusicNodeAssignmentInput[] = [];
  readonly checkpoints: MusicCheckpointInput[] = [];
  checkpointResult: boolean | null = null;

  constructor(
    readonly snapshot: DurableMusicQueueSnapshot,
    private readonly order: string[],
  ) {}

  async readSnapshot(): Promise<DurableMusicQueueSnapshot> {
    return structuredClone(this.snapshot);
  }

  async recordNodeAssignment(input: MusicNodeAssignmentInput): Promise<void> {
    this.order.push("assignment");
    this.assignments.push(structuredClone(input));
    this.snapshot.assignedNodeId = input.nodeId;
  }

  async checkpoint(input: MusicCheckpointInput): Promise<boolean> {
    this.order.push("checkpoint");
    this.checkpoints.push(structuredClone(input));
    return this.checkpointResult ?? input.expectedRevision === this.snapshot.revision;
  }
}

class FakeLease {
  fenceCalls = 0;
  renewCalls = 0;
  assertCalls = 0;

  constructor(private readonly order: string[]) {}

  async fenceAndAcquire(): Promise<number> {
    this.order.push("fence");
    this.fenceCalls += 1;
    return 29;
  }

  async renew(): Promise<number> {
    this.order.push("renew");
    this.renewCalls += 1;
    return 29;
  }

  async assertOwner(): Promise<number> {
    this.order.push("assert");
    this.assertCalls += 1;
    return 29;
  }
}

class FakeAdapter {
  readonly loadRequests: LavalinkLoadRequest[] = [];
  readonly transfers: Array<{ guildId: string; nodeId: string }> = [];
  readonly updates: LavalinkPlayerUpdate[] = [];
  loadResults: Array<MusicResult<LavalinkLoadResult>> = [];
  updateResults: Array<MusicResult<LavalinkPlayerSnapshot>> = [];
  materializePlayerOnFailure = false;
  onLoad: (() => void) | null = null;
  onTransfer: (() => void) | null = null;
  player: LavalinkPlayerSnapshot | null = {
    guildId: "guild-1",
    nodeId: "primary",
    positionMs: 72_000,
    volume: 61,
    paused: false,
    filters: { timescale: { speed: 1.1 } },
  };

  constructor(private readonly order: string[]) {}

  getPlayer(): LavalinkPlayerSnapshot | null {
    return this.player ? structuredClone(this.player) : null;
  }

  async loadTracks(request: LavalinkLoadRequest): Promise<MusicResult<LavalinkLoadResult>> {
    this.order.push("resolve");
    this.loadRequests.push(structuredClone(request));
    this.onLoad?.();
    return this.loadResults.shift() ?? {
      ok: true,
      value: {
        kind: "search",
        candidates: [{
          track: { ...canonicalTrack, id: "ephemeral-candidate" },
          ephemeralEncodedTrack: "ephemeral-recovery-secret",
        }],
      },
    };
  }

  async transferPlayer(guildId: string, nodeId: string): Promise<MusicResult<LavalinkPlayerSnapshot>> {
    this.order.push("transfer");
    this.transfers.push({ guildId, nodeId });
    this.player = { ...this.player!, nodeId };
    this.onTransfer?.();
    return { ok: true, value: structuredClone(this.player) };
  }

  async createOrUpdatePlayer(update: LavalinkPlayerUpdate): Promise<MusicResult<LavalinkPlayerSnapshot>> {
    this.order.push("dispatch");
    this.updates.push(structuredClone(update));
    this.player = {
      guildId: update.guildId,
      nodeId: update.nodeId,
      positionMs: update.positionMs ?? 0,
      volume: update.volume ?? 100,
      paused: update.paused ?? false,
      filters: structuredClone(update.filters ?? {}),
    };
    const result = this.updateResults.shift();
    if (result) {
      if (!result.ok && !this.materializePlayerOnFailure) this.player = null;
      return result;
    }
    return { ok: true, value: structuredClone(this.player) };
  }
}

class FakeEventBus {
  readonly events: Array<{ channel: string; payload: MusicStateEvent }> = [];

  async publish(channel: string, payload: MusicStateEvent): Promise<void> {
    this.events.push({ channel, payload: structuredClone(payload) });
  }
}

function setup(nodeConfigs = [config("primary"), config("secondary")]) {
  const order: string[] = [];
  const nodeRegistry = new NodeRegistry(nodeConfigs);
  for (const nodeConfig of nodeConfigs) nodeRegistry.update(nodeConfig.id, { available: true });
  nodeRegistry.markUnavailable("primary");
  const repository = new FakeRepository(durableSnapshot(), order);
  const lease = new FakeLease(order);
  const adapter = new FakeAdapter(order);
  const eventBus = new FakeEventBus();
  const recovery = new MusicRecovery({
    repository,
    nodeRegistry,
    lease,
    adapter,
    eventBus,
    maxAttempts: 3,
    retryDelayMs: 0,
  });
  return { adapter, eventBus, lease, nodeRegistry, order, recovery, repository };
}

describe("MusicRecovery", () => {
  it("rebuilds the player in place when the only healthy node is the one it already sits on", async () => {
    // Single-node deployments (what docker-compose.yml ships) recover onto the
    // same node they failed on. Shoukaku's player.move() returns false when the
    // target node is the current one, so routing this through transferPlayer
    // would report MUSIC_RELAY_OFFLINE for a node that is actually healthy.
    const order: string[] = [];
    const nodeRegistry = new NodeRegistry([config("primary")]);
    nodeRegistry.update("primary", { available: true });
    const repository = new FakeRepository(durableSnapshot(), order);
    const adapter = new FakeAdapter(order);
    const recovery = new MusicRecovery({
      repository,
      nodeRegistry,
      lease: new FakeLease(order),
      adapter,
      eventBus: new FakeEventBus(),
      maxAttempts: 3,
      retryDelayMs: 0,
    });

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      markNodeFailed: false,
      voiceChannelId: "voice-1",
      shardId: 0,
    });

    expect(result.ok).toBe(true);
    expect(adapter.transfers).toEqual([]);
    expect(order).not.toContain("transfer");
    expect(adapter.updates).toHaveLength(1);
    expect(adapter.updates[0]).toMatchObject({
      guildId: "guild-1",
      nodeId: "primary",
      ephemeralEncodedTrack: "ephemeral-recovery-secret",
      positionMs: 73_000,
      volume: 61,
    });
    // The player object still exists, so recovery must not re-join voice.
    expect(adapter.updates[0]?.voiceChannelId).toBeUndefined();
  });

  it("fences failed ownership, selects a compatible node, re-resolves canonical metadata, and restores the existing player", async () => {
    const { adapter, eventBus, lease, order, recovery, repository } = setup([
      config("primary"),
      config("incompatible", ["soundcloud"]),
      config("secondary", ["youtube"]),
    ]);

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 2,
      paused: true,
      operationId: "recover-primary",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { nodeId: "secondary", fencingToken: 29, queue: { revision: 8 } },
    });
    expect(lease.fenceCalls).toBe(1);
    expect(adapter.loadRequests).toEqual([expect.objectContaining({
      guildId: "guild-1",
      input: "Durable Song",
      requestedBy: "user-1",
      requestType: "search",
      source: "youtube",
      nodeId: "secondary",
    })]);
    expect(adapter.transfers).toEqual([{ guildId: "guild-1", nodeId: "secondary" }]);
    expect(adapter.updates).toEqual([{
      guildId: "guild-1",
      nodeId: "secondary",
      ephemeralEncodedTrack: "ephemeral-recovery-secret",
      positionMs: 73_000,
      volume: 61,
      paused: true,
      filters: { timescale: { speed: 1.1 } },
    }]);
    expect(order[order.indexOf("transfer") - 1]).toBe("assert");
    expect(order[order.indexOf("dispatch") - 1]).toBe("assert");
    expect(repository.assignments).toEqual([{ guildId: "guild-1", nodeId: "secondary" }]);
    expect(JSON.stringify([...repository.assignments, ...repository.checkpoints, repository.snapshot]))
      .not.toContain("ephemeral-recovery-secret");
    expect(eventBus.events).toEqual([{
      channel: "modus:realtime:music",
      payload: expect.objectContaining({
        guildId: "guild-1",
        queueRevision: 8,
        nodeId: "secondary",
        operationId: "recover-primary",
      }),
    }]);
  });

  it("coalesces concurrent recovery so it never transfers or creates two players", async () => {
    const { adapter, lease, recovery } = setup();
    let releaseResolution: (() => void) | undefined;
    adapter.loadResults.push(new Promise<void>((resolve) => {
      releaseResolution = resolve;
    }).then(() => ({
      ok: true as const,
      value: {
        kind: "track" as const,
        candidates: [{ track: canonicalTrack, ephemeralEncodedTrack: "encoded-once" }],
      },
    })) as never);

    const input = { guildId: "guild-1", failedNodeId: "primary", operationId: "recover-once" };
    const first = recovery.recoverGuild(input);
    const second = recovery.recoverGuild(input);
    releaseResolution?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(lease.fenceCalls).toBe(1);
    expect(adapter.transfers).toHaveLength(1);
    expect(adapter.updates).toHaveLength(1);
  });

  it("creates one replacement player only when no player survived the failed node", async () => {
    const { adapter, recovery } = setup();
    adapter.player = null;

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 3,
    });

    expect(result.ok).toBe(true);
    expect(adapter.transfers).toHaveLength(0);
    expect(adapter.updates).toEqual([expect.objectContaining({
      voiceChannelId: "voice-1",
      shardId: 3,
    })]);
  });

  it("retains the durable queue and returns MUSIC_RELAY_OFFLINE when no healthy node remains", async () => {
    const { adapter, eventBus, lease, recovery, repository } = setup([config("primary")]);
    const before = structuredClone(repository.snapshot);

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      operationId: "recover-offline",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_RELAY_OFFLINE" } });
    expect(repository.snapshot).toEqual(before);
    expect(repository.assignments).toHaveLength(0);
    expect(lease.fenceCalls).toBe(1);
    expect(adapter.loadRequests).toHaveLength(0);
    expect(adapter.transfers).toHaveLength(0);
    expect(adapter.updates).toHaveLength(0);
    expect(eventBus.events[0]?.payload).toMatchObject({
      guildId: "guild-1",
      queueRevision: 8,
      nodeId: null,
      operationId: "recover-offline",
      errorCode: "MUSIC_RELAY_OFFLINE",
    });
  });

  it("does not resurrect an ended track when the latest checkpoint has no current entry", async () => {
    const { adapter, lease, recovery, repository } = setup();
    repository.snapshot.currentEntryId = null;
    repository.snapshot.checkpointPositionMs = 0;
    adapter.player = null;

    const result = await recovery.recoverGuild({ guildId: "guild-1", failedNodeId: "primary" });

    expect(result).toMatchObject({ ok: true, value: { nodeId: null, fencingToken: null } });
    expect(lease.fenceCalls).toBe(0);
    expect(adapter.loadRequests).toHaveLength(0);
    expect(adapter.updates).toHaveLength(0);
    expect(repository.snapshot.entries).toHaveLength(1);
  });

  it("bounds transient recovery resolution retries without changing sources", async () => {
    const { adapter, recovery } = setup();
    adapter.loadResults.push(
      { ok: false, error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Temporary.", { retryable: true }) },
      { ok: false, error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Temporary.", { retryable: true }) },
    );

    const result = await recovery.recoverGuild({ guildId: "guild-1", failedNodeId: "primary" });

    expect(result.ok).toBe(true);
    expect(adapter.loadRequests).toHaveLength(3);
    expect(adapter.loadRequests.map(({ source }) => source)).toEqual(["youtube", "youtube", "youtube"]);
  });

  it("does not send player-creation fields twice after a partial recovery transport success", async () => {
    const { adapter, recovery } = setup();
    adapter.player = null;
    adapter.materializePlayerOnFailure = true;
    adapter.updateResults.push({
      ok: false,
      error: new MusicError("MUSIC_VOICE_FAILED", "Temporary.", { retryable: true }),
    });

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 3,
    });

    expect(result.ok).toBe(true);
    expect(adapter.updates).toHaveLength(2);
    expect(adapter.updates[0]).toMatchObject({ voiceChannelId: "voice-1", shardId: 3 });
    expect(adapter.updates[1]?.voiceChannelId).toBeUndefined();
    expect(adapter.updates[1]?.shardId).toBeUndefined();
  });

  it("aborts before transfer when the queue revision changes during slow resolution", async () => {
    const { adapter, eventBus, recovery, repository } = setup();
    adapter.onLoad = () => {
      repository.snapshot.revision = 9;
    };

    const result = await recovery.recoverGuild({ guildId: "guild-1", failedNodeId: "primary" });

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_CONFLICT" } });
    expect(adapter.transfers).toHaveLength(0);
    expect(adapter.updates).toHaveLength(0);
    expect(eventBus.events.at(-1)?.payload).toMatchObject({ errorCode: "MUSIC_CONFLICT" });
  });

  it("re-checks revision between transfer and restore", async () => {
    const { adapter, recovery, repository } = setup();
    adapter.onTransfer = () => {
      repository.snapshot.revision = 9;
    };

    const result = await recovery.recoverGuild({ guildId: "guild-1", failedNodeId: "primary" });

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_CONFLICT" } });
    expect(adapter.transfers).toHaveLength(1);
    expect(adapter.updates).toHaveLength(0);
  });

  it("does not report recovery success when the post-restore checkpoint CAS is rejected", async () => {
    const { adapter, recovery, repository } = setup();
    repository.checkpointResult = false;

    const result = await recovery.recoverGuild({ guildId: "guild-1", failedNodeId: "primary" });

    expect(adapter.updates).toHaveLength(1);
    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_CONFLICT" } });
  });

  it("fences active failed ownership before returning an unsupported-source error", async () => {
    const { adapter, lease, recovery, repository } = setup();
    repository.snapshot.entries[0]!.track = {
      ...repository.snapshot.entries[0]!.track,
      requestedSource: { name: "unsupported" },
      playbackSource: { name: "unsupported", identifier: "opaque" },
    };

    const result = await recovery.recoverGuild({ guildId: "guild-1", failedNodeId: "primary" });

    expect(result).toMatchObject({ ok: false, error: { code: "MUSIC_SOURCE_UNAVAILABLE" } });
    expect(lease.fenceCalls).toBe(1);
    expect(lease.renewCalls).toBe(0);
    expect(adapter.loadRequests).toHaveLength(0);
  });

  it("keeps the previous node available when the caller reports no failure", async () => {
    const { adapter, nodeRegistry, recovery } = setup([config("primary")]);
    // A startup restore reuses the node this process just connected to.
    nodeRegistry.update("primary", { available: true });
    adapter.player = null;

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      markNodeFailed: false,
      voiceChannelId: "voice-1",
      shardId: 2,
      operationId: "recover:startup:8",
    });

    expect(nodeRegistry.snapshot("primary").available).toBe(true);
    expect(result).toMatchObject({ ok: true, value: { nodeId: "primary" } });
    expect(adapter.updates[0]).toMatchObject({ nodeId: "primary", voiceChannelId: "voice-1" });
  });

  it("does not resurrect a checkpointed entry that already finished", async () => {
    const { adapter, nodeRegistry, recovery, repository } = setup([config("primary")]);
    nodeRegistry.update("primary", { available: true });
    adapter.player = null;
    repository.snapshot.entries[0]!.status = "failed";

    const result = await recovery.recoverGuild({
      guildId: "guild-1",
      failedNodeId: "primary",
      markNodeFailed: false,
      voiceChannelId: "voice-1",
      shardId: 2,
    });

    expect(result).toMatchObject({ ok: true, value: { nodeId: null, fencingToken: null } });
    expect(adapter.loadRequests).toHaveLength(0);
    expect(adapter.updates).toHaveLength(0);
  });
});
