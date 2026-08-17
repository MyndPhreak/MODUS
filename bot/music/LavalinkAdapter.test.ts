import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicError } from "./errors";
import { LavalinkAdapter } from "./LavalinkAdapter";
import type { MusicPlaybackEvent } from "./LavalinkEvents";
import { NodeRegistry, type LavalinkNodeConfig } from "./NodeRegistry";

const shoukakuMock = vi.hoisted(() => ({
  connectors: [] as Array<{ client: unknown }>,
  instances: [] as Array<EventEmitter & {
    nodes: Map<string, FakeNode>;
    players: Map<string, FakePlayer>;
    connections: Map<string, { guildId: string; disconnect: ReturnType<typeof vi.fn> }>;
    options: Record<string, unknown>;
    joinVoiceChannel: ReturnType<typeof vi.fn>;
    leaveVoiceChannel: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("shoukaku", async () => {
  const { EventEmitter } = await import("node:events");

  class DiscordJS {
    constructor(client: unknown) {
      shoukakuMock.connectors.push({ client });
    }
  }

  class Shoukaku extends EventEmitter {
    readonly nodes = new Map<string, FakeNode>();
    readonly players = new Map<string, FakePlayer>();
    readonly connections = new Map<string, { guildId: string; disconnect: ReturnType<typeof vi.fn> }>();
    readonly joinVoiceChannel = vi.fn();
    readonly leaveVoiceChannel = vi.fn();
    readonly addNode = vi.fn((options: { name: string }) => {
      this.nodes.set(options.name, {
        name: options.name,
        penalties: 0,
        rest: { resolve: vi.fn() },
      });
    });

    constructor(
      public readonly connector: unknown,
      public readonly nodeOptions: unknown[],
      public readonly options: Record<string, unknown>,
    ) {
      super();
      shoukakuMock.instances.push(this);
    }
  }

  return {
    Connectors: { DiscordJS },
    Shoukaku,
  };
});

interface FakeTrack {
  encoded: string;
  info: {
    identifier: string;
    isSeekable: boolean;
    author: string;
    length: number;
    isStream: boolean;
    position: number;
    title: string;
    uri?: string;
    artworkUrl?: string;
    isrc?: string;
    sourceName: string;
  };
  pluginInfo: Record<string, never>;
}

class FakePlayer extends EventEmitter {
  track: string | null = null;
  volume = 100;
  paused = false;
  position = 0;
  filters: Record<string, unknown> = {};
  readonly update = vi.fn(async (payload: Record<string, unknown>) => {
    if (payload.track && typeof payload.track === "object") {
      this.track = (payload.track as { encoded?: string }).encoded ?? null;
    }
    if (typeof payload.volume === "number") this.volume = payload.volume;
    if (typeof payload.paused === "boolean") this.paused = payload.paused;
    if (typeof payload.position === "number") this.position = payload.position;
    if (payload.filters && typeof payload.filters === "object") {
      this.filters = payload.filters as Record<string, unknown>;
    }
  });
  readonly destroy = vi.fn(async () => undefined);
  readonly move = vi.fn(async (nodeId?: string) => {
    if (nodeId) this.node = { ...this.node, name: nodeId };
    return true;
  });

  constructor(
    public readonly guildId: string,
    public node: { name: string },
  ) {
    super();
  }
}

interface FakeNode {
  name: string;
  penalties: number;
  rest: {
    resolve: ReturnType<typeof vi.fn>;
  };
}

const track = (overrides: Partial<FakeTrack["info"]> = {}, encoded = "encoded-secret"): FakeTrack => ({
  encoded,
  info: {
    identifier: "video-123",
    isSeekable: true,
    author: "Artist",
    length: 180_000,
    isStream: false,
    position: 0,
    title: "Song",
    uri: "https://media.example/song?Signature=do-not-log",
    artworkUrl: "https://img.example/art.jpg?token=secret",
    isrc: "US-S1Z-99-00001",
    sourceName: "youtube",
    ...overrides,
  },
  pluginInfo: {},
});

const config = (id: string, overrides: Partial<LavalinkNodeConfig> = {}): LavalinkNodeConfig => ({
  id,
  url: `https://${id}.lavalink.internal:2333`,
  password: `${id}-password-secret`,
  region: "us-east",
  capabilities: ["youtube", "youtube-music", "soundcloud"],
  maxPlayers: 100,
  ...overrides,
});

function setup(nodeConfigs: LavalinkNodeConfig[] = [config("primary")]) {
  const client = { user: { id: "bot-1" }, token: "discord-token-secret" };
  const registry = new NodeRegistry(nodeConfigs);
  for (const nodeConfig of nodeConfigs) {
    registry.update(nodeConfig.id, { available: true });
  }

  const adapter = new LavalinkAdapter(client as never, registry);
  return { adapter, client, registry };
}

function manager() {
  return shoukakuMock.instances.at(-1)!;
}

function addNode(nodeId = "primary") {
  const node: FakeNode = {
    name: nodeId,
    penalties: 0,
    rest: { resolve: vi.fn() },
  };
  manager().nodes.set(nodeId, node);
  return node;
}

describe("LavalinkAdapter", () => {
  beforeEach(() => {
    shoukakuMock.connectors.length = 0;
    shoukakuMock.instances.length = 0;
  });

  it("initializes Shoukaku once with bounded reconnects, library-side player resume, MODUS placement, and node failover disabled", async () => {
    const { adapter, client, registry } = setup([config("primary"), config("secondary")]);

    await adapter.connect();
    await adapter.connect();

    expect(shoukakuMock.connectors).toEqual([{ client }]);
    expect(shoukakuMock.instances).toHaveLength(1);
    expect(manager().options).toMatchObject({
      // Server-side resume stays off — a resumed socket was being rejected by
      // the node after a restart. Library-side resume is the replacement: on
      // reconnect Shoukaku re-PATCHes each live player (track, position,
      // filters, and voice credentials) onto the node's new session, so a
      // Lavalink restart does not silently strand every guild's audio.
      resume: false,
      resumeByLibrary: true,
      reconnectTries: Number.MAX_SAFE_INTEGER,
      reconnectInterval: 5,
      moveOnDisconnect: false,
    });

    registry.update("primary", { activePlayers: 90, lavalinkPenalty: 50 });
    const primary = addNode("primary");
    const secondary = addNode("secondary");
    const resolved = (manager().options.nodeResolver as (nodes: Map<string, FakeNode>) => FakeNode)(manager().nodes);

    expect(resolved).toBe(secondary);
    expect(resolved).not.toBe(primary);
  });

  it("re-adds a node that Shoukaku evicted from its pool on disconnect", async () => {
    // Shoukaku deletes a node from `manager.nodes` when it emits "disconnect",
    // and Node.connect() reaches that path even on a SUCCESSFUL reconnect —
    // `connectError` is never cleared after a failed attempt, so a socket that
    // recovers after one failure is torn down and evicted anyway. Reconnecting
    // the orphaned Node object does not put it back in the pool, so without
    // this the node is gone for the life of the process and placement fails.
    vi.useFakeTimers();
    try {
      const { adapter, registry } = setup();
      await adapter.connect();
      addNode("primary");
      expect(manager().nodes.has("primary")).toBe(true);

      // The real sequence: Node.connect() emits a disconnect that Shoukaku
      // never re-emits at the manager level, its once() listener deletes the
      // node, then connect() rethrows into addNode's .catch, which DOES
      // re-emit as "error". So the eviction is only observable via "error".
      manager().nodes.delete("primary");
      manager().emit("error", "primary", new Error("Websocket closed before a connection was established"));
      expect(registry.snapshot("primary").available).toBe(false);

      await vi.advanceTimersByTimeAsync(5_000);

      expect(manager().addNode).toHaveBeenCalledTimes(1);
      expect(manager().addNode.mock.calls[0]?.[0]).toMatchObject({
        name: "primary",
        url: "primary.lavalink.internal:2333",
        auth: "primary-password-secret",
        secure: true,
        group: "us-east",
      });
      expect(manager().nodes.has("primary")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("repoints live players at the re-added node so library resume uses the new session", async () => {
    // Shoukaku's resumePlayers() selects players by node NAME but resumes them
    // through player.node.rest. Left pointing at the evicted Node, every resume
    // would PATCH the dead node's stale sessionId instead of the new one.
    vi.useFakeTimers();
    try {
      const { adapter } = setup();
      await adapter.connect();
      const evicted = addNode("primary");
      const player = new FakePlayer("guild-1", evicted as unknown as { name: string });
      manager().players.set("guild-1", player);

      manager().nodes.delete("primary");
      manager().emit("error", "primary", new Error("Websocket closed before a connection was established"));
      await vi.advanceTimersByTimeAsync(5_000);

      const readded = manager().nodes.get("primary");
      expect(readded).toBeDefined();
      expect(readded).not.toBe(evicted);
      expect(player.node).toBe(readded);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not re-add a node that is already back in the pool", async () => {
    vi.useFakeTimers();
    try {
      const { adapter } = setup();
      await adapter.connect();
      addNode("primary");

      // A node that is merely reconnecting emits close/error while staying in
      // the pool; those must not spawn duplicate nodes.
      manager().emit("close", "primary", 1006, "socket hang up");
      manager().emit("error", "primary", new Error("ECONNREFUSED"));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(manager().addNode).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses to reconnect after destroy instead of returning a manager with no reconnect probe armed", async () => {
    const { adapter } = setup();

    await adapter.connect();
    expect(shoukakuMock.instances).toHaveLength(1);

    adapter.destroy();
    const reconnected = await adapter.connect();

    expect(reconnected.ok).toBe(false);
    expect(!reconnected.ok && reconnected.error.code).toBe("MUSIC_RELAY_OFFLINE");
    expect(!reconnected.ok && reconnected.error.retryable).toBe(false);
    expect(shoukakuMock.instances).toHaveLength(1);
  });

  it.each([
    ["youtube", "ytsearch:hello world"],
    ["youtube-music", "ytmsearch:hello world"],
    ["soundcloud", "scsearch:hello world"],
  ] as const)("selects the %s search prefix for plain text", async (source, expectedQuery) => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve.mockResolvedValue({ loadType: "search", data: [track()] });

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "hello world",
      requestedBy: "user-1",
      source,
    });

    expect(node.rest.resolve).toHaveBeenCalledWith(expectedQuery);
    expect(result.ok).toBe(true);
  });

  it("falls back to ytmsearch when ytsearch returns empty results", async () => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve
      .mockResolvedValueOnce({ loadType: "empty", data: {} })
      .mockResolvedValueOnce({ loadType: "search", data: [track()] });

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "hello world",
      requestedBy: "user-1",
      source: "youtube",
    });

    expect(node.rest.resolve).toHaveBeenNthCalledWith(1, "ytsearch:hello world");
    expect(node.rest.resolve).toHaveBeenNthCalledWith(2, "ytmsearch:hello world");
    expect(result.ok).toBe(true);
  });

  it("loads direct URLs without a search prefix and strips signed parameters from canonical metadata", async () => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    const signedUrl = "https://media.example/audio?id=42&Signature=secret#fragment";
    node.rest.resolve.mockResolvedValue({ loadType: "track", data: track() });

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: signedUrl,
      requestedBy: "user-1",
      source: "youtube",
    });

    expect(node.rest.resolve).toHaveBeenCalledWith(signedUrl);
    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "track",
        candidates: [{
          ephemeralEncodedTrack: "encoded-secret",
          track: {
            requestedInput: "https://media.example/audio",
            requestType: "url",
            artworkUrl: "https://img.example/art.jpg",
            requestedSource: { name: "youtube", uri: "https://media.example/audio" },
            playbackSource: { name: "youtube", identifier: "video-123" },
          },
        }],
      },
    });
  });

  it("redacts multi-token secret headers and hostile ISRC metadata from canonical candidates", async () => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve.mockResolvedValue({
      loadType: "track",
      data: track({
        title: "Authorization: Bearer bearer-secret",
        author: "Cookie: session=cookie-secret; csrf=csrf-secret",
        isrc: "X-Api-Key: api-key-secret",
      }),
    });

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "https://media.example/audio?Signature=url-secret",
      requestedBy: "user-1",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        candidates: [{
          track: {
            title: "Authorization: [REDACTED]",
            artists: ["Cookie: [REDACTED]"],
            isrc: "X-Api-Key: [REDACTED]",
          },
        }],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/bearer-secret|cookie-secret|csrf-secret|api-key-secret|url-secret/);
  });

  it.each([
    undefined,
    { loadType: "empty", data: {} },
    { loadType: "search", data: [] },
  ])("translates absent and empty load results into MUSIC_NO_MATCH", async (response) => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve.mockResolvedValue(response);

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "nothing",
      requestedBy: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "MUSIC_NO_MATCH", retryable: false }),
    });
  });

  it("normalizes a playlist without retaining the playlist or track encodings in canonical tracks", async () => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve.mockResolvedValue({
      loadType: "playlist",
      data: {
        encoded: "playlist-encoding-secret",
        info: { name: "Hand-picked", selectedTrack: 1 },
        pluginInfo: {},
        tracks: [
          track({ identifier: "one", title: "First" }, "encoded-one"),
          track({ identifier: "two", title: "Second" }, "encoded-two"),
        ],
      },
    });

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "https://music.example/playlist?id=signed",
      requestedBy: "user-1",
      requestType: "playlist",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "playlist",
        playlist: { name: "Hand-picked", selectedTrack: 1 },
        candidates: [
          { ephemeralEncodedTrack: "encoded-one", track: { title: "First", requestType: "playlist" } },
          { ephemeralEncodedTrack: "encoded-two", track: { title: "Second", requestType: "playlist" } },
        ],
      },
    });
    expect(JSON.stringify((result as { value: { candidates: Array<{ track: unknown }> } }).value.candidates.map((item) => item.track)))
      .not.toContain("encoded");
  });

  it("creates a voice player on the assigned node and maps canonical filter payloads", async () => {
    const { adapter } = setup();
    await adapter.connect();
    addNode();
    const player = new FakePlayer("guild-1", { name: "primary" });
    manager().joinVoiceChannel.mockImplementation(async (voice: Record<string, unknown>) => {
      const selected = (manager().options.nodeResolver as (nodes: Map<string, FakeNode>, connection: unknown) => FakeNode)(
        manager().nodes,
        { guildId: voice.guildId },
      );
      player.node = { name: selected.name };
      manager().players.set("guild-1", player);
      return player;
    });

    const result = await adapter.createOrUpdatePlayer({
      guildId: "guild-1",
      nodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 2,
      ephemeralEncodedTrack: "encoded-secret",
      positionMs: 1_500,
      volume: 75,
      paused: true,
      filters: {
        volume: 0.8,
        equalizer: [{ band: 0, gain: 0.25 }],
        timescale: { speed: 1.1, pitch: 0.95 },
        lowPass: { smoothing: 15 },
        ignored: "must-not-reach-lavalink",
      },
    });

    expect(manager().joinVoiceChannel).toHaveBeenCalledWith({
      guildId: "guild-1",
      channelId: "voice-1",
      shardId: 2,
      deaf: true,
      mute: false,
    });
    expect(player.update).toHaveBeenCalledWith({
      track: { encoded: "encoded-secret" },
      position: 1_500,
      volume: 75,
      paused: true,
      filters: {
        volume: 0.8,
        equalizer: [{ band: 0, gain: 0.25 }],
        timescale: { speed: 1.1, pitch: 0.95 },
        lowPass: { smoothing: 15 },
      },
    });
    expect(result).toEqual({
      ok: true,
      value: {
        guildId: "guild-1",
        nodeId: "primary",
        positionMs: 1_500,
        volume: 75,
        paused: true,
        filters: {
          volume: 0.8,
          equalizer: [{ band: 0, gain: 0.25 }],
          timescale: { speed: 1.1, pitch: 0.95 },
          lowPass: { smoothing: 15 },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("encoded-secret");
  });

  it("translates resolution exceptions without exposing passwords, signed URLs, headers, or voice tokens", async () => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve.mockRejectedValue(new Error(
      "Authorization: primary-password-secret; https://media.example/audio?Signature=url-secret; token=voice-token-secret",
    ));

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "hello",
      requestedBy: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "MUSIC_SOURCE_UNAVAILABLE",
        message: "The music source could not be reached.",
        retryable: true,
      }),
    });
    const loggable = JSON.stringify(result);
    expect(loggable).not.toMatch(/primary-password-secret|url-secret|voice-token-secret|Authorization/i);
    expect((result as { error: MusicError }).error.cause).toBeUndefined();
  });

  it("translates Lavalink error load results without exposing their raw exception", async () => {
    const { adapter } = setup();
    await adapter.connect();
    const node = addNode();
    node.rest.resolve.mockResolvedValue({
      loadType: "error",
      data: {
        message: "GET https://signed.example/file?token=secret Authorization: password",
        severity: "fault",
        cause: "voice-token-secret",
      },
    });

    const result = await adapter.loadTracks({
      guildId: "guild-1",
      input: "hello",
      requestedBy: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "MUSIC_SOURCE_UNAVAILABLE", retryable: false }),
    });
    expect(JSON.stringify(result)).not.toMatch(/signed\.example|voice-token-secret|password|Authorization/i);
  });

  it("exposes safe player snapshots and provides controlled transfer and destruction", async () => {
    const { adapter } = setup([config("primary"), config("secondary")]);
    await adapter.connect();
    addNode("primary");
    addNode("secondary");
    const player = new FakePlayer("guild-1", { name: "primary" });
    player.track = "encoded-secret";
    player.position = 250;
    manager().players.set("guild-1", player);
    const connection = { guildId: "guild-1", disconnect: vi.fn() };
    manager().connections.set("guild-1", connection);
    manager().leaveVoiceChannel.mockImplementation(async (guildId: string) => {
      manager().connections.get(guildId)?.disconnect();
      manager().connections.delete(guildId);
      const activePlayer = manager().players.get(guildId);
      await activePlayer?.destroy();
      manager().players.delete(guildId);
    });

    expect(adapter.getPlayer("guild-1")).toEqual({
      guildId: "guild-1",
      nodeId: "primary",
      positionMs: 250,
      volume: 100,
      paused: false,
      filters: {},
    });

    const moved = await adapter.transferPlayer("guild-1", "secondary");
    expect(player.move).toHaveBeenCalledWith("secondary");
    expect(moved).toMatchObject({ ok: true, value: { nodeId: "secondary" } });

    const destroyed = await adapter.destroyPlayer("guild-1");
    expect(manager().leaveVoiceChannel).toHaveBeenCalledWith("guild-1");
    expect(connection.disconnect).toHaveBeenCalledOnce();
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(destroyed).toEqual({ ok: true, value: undefined });
    expect(adapter.getPlayer("guild-1")).toBeNull();
  });

  it("normalizes start, end, stuck, and exception events without raw Lavalink secrets", async () => {
    const { adapter } = setup();
    await adapter.connect();
    addNode();
    const player = new FakePlayer("guild-1", { name: "primary" });
    manager().joinVoiceChannel.mockResolvedValue(player);
    manager().players.set("guild-1", player);
    await adapter.createOrUpdatePlayer({
      guildId: "guild-1",
      nodeId: "primary",
      voiceChannelId: "voice-1",
      shardId: 0,
    });
    const events: MusicPlaybackEvent[] = [];
    adapter.on("playback", (event) => events.push(event));

    player.emit("start", {
      guildId: "guild-1",
      track: track({
        identifier: "https://signed.example/file?Signature=identifier-secret",
        title: "Authorization: Bearer bearer-secret",
        author: "Cookie: session=cookie-secret; csrf=csrf-secret",
        isrc: "X-Api-Key: api-key-secret",
      }),
    });
    player.emit("end", { guildId: "guild-1", track: track(), reason: "finished" });
    player.emit("stuck", { guildId: "guild-1", track: track(), thresholdMs: 10_000 });
    player.emit("exception", {
      guildId: "guild-1",
      exception: {
        message: "https://signed.example/file?token=secret Authorization: password",
        severity: "fault",
        cause: "voice-token-secret",
      },
    });

    expect(events).toMatchObject([
      {
        type: "track.start",
        guildId: "guild-1",
        nodeId: "primary",
        track: {
          identifier: "https://signed.example/file",
          title: "Authorization: [REDACTED]",
          artist: "Cookie: [REDACTED]",
          isrc: "X-Api-Key: [REDACTED]",
        },
      },
      { type: "track.end", guildId: "guild-1", nodeId: "primary", reason: "finished", track: { identifier: "video-123" } },
      {
        type: "track.stuck",
        guildId: "guild-1",
        nodeId: "primary",
        thresholdMs: 10_000,
        error: { code: "MUSIC_SOURCE_UNAVAILABLE", retryable: true },
      },
      {
        type: "track.exception",
        guildId: "guild-1",
        nodeId: "primary",
        error: { code: "MUSIC_SOURCE_UNAVAILABLE", retryable: false },
      },
    ]);
    const loggable = JSON.stringify(events);
    expect(loggable).not.toMatch(
      /identifier-secret|bearer-secret|cookie-secret|csrf-secret|api-key-secret|encoded-secret|voice-token-secret|password|Signature/i,
    );
  });

  it("feeds Shoukaku readiness, disconnects, and raw statistics into NodeRegistry", async () => {
    const { adapter, registry } = setup();
    registry.markUnavailable("primary");
    await adapter.connect();
    addNode();

    manager().emit("ready", "primary", false, false);
    expect(registry.snapshot("primary").available).toBe(true);

    manager().emit("raw", "primary", {
      op: "stats",
      players: 7,
      cpu: { lavalinkLoad: 0.35 },
      frameStats: { deficit: 2, nulled: 3 },
    });
    expect(registry.snapshot("primary")).toMatchObject({
      activePlayers: 7,
      cpuLoad: 0.35,
      frameLoss: 5,
    });

    manager().emit("disconnect", "primary", 0);
    expect(registry.snapshot("primary").available).toBe(false);
  });
});
