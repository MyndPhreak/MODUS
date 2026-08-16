import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createMusicService } from "./index";
import { botHealthResponse, MusicMetrics } from "./MusicMetrics";
import type { MusicStateEvent } from "./MusicRecovery";
import { NodeRegistry, type LavalinkNodeConfig } from "./NodeRegistry";

/**
 * Resolves the `bot` package root from whichever directory the runner started
 * in, so the cutover source assertions work from the workspace root or from
 * `bot/`.
 */
function botRoot(): string {
  let directory = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = path.join(directory, "package.json");
    if (fs.existsSync(manifest)) {
      const parsed = JSON.parse(fs.readFileSync(manifest, "utf-8"));
      if (parsed.name === "bot") return directory;
    }
    if (fs.existsSync(path.join(directory, "bot", "package.json"))) {
      return path.join(directory, "bot");
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Unable to locate the bot package root.");
}

const nodeConfig = (id: string, overrides: Partial<LavalinkNodeConfig> = {}): LavalinkNodeConfig => ({
  id,
  url: `https://${id}.relay.example.com`,
  password: "relay-password",
  region: "us-east",
  capabilities: ["youtube"],
  maxPlayers: 10,
  ...overrides,
});

function nodesJson(...ids: string[]): string {
  return JSON.stringify(ids.map((id) => ({
    id,
    url: `https://${id}.relay.example.com`,
    password: "relay-password",
    region: "us-east",
    capabilities: ["youtube"],
    maxPlayers: 10,
  })));
}

function serviceOptions(environment: NodeJS.ProcessEnv) {
  const logs: Array<{ level: string; message: string }> = [];
  const options = {
    client: { guilds: { cache: new Map() } } as never,
    repository: {} as never,
    redisClients: null,
    eventBus: null,
    shardId: 0,
    environment,
    logger: {
      info: (message: string) => logs.push({ level: "info", message }),
      warn: (message: string) => logs.push({ level: "warn", message }),
      error: (message: string) => logs.push({ level: "error", message }),
    },
  };
  return { options, logs };
}

function metricsOver(registry: NodeRegistry, now: () => number = () => 1_000) {
  return new MusicMetrics({
    shardId: 3,
    nodes: () => registry.snapshots(),
    now,
  });
}

describe("music cutover startup", () => {
  it("fails fast when the node configuration is malformed", () => {
    const { options } = serviceOptions({ LAVALINK_NODES_JSON: "{ not json" });

    expect(() => createMusicService(options as never)).toThrow(
      /LAVALINK_NODES_JSON must be valid JSON/,
    );
  });

  it("fails fast when a node entry is invalid rather than starting without playback", () => {
    const { options } = serviceOptions({
      LAVALINK_NODES_JSON: JSON.stringify([{ id: "primary", url: "not-a-url" }]),
    });

    expect(() => createMusicService(options as never)).toThrow(
      /LAVALINK_NODES_JSON contains an invalid node configuration/,
    );
  });

  it("starts a runtime with metrics when a healthy node is configured", () => {
    const { options } = serviceOptions({ LAVALINK_NODES_JSON: nodesJson("primary") });

    const runtime = createMusicService(options as never);

    expect(runtime).not.toBeNull();
    expect(runtime!.metrics).toBeInstanceOf(MusicMetrics);
    expect(runtime!.metrics.snapshot().nodes.map((node) => node.nodeId)).toEqual(["primary"]);
  });

  it("leaves music disabled without throwing when no node is configured", () => {
    const { options, logs } = serviceOptions({});

    expect(createMusicService(options as never)).toBeNull();
    expect(logs).toEqual([
      { level: "warn", message: expect.stringContaining("LAVALINK_NODES_JSON is not set") },
    ]);
  });
});

describe("music health rollup", () => {
  it("reports healthy while every enabled node is available", () => {
    const registry = new NodeRegistry([nodeConfig("one"), nodeConfig("two")]);
    registry.update("one", { available: true });
    registry.update("two", { available: true });

    expect(metricsOver(registry).health()).toBe("healthy");
  });

  it("reports degraded when only some nodes are available", () => {
    const registry = new NodeRegistry([nodeConfig("one"), nodeConfig("two")]);
    registry.update("one", { available: true });

    expect(metricsOver(registry).health()).toBe("degraded");
  });

  it("reports degraded when an available node is losing frames", () => {
    const registry = new NodeRegistry([nodeConfig("one")]);
    registry.update("one", { available: true, frameLoss: 12 });

    expect(metricsOver(registry).health()).toBe("degraded");
  });

  it("ignores drained nodes so a deliberate drain is not reported as degraded", () => {
    const registry = new NodeRegistry([nodeConfig("one"), nodeConfig("two")]);
    registry.update("one", { available: true });
    registry.setAdministrativeState("two", "draining");

    expect(metricsOver(registry).health()).toBe("healthy");
  });

  it("reports unavailable when every node is down", () => {
    const registry = new NodeRegistry([nodeConfig("one"), nodeConfig("two")]);

    expect(metricsOver(registry).health()).toBe("unavailable");
  });

  it("keeps the bot health probe passing while music is unavailable", () => {
    const registry = new NodeRegistry([nodeConfig("one")]);
    const response = botHealthResponse(0, metricsOver(registry).health());

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("music=unavailable");
  });

  it("reports music as unavailable in the health probe when music is not configured", () => {
    expect(botHealthResponse(2, null)).toEqual({
      statusCode: 200,
      body: "OK (Shard 2) music=unavailable",
    });
  });

  it("degrades on a recent failure and recovers once the window passes", () => {
    const registry = new NodeRegistry([nodeConfig("one")]);
    registry.update("one", { available: true });
    let clock = 1_000;
    const metrics = metricsOver(registry, () => clock);

    metrics.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 4,
      nodeId: "one",
      operationId: "op-1",
      errorCode: "MUSIC_RELAY_OFFLINE",
      status: "unavailable",
    });
    expect(metrics.health()).toBe("degraded");

    clock += 120_000;
    expect(metrics.health()).toBe("healthy");
  });
});

describe("music metrics aggregation", () => {
  function metrics(now: () => number) {
    const registry = new NodeRegistry([nodeConfig("one")]);
    registry.update("one", { available: true, activePlayers: 2, cpuLoad: 0.25, frameLoss: 0 });
    return metricsOver(registry, now);
  }

  it("keys counters by guild, shard, node, revision, operation, source, and error code", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 7,
      nodeId: "one",
      operationId: "b0f2b0a1-0000-4000-8000-000000000000",
      status: "playing",
    });

    expect(recorder.snapshot().counters.commands).toEqual([
      {
        key: {
          guildId: "guild-1",
          shardId: 3,
          nodeId: "one",
          queueRevision: 7,
          operation: "command",
          source: "unknown",
          errorCode: null,
        },
        count: 1,
      },
    ]);
  });

  it("counts queue conflicts separately from other failures", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 7,
      nodeId: "one",
      operationId: "op-conflict",
      errorCode: "MUSIC_CONFLICT",
      status: "unavailable",
    });
    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 7,
      nodeId: "one",
      operationId: "op-nomatch",
      errorCode: "MUSIC_NO_MATCH",
      status: "unavailable",
    });

    const snapshot = recorder.snapshot();
    expect(snapshot.counters.queueConflicts.map((entry) => entry.count)).toEqual([1]);
    expect(snapshot.counters.resolutionFailures.map((entry) => entry.count)).toEqual([1]);
    expect(snapshot.counters.failures.reduce((total, entry) => total + entry.count, 0)).toBe(2);
  });

  it("counts recovery attempts and lease fencing from recovery operations", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 9,
      nodeId: "one",
      operationId: "recover:startup:9",
      status: "playing",
    });
    recorder.recordStateEvent({
      guildId: "guild-2",
      queueRevision: 3,
      nodeId: "one",
      operationId: "recover:two",
      errorCode: "MUSIC_CONFLICT",
      status: "unavailable",
    });

    const snapshot = recorder.snapshot();
    expect(snapshot.counters.recoveryAttempts.reduce((total, entry) => total + entry.count, 0)).toBe(2);
    expect(snapshot.counters.leaseFencings.map((entry) => entry.key.guildId)).toEqual(["guild-2"]);
  });

  it("tracks active players by their latest published status", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({ guildId: "guild-1", queueRevision: 1, nodeId: "one", operationId: "a", status: "playing" });
    recorder.recordStateEvent({ guildId: "guild-2", queueRevision: 1, nodeId: "one", operationId: "b", status: "paused" });
    recorder.recordStateEvent({ guildId: "guild-3", queueRevision: 1, nodeId: "one", operationId: "c", status: "playing" });
    recorder.recordStateEvent({ guildId: "guild-3", queueRevision: 2, nodeId: "one", operationId: "d", status: "idle" });

    const snapshot = recorder.snapshot();
    expect(snapshot.activePlayers).toBe(2);
    expect(snapshot.playersByStatus).toMatchObject({ playing: 1, paused: 1, idle: 1 });
  });

  it("measures command-to-audio latency from the command to the track start", () => {
    let clock = 1_000;
    const recorder = metrics(() => clock);

    recorder.recordStateEvent({ guildId: "guild-1", queueRevision: 1, nodeId: "one", operationId: "play-op", status: "playing" });
    clock += 450;
    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 1,
      nodeId: "one",
      operationId: "playback:track.start",
      status: "playing",
      currentEntryId: "entry-1",
    });

    expect(recorder.snapshot().commandToAudioLatencyMs).toMatchObject({ count: 1, maxMs: 450, averageMs: 450 });
  });

  it("measures the recovery gap between losing audio and playing again", () => {
    let clock = 1_000;
    const recorder = metrics(() => clock);

    recorder.recordStateEvent({ guildId: "guild-1", queueRevision: 1, nodeId: "one", operationId: "play-op", status: "playing" });
    clock += 100;
    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 1,
      nodeId: "one",
      operationId: "playback:node.lost",
      errorCode: "MUSIC_RELAY_OFFLINE",
      status: "unavailable",
    });
    clock += 2_500;
    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 1,
      nodeId: "two",
      operationId: "recover:one",
      status: "playing",
    });

    expect(recorder.snapshot().recoveryGapMs).toMatchObject({ count: 1, maxMs: 2_500 });
  });

  it("reports node load and frame loss from the registry", () => {
    const snapshot = metrics(() => 1_000).snapshot();

    expect(snapshot.nodes).toEqual([
      {
        nodeId: "one",
        available: true,
        administrativeState: "enabled",
        activePlayers: 2,
        maxPlayers: 10,
        playerUtilization: 0.2,
        cpuLoad: 0.25,
        frameLoss: 0,
        lavalinkPenalty: 0,
      },
    ]);
  });

  it("subscribes to the durable music state channel", async () => {
    const recorder = metrics(() => 1_000);
    const subscriptions: string[] = [];
    const handlers: Array<(event: MusicStateEvent) => void> = [];

    const unsubscribe = await recorder.observe({
      async subscribe(channel: string, handler: (event: MusicStateEvent) => void) {
        subscriptions.push(channel);
        handlers.push(handler);
        return async () => {
          subscriptions.push(`unsubscribed:${channel}`);
        };
      },
    });

    expect(subscriptions).toEqual(["modus:realtime:music"]);
    handlers[0]!({ guildId: "guild-1", queueRevision: 1, nodeId: "one", operationId: "op", status: "playing" });
    expect(recorder.snapshot().activePlayers).toBe(1);

    await unsubscribe();
    expect(subscriptions).toContain("unsubscribed:modus:realtime:music");
  });

  it("ignores guilds this shard does not serve", () => {
    const registry = new NodeRegistry([nodeConfig("one")]);
    registry.update("one", { available: true });
    const recorder = new MusicMetrics({
      shardId: 3,
      nodes: () => registry.snapshots(),
      ownsGuild: (guildId) => guildId === "guild-mine",
      now: () => 1_000,
    });

    // The music state channel is fleet-wide: this is another shard's guild.
    recorder.recordStateEvent({ guildId: "guild-theirs", queueRevision: 1, nodeId: "one", operationId: "a", status: "playing" });
    recorder.recordStateEvent({ guildId: "guild-mine", queueRevision: 1, nodeId: "one", operationId: "b", status: "playing" });

    const snapshot = recorder.snapshot();
    expect(snapshot.counters.commands.map((entry) => entry.key.guildId)).toEqual(["guild-mine"]);
    expect(snapshot.activePlayers).toBe(1);
  });

  it("treats a throwing ownership predicate as not ours rather than failing", () => {
    const registry = new NodeRegistry([nodeConfig("one")]);
    registry.update("one", { available: true });
    const recorder = new MusicMetrics({
      shardId: 3,
      nodes: () => registry.snapshots(),
      ownsGuild: () => {
        throw new Error("cache unavailable");
      },
      now: () => 1_000,
    });

    expect(() => recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 1,
      nodeId: "one",
      operationId: "a",
      status: "playing",
    })).not.toThrow();
    expect(recorder.snapshot().counters.commands).toEqual([]);
  });

  it("drains interval counters and latencies on each snapshot", () => {
    let clock = 1_000;
    const recorder = metrics(() => clock);

    recorder.recordStateEvent({ guildId: "guild-1", queueRevision: 1, nodeId: "one", operationId: "play-op", status: "playing" });
    clock += 200;
    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 1,
      nodeId: "one",
      operationId: "playback:track.start",
      status: "playing",
      currentEntryId: "entry-1",
    });

    // One series for the command, one for the playback event it produced.
    const first = recorder.snapshot();
    expect(first.counters.commands.map((entry) => entry.key.operation))
      .toEqual(["command", "playback:track.start"]);
    expect(first.commandToAudioLatencyMs.count).toBe(1);

    const second = recorder.snapshot();
    expect(second.counters.commands).toEqual([]);
    expect(second.counters.failures).toEqual([]);
    expect(second.commandToAudioLatencyMs).toEqual({ count: 0, totalMs: 0, maxMs: 0, averageMs: 0 });
    expect(second.recoveryGapMs).toEqual({ count: 0, totalMs: 0, maxMs: 0, averageMs: 0 });
  });

  it("keeps gauges across a drain so a quiet interval still reports its players", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({ guildId: "guild-1", queueRevision: 1, nodeId: "one", operationId: "a", status: "playing" });
    recorder.snapshot();

    const second = recorder.snapshot();
    expect(second.activePlayers).toBe(1);
    expect(second.playersByStatus).toMatchObject({ playing: 1 });
    expect(second.nodes.map((node) => node.nodeId)).toEqual(["one"]);
    expect(second.health).toBe("healthy");
  });

  it("reports counts since the previous sweep in the status line", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({
      guildId: "guild-1",
      queueRevision: 1,
      nodeId: "one",
      operationId: "a",
      errorCode: "MUSIC_CONFLICT",
      status: "unavailable",
    });

    expect(recorder.statusLine()).toContain("conflicts=1");
    expect(recorder.statusLine()).toContain("conflicts=0");
  });

  it("drops malformed events instead of corrupting the rollup", () => {
    const recorder = metrics(() => 1_000);

    recorder.recordStateEvent({ guildId: "", queueRevision: 1, nodeId: null, operationId: "op" } as never);
    recorder.recordStateEvent(null as never);
    recorder.recordStateEvent({ guildId: "guild-1", queueRevision: Number.NaN, nodeId: null, operationId: "op" } as never);

    expect(recorder.snapshot().counters.commands).toEqual([]);
  });
});

describe("embedded playback engine removal", () => {
  const root = botRoot();

  it("declares no embedded playback dependency", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
    const declared = Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
    });

    expect(declared).not.toContain("discord-player");
    expect(declared).not.toContain("discord-player-youtubei");
    expect(declared).not.toContain("@discord-player/extractor");
    expect(declared).not.toContain("youtube-dl-exec");
    expect(declared).not.toContain("youtubei.js");
    // Recording and TTS still receive and encode Discord voice directly.
    expect(declared).toContain("@discordjs/voice");
  });

  it("no longer ships the yt-dlp stream bridge", () => {
    expect(fs.existsSync(path.join(root, "lib", "ytdlp-stream.ts"))).toBe(false);
  });

  it("contains no embedded playback fallback in bot source", () => {
    const offenders: string[] = [];
    const forbidden = /discord-player|discord-player-youtubei|youtube-dl-exec|youtubei\.js|ytdlp-stream/;

    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "patches") continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        if (full === path.join(root, "music", "cutover.test.ts")) continue;
        if (forbidden.test(fs.readFileSync(full, "utf-8"))) offenders.push(full);
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });

  it("installs no yt-dlp toolchain in the bot image", () => {
    const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf-8");

    expect(dockerfile).not.toMatch(/yt-dlp/);
    expect(dockerfile).not.toMatch(/python3/);
    // Recording and TTS spawn the system FFmpeg binary from PATH.
    expect(dockerfile).toMatch(/\bffmpeg\b/);
  });
});
