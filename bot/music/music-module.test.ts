import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/recording", () => ({ activeSessions: new Map<string, unknown>() }));

import { activeSessions as recordingActiveSessions } from "../modules/recording";
import musicModule, { musicSeek, musicSkip, musicStop } from "../modules/music";
import type { MusicPlaybackEvent } from "./LavalinkEvents";
import type {
  CanonicalTrack,
  MusicCommand,
  MusicPlayerState,
  MusicQueueSnapshot,
  MusicResult,
} from "./types";

const track = (id: string, title: string): CanonicalTrack => ({
  id,
  requestedInput: title,
  requestType: "search",
  title,
  artists: ["MODUS"],
  durationMs: 180_000,
  requestedBy: "user-1",
  requestedAt: "2026-08-15T12:00:00.000Z",
  requestedSource: { name: "youtube" },
  playbackSource: { name: "youtube", identifier: `video-${id}` },
});

const snapshot = (overrides: Partial<MusicQueueSnapshot> = {}): MusicQueueSnapshot => ({
  guildId: "guild-1",
  revision: 4,
  entries: [],
  currentEntryId: null,
  repeatMode: "off",
  volume: 50,
  filters: {},
  ...overrides,
});

const playerState = (overrides: Partial<MusicPlayerState> = {}): MusicPlayerState => ({
  guildId: "guild-1",
  status: "playing",
  queueRevision: 4,
  nodeId: "local",
  currentEntryId: "entry-1",
  positionMs: 30_000,
  ...overrides,
});

class FakeMusicService {
  readonly commands: MusicCommand[] = [];
  readonly failures = new Map<MusicCommand["type"], MusicResult<MusicQueueSnapshot>>();

  constructor(
    public queue: MusicQueueSnapshot = snapshot(),
    public state: MusicPlayerState = playerState(),
  ) {}

  async execute(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>> {
    this.commands.push(structuredClone(command));
    return this.failures.get(command.type) ?? { ok: true, value: this.queue };
  }

  async getState(): Promise<MusicPlayerState> {
    return this.state;
  }

  async getQueue(): Promise<MusicQueueSnapshot> {
    return this.queue;
  }

  async isActive(): Promise<boolean> {
    return this.queue.entries.length > 0 || this.queue.currentEntryId !== null;
  }

  async shutdown(): Promise<void> {}
}

class FakeEngine extends EventEmitter {
  readonly loadRequests: unknown[] = [];
  result: MusicResult<{ kind: "track" | "search" | "playlist"; candidates: Array<{ track: CanonicalTrack; ephemeralEncodedTrack: string }> }> = {
    ok: true,
    value: {
      kind: "search",
      candidates: [{ track: track("track-1", "Durable Song"), ephemeralEncodedTrack: "ENCODED" }],
    },
  };

  async loadTracks(request: unknown) {
    this.loadRequests.push(request);
    return this.result;
  }
}

interface Harness {
  moduleManager: any;
  service: FakeMusicService;
  engine: FakeEngine;
  settings: Record<string, any>;
  savedSettings: Record<string, any>[];
  nicknames: (string | null)[];
  sent: any[];
  advanced: string[];
}

function createHarness(overrides: { queue?: MusicQueueSnapshot; state?: MusicPlayerState } = {}): Harness {
  const service = new FakeMusicService(overrides.queue ?? snapshot(), overrides.state ?? playerState());
  const engine = new FakeEngine();
  const settings: Record<string, any> = {
    defaultVolume: 50,
    djRoleId: "",
    updateNickname: true,
    maxQueueSize: 200,
    activeFilters: [],
  };
  const savedSettings: Record<string, any>[] = [];
  const nicknames: (string | null)[] = [];
  const sent: any[] = [];
  const advanced: string[] = [];

  const guild = {
    id: "guild-1",
    name: "Test Guild",
    members: {
      me: {
        async setNickname(value: string | null) {
          nicknames.push(value);
        },
      },
    },
  };

  const moduleManager = {
    client: { guilds: { cache: new Map([["guild-1", guild]]) } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    music: {
      musicService: service,
      engine,
      async advance(guildId: string) {
        advanced.push(guildId);
        return { ok: true, value: service.queue };
      },
      async start() {},
      async shutdown() {},
    },
    databaseService: {
      async getModuleSettings() {
        return settings;
      },
      async setModuleSettings(_guildId: string, _module: string, value: Record<string, any>) {
        savedSettings.push(structuredClone(value));
        Object.assign(settings, value);
      },
      async subscribeToGuildConfigs() {},
    },
  };

  return { moduleManager, service, engine, settings, savedSettings, nicknames, sent, advanced };
}

class FakeInteraction {
  deferred = false;
  readonly replies: any[] = [];
  readonly channel: any;

  constructor(
    public commandName: string,
    private readonly optionValues: Record<string, string | number | boolean> = {},
    private readonly inVoice = true,
    public guildId: string | null = "guild-1",
    sink: any[] = [],
  ) {
    this.channel = {
      id: "channel-1",
      async send(payload: any) {
        sink.push(payload);
        return { id: "message-1", async edit() {} };
      },
    };
  }

  readonly user = { id: "user-1", tag: "user#0001", toString: () => "<@user-1>" };
  readonly guild = { id: "guild-1", name: "Test Guild" };

  get member() {
    return {
      id: "user-1",
      voice: this.inVoice ? { channel: { id: "voice-1" } } : {},
    };
  }

  readonly options = {
    getString: (name: string, _required?: boolean) => (this.optionValues[name] as string) ?? null,
    getInteger: (name: string, _required?: boolean) => (this.optionValues[name] as number) ?? null,
    getBoolean: (name: string) =>
      this.optionValues[name] === undefined ? null : (this.optionValues[name] as boolean),
    getFocused: () => ({ name: "query", value: String(this.optionValues.query ?? "") }),
  };

  async deferReply() {
    this.deferred = true;
  }

  async editReply(payload: any) {
    this.replies.push(payload);
    return {
      id: "message-1",
      createMessageComponentCollector: () => ({ on: () => undefined }),
      async edit() {},
    };
  }

  get lastReply(): any {
    return this.replies[this.replies.length - 1];
  }
}

async function run(
  harness: Harness,
  commandName: string,
  options: Record<string, string | number | boolean> = {},
  inVoice = true,
): Promise<FakeInteraction> {
  const interaction = new FakeInteraction(commandName, options, inVoice, "guild-1", harness.sent);
  await musicModule.execute(interaction as any, harness.moduleManager);
  return interaction;
}

function commandsOfType<T extends MusicCommand["type"]>(
  service: FakeMusicService,
  type: T,
): Array<Extract<MusicCommand, { type: T }>> {
  return service.commands.filter((command) => command.type === type) as Array<
    Extract<MusicCommand, { type: T }>
  >;
}

beforeEach(() => {
  recordingActiveSessions.clear();
});

describe("music module command handlers", () => {
  it("resolves a play query and dispatches one play command at the current revision", async () => {
    const harness = createHarness();
    const interaction = await run(harness, "play", { query: "Durable Song" });

    expect(harness.engine.loadRequests).toEqual([
      expect.objectContaining({ guildId: "guild-1", input: "Durable Song", requestedBy: "user-1" }),
    ]);
    const plays = commandsOfType(harness.service, "play");
    expect(plays).toHaveLength(1);
    expect(plays[0]!.track.title).toBe("Durable Song");
    expect(plays[0]!.voiceChannelId).toBe("voice-1");
    expect(plays[0]!.expectedRevision).toBe(4);
    expect(plays[0]!.operationId).toBeTruthy();
    expect(interaction.lastReply.content).toBe("🎵 Loading track...");
  });

  it("refuses to play when the requester is not in a voice channel", async () => {
    const harness = createHarness();
    const interaction = await run(harness, "play", { query: "Durable Song" }, false);

    expect(interaction.lastReply.content).toBe("❌ You need to be in a voice channel!");
    expect(harness.service.commands).toHaveLength(0);
  });

  it("keeps the recording exclusion wording and never dispatches playback", async () => {
    const harness = createHarness();
    recordingActiveSessions.set("guild-1", {} as never);

    const interaction = await run(harness, "play", { query: "Durable Song" });

    expect(interaction.lastReply.content).toContain("A recording is currently active in this server");
    expect(harness.service.commands).toHaveLength(0);
  });

  it("enforces the configured maximum queue size", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [
          { id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" },
          { id: "entry-2", track: track("entry-2", "Two"), position: 1, status: "ready" },
        ],
      }),
    });
    harness.settings.maxQueueSize = 2;

    const interaction = await run(harness, "play", { query: "Durable Song" });

    expect(interaction.lastReply.content).toBe(
      "⚠️ Queue limit reached (2 tracks). Remove some tracks first.",
    );
    expect(commandsOfType(harness.service, "play")).toHaveLength(0);
  });

  it("pauses and refuses to pause twice", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });

    const paused = await run(harness, "pause");
    expect(commandsOfType(harness.service, "pause")).toHaveLength(1);
    expect(paused.lastReply.content).toBe("⏸️ Paused.");

    harness.service.state = playerState({ status: "paused" });
    const again = await run(harness, "pause");
    expect(again.lastReply.content).toBe("⚠️ Already paused.");
    expect(commandsOfType(harness.service, "pause")).toHaveLength(1);
  });

  it("resumes only from a paused player", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
      state: playerState({ status: "paused" }),
    });

    const resumed = await run(harness, "resume");
    expect(commandsOfType(harness.service, "resume")).toHaveLength(1);
    expect(resumed.lastReply.content).toBe("▶️ Resumed.");

    harness.service.state = playerState({ status: "playing" });
    const again = await run(harness, "resume");
    expect(again.lastReply.content).toBe("⚠️ Not paused.");
    expect(commandsOfType(harness.service, "resume")).toHaveLength(1);
  });

  it("skips the current track and reports its title", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "Durable Song"), position: 0, status: "playing" }],
      }),
    });

    const interaction = await run(harness, "skip");

    expect(commandsOfType(harness.service, "skip")).toHaveLength(1);
    expect(interaction.lastReply.content).toBe("⏭️ Skipped **Durable Song**.");
  });

  it("stops playback, clears the queue, and resets the nickname", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });

    const interaction = await run(harness, "stop");

    expect(commandsOfType(harness.service, "stop")).toHaveLength(1);
    expect(interaction.lastReply.content).toBe("⏹️ Stopped playback and cleared the queue.");
    expect(harness.nicknames).toContain(null);
  });

  it("sets the volume once and persists it as the guild default", async () => {
    const harness = createHarness({
      queue: snapshot({
        volume: 50,
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });

    const interaction = await run(harness, "volume", { level: 80 });

    const volumes = commandsOfType(harness.service, "volume");
    expect(volumes).toHaveLength(1);
    expect(volumes[0]!.volume).toBe(80);
    expect(harness.savedSettings.at(-1)?.defaultVolume).toBe(80);
    expect(interaction.lastReply.content).toContain("80%");
  });

  it("sets the repeat mode from the loop command", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });

    const interaction = await run(harness, "loop", { mode: "track" });

    const repeats = commandsOfType(harness.service, "repeat");
    expect(repeats).toHaveLength(1);
    expect(repeats[0]!.repeatMode).toBe("track");
    expect(interaction.lastReply.content).toBe("🔁 Loop mode set to **track**.");
  });

  it("shuffles the durable queue and refuses when there is nothing to shuffle", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [
          { id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" },
          { id: "entry-2", track: track("entry-2", "Two"), position: 1, status: "ready" },
        ],
      }),
    });

    const shuffled = await run(harness, "shuffle");
    expect(commandsOfType(harness.service, "queue.shuffle")).toHaveLength(1);
    expect(shuffled.lastReply.content).toBe("🔀 Queue shuffled!");

    harness.service.queue = snapshot({
      currentEntryId: "entry-1",
      entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
    });
    const refused = await run(harness, "shuffle");
    expect(refused.lastReply.content).toBe("⚠️ Not enough tracks to shuffle.");
    expect(commandsOfType(harness.service, "queue.shuffle")).toHaveLength(1);
  });

  it("translates a saved filter choice into a Lavalink filter command", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });

    await run(harness, "filter", { effect: "nightcore", save: true });

    const filters = commandsOfType(harness.service, "filters");
    expect(filters).toHaveLength(1);
    expect(filters[0]!.filters).toHaveProperty("timescale");
    expect(harness.savedSettings.at(-1)?.activeFilters).toEqual(["nightcore"]);
  });

  it("loads the dashboard pre-queue and clears it afterwards", async () => {
    const harness = createHarness();
    harness.settings.preQueue = [
      { title: "First", url: "https://example.com/first" },
      { title: "Second", url: "https://example.com/second" },
    ];

    const interaction = await run(harness, "playqueue");

    expect(harness.engine.loadRequests).toHaveLength(2);
    expect(commandsOfType(harness.service, "play")).toHaveLength(2);
    expect(harness.savedSettings.at(-1)?.preQueue).toEqual([]);
    expect(JSON.stringify(interaction.lastReply)).toContain("Dashboard Queue Loaded");
  });

  it("reports an empty dashboard pre-queue without dispatching playback", async () => {
    const harness = createHarness();
    harness.settings.preQueue = [];

    const interaction = await run(harness, "playqueue");

    expect(interaction.lastReply.content).toContain("No songs in the dashboard queue");
    expect(harness.service.commands).toHaveLength(0);
  });

  it("renders the durable queue for the queue command", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [
          { id: "entry-1", track: track("entry-1", "Now Song"), position: 0, status: "playing" },
          { id: "entry-2", track: track("entry-2", "Next Song"), position: 1, status: "ready" },
        ],
      }),
    });

    const interaction = await run(harness, "queue");

    expect(JSON.stringify(interaction.lastReply)).toContain("Next Song");
  });

  it("seeks through the music service", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });

    const result = await musicSeek("guild-1", 42_000, harness.moduleManager);

    expect(result.ok).toBe(true);
    const seeks = commandsOfType(harness.service, "seek");
    expect(seeks).toHaveLength(1);
    expect(seeks[0]!.positionMs).toBe(42_000);
    expect(seeks[0]!.expectedRevision).toBe(4);
  });

  it("exposes interaction-free skip and stop actions for the AI router", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "Durable Song"), position: 0, status: "playing" }],
      }),
    });

    const skipped = await musicSkip("guild-1", harness.moduleManager);
    expect(skipped.ok).toBe(true);
    expect(commandsOfType(harness.service, "skip")).toHaveLength(1);

    const stopped = await musicStop("guild-1", harness.moduleManager);
    expect(stopped.ok).toBe(true);
    expect(commandsOfType(harness.service, "stop")).toHaveLength(1);
  });

  it("surfaces a stable music error code instead of throwing", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "One"), position: 0, status: "playing" }],
      }),
    });
    harness.service.failures.set("pause", {
      ok: false,
      error: Object.assign(new Error("relay offline"), { code: "MUSIC_RELAY_OFFLINE", retryable: true }) as never,
    });

    const interaction = await run(harness, "pause");

    expect(String(interaction.lastReply.content)).toContain("❌");
  });
});

describe("music module playback events", () => {
  it("updates the nickname and announces the track when playback starts", async () => {
    const harness = createHarness({
      queue: snapshot({
        currentEntryId: "entry-1",
        entries: [{ id: "entry-1", track: track("entry-1", "Durable Song"), position: 0, status: "playing" }],
      }),
    });
    await musicModule.registerEvents!(harness.moduleManager);
    await run(harness, "play", { query: "Durable Song" });

    const event: MusicPlaybackEvent = {
      type: "track.start",
      guildId: "guild-1",
      nodeId: "local",
      track: {
        identifier: "video-entry-1",
        title: "Durable Song",
        artist: "MODUS",
        durationMs: 180_000,
        sourceName: "youtube",
      },
    };
    harness.engine.emit("playback", event);
    await new Promise((resolve) => setImmediate(resolve));

    expect(harness.nicknames).toContain("🎵 Durable Song");
  });

  it("resets the nickname when the durable queue finishes", async () => {
    const harness = createHarness({ queue: snapshot({ currentEntryId: null, entries: [] }) });
    await musicModule.registerEvents!(harness.moduleManager);

    const event: MusicPlaybackEvent = {
      type: "track.end",
      guildId: "guild-1",
      nodeId: "local",
      reason: "finished",
      track: {
        identifier: "video-entry-1",
        title: "Durable Song",
        artist: "MODUS",
        durationMs: 180_000,
        sourceName: "youtube",
      },
    };
    harness.engine.emit("playback", event);
    await new Promise((resolve) => setImmediate(resolve));

    expect(harness.advanced).toEqual(["guild-1"]);
    expect(harness.nicknames).toContain(null);
  });
});
