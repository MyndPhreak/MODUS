import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The prequeue routes still read/write the music module's settings row. The
// real DatabaseService fails fast without DATABASE_URL/R2, so the facade is
// replaced by an in-memory settings store for these tests.
const store = vi.hoisted(() => new Map<string, Record<string, any>>());

vi.mock("../DatabaseService", () => ({
  DatabaseService: class {
    async getModuleSettings(guildId: string, moduleName: string) {
      return store.get(`${guildId}:${moduleName}`) ?? {};
    }
    async setModuleSettings(guildId: string, moduleName: string, settings: Record<string, any>) {
      store.set(`${guildId}:${moduleName}`, settings);
    }
  },
}));

import { registerMusicAPI } from "../MusicAPI";
import { MusicError } from "./errors";
import type {
  CanonicalTrack,
  MusicCommand,
  MusicPlayerState,
  MusicQueueEntry,
  MusicQueueSnapshot,
  MusicResult,
} from "./types";

const GUILD = "123456789012345678";

const track = (id: string, title: string): CanonicalTrack => ({
  id,
  requestedInput: title,
  requestType: "search",
  title,
  artists: ["MODUS"],
  durationMs: 185_000,
  artworkUrl: `https://art.invalid/${id}.jpg`,
  requestedBy: "user-1",
  requestedAt: "2026-08-15T12:00:00.000Z",
  requestedSource: { name: "youtube", uri: `https://youtu.be/${id}` },
  playbackSource: { name: "youtube", identifier: `video-${id}` },
});

const entry = (id: string, position: number, status: MusicQueueEntry["status"] = "ready"): MusicQueueEntry => ({
  id,
  track: track(id, `Song ${id}`),
  position,
  status,
});

const snapshot = (overrides: Partial<MusicQueueSnapshot> = {}): MusicQueueSnapshot => ({
  guildId: GUILD,
  revision: 7,
  entries: [entry("entry-1", 0, "playing"), entry("entry-2", 1), entry("entry-3", 2)],
  currentEntryId: "entry-1",
  repeatMode: "queue",
  volume: 65,
  filters: { equalizer: [{ band: 0, gain: 0.25 }] },
  ...overrides,
});

const playerState = (overrides: Partial<MusicPlayerState> = {}): MusicPlayerState => ({
  guildId: GUILD,
  status: "playing",
  queueRevision: 7,
  nodeId: "node-a",
  currentEntryId: "entry-1",
  positionMs: 42_000,
  ...overrides,
});

class FakeMusicService {
  readonly commands: MusicCommand[] = [];
  /** Consumed in order; falls back to a success result carrying `queue`. */
  readonly responses: MusicResult<MusicQueueSnapshot>[] = [];
  executeError: Error | null = null;

  constructor(
    public queue: MusicQueueSnapshot = snapshot(),
    public state: MusicPlayerState = playerState(),
  ) {}

  async execute(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>> {
    this.commands.push(structuredClone(command));
    if (this.executeError) throw this.executeError;
    return this.responses.shift() ?? { ok: true, value: this.queue };
  }

  async getState(): Promise<MusicPlayerState> {
    return this.state;
  }

  async getQueue(): Promise<MusicQueueSnapshot> {
    return this.queue;
  }

  async isActive(): Promise<boolean> {
    return this.queue.entries.length > 0;
  }

  async shutdown(): Promise<void> {}
}

class FakeEngine {
  readonly loadRequests: any[] = [];
  result: MusicResult<any> = {
    ok: true,
    value: {
      kind: "search",
      candidates: [
        { track: track("found-1", "Found Song"), ephemeralEncodedTrack: "ENCODED_SECRET_TRACK" },
      ],
    },
  };

  on() {}
  off() {}

  async loadTracks(request: any) {
    this.loadRequests.push(request);
    return this.result;
  }
}

function fakeClient(voiceChannelId: string | null) {
  const guild = {
    id: GUILD,
    members: {
      me: {
        voice: {
          channelId: voiceChannelId,
          channel: voiceChannelId ? { id: voiceChannelId, name: "Music Lounge" } : null,
        },
      },
    },
  };
  return {
    guilds: { cache: new Map([[GUILD, guild]]) },
    users: { cache: new Map([["user-1", { id: "user-1", username: "Requester" }]]) },
  };
}

interface Harness {
  base: string;
  service: FakeMusicService;
  engine: FakeEngine;
  close(): Promise<void>;
}

async function harness(options: {
  runtime?: "none";
  queue?: MusicQueueSnapshot;
  state?: MusicPlayerState;
  voiceChannelId?: string | null;
} = {}): Promise<Harness> {
  const service = new FakeMusicService(options.queue ?? snapshot(), options.state ?? playerState());
  const engine = new FakeEngine();
  const runtime =
    options.runtime === "none"
      ? null
      : {
          musicService: service,
          engine,
          advance: async () => ({ ok: true, value: service.queue }),
          start: async () => {},
          shutdown: async () => {},
        };

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  });

  registerMusicAPI(
    server,
    fakeClient(options.voiceChannelId === undefined ? "voice-1" : options.voiceChannelId) as never,
    runtime as never,
  );

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    service,
    engine,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function post(base: string, path: string, body: any = {}, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : {} };
}

async function get(base: string, path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  return { status: response.status, text, body: parsed };
}

let active: Harness | null = null;

beforeEach(() => {
  store.clear();
  delete process.env.BOT_API_SECRET;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await active?.close();
  active = null;
  vi.restoreAllMocks();
});

async function start(options: Parameters<typeof harness>[0] = {}): Promise<Harness> {
  active = await harness(options);
  return active;
}

describe("music API authentication", () => {
  it("rejects music requests that do not carry the shared secret", async () => {
    process.env.BOT_API_SECRET = "shared-secret-value";
    const { base } = await start();

    const denied = await get(base, `/music/state/${GUILD}`);
    expect(denied.status).toBe(401);

    const wrong = await get(base, `/music/state/${GUILD}`, { "X-Bot-Secret": "shared-secret-wrong" });
    expect(wrong.status).toBe(401);
  });

  it("accepts a matching secret and stays open when none is configured", async () => {
    process.env.BOT_API_SECRET = "shared-secret-value";
    const { base } = await start();

    const allowed = await get(base, `/music/state/${GUILD}`, {
      "X-Bot-Secret": "shared-secret-value",
    });
    expect(allowed.status).toBe(200);
  });

  it("leaves non-music routes to the original handler", async () => {
    process.env.BOT_API_SECRET = "shared-secret-value";
    const { base } = await start();

    const health = await get(base, "/health");
    expect(health.status).toBe(200);
    expect(health.text).toBe("OK");
  });
});

describe("music API state", () => {
  it("returns the durable queue with backward-compatible fields plus revision and health", async () => {
    const { base } = await start();

    const { status, body } = await get(base, `/music/state/${GUILD}`);

    expect(status).toBe(200);
    expect(body.isPlaying).toBe(true);
    expect(body.isPaused).toBe(false);
    expect(body.currentTrack).toMatchObject({
      title: "Song entry-1",
      url: "https://youtu.be/entry-1",
      durationMs: 185_000,
      thumbnail: "https://art.invalid/entry-1.jpg",
    });
    // The queue field keeps its legacy meaning: upcoming tracks only.
    expect(body.queue).toHaveLength(2);
    expect(body.queue[0].title).toBe("Song entry-2");
    expect(body.volume).toBe(65);
    expect(body.repeatMode).toBe(2);
    expect(body.progress).toBe(42_000);
    expect(body.totalDuration).toBe(185_000);
    expect(body.voiceChannel).toBe("Music Lounge");

    // New durable fields.
    expect(body.revision).toBe(7);
    expect(body.nodeId).toBe("node-a");
    expect(body.status).toBe("playing");
    expect(body.currentEntryId).toBe("entry-1");
    expect(body.health).toMatchObject({ relay: "online", nodeId: "node-a", errorCode: null });
    expect(body.currentTrack.requestedSource).toEqual({
      name: "youtube",
      uri: "https://youtu.be/entry-1",
    });
    expect(body.currentTrack.playbackSource).toEqual({
      name: "youtube",
      identifier: "video-entry-1",
    });
  });

  it("renders the requester as a name, falling back to the raw id", async () => {
    const uncached = snapshot({
      entries: [{ ...entry("entry-1", 0, "playing"), track: { ...track("entry-1", "Song entry-1"), requestedBy: "user-9" } }],
    });
    const named = await start();
    expect((await get(named.base, `/music/state/${GUILD}`)).body.currentTrack.requestedBy).toBe(
      "Requester",
    );
    await named.close();

    active = await harness({ queue: uncached });
    const { body } = await get(active.base, `/music/state/${GUILD}`);
    expect(body.currentTrack.requestedBy).toBe("user-9");
  });

  it("reports the relay as offline when no music runtime is configured", async () => {
    const { base } = await start({ runtime: "none" });

    const { status, body } = await get(base, `/music/state/${GUILD}`);

    expect(status).toBe(200);
    expect(body.isPlaying).toBe(false);
    expect(body.queue).toEqual([]);
    expect(body.health).toMatchObject({ relay: "offline", errorCode: "MUSIC_RELAY_OFFLINE" });
  });

  it("surfaces the player error code in health", async () => {
    const { base } = await start({
      state: playerState({ status: "unavailable", errorCode: "MUSIC_NODE_CAPACITY" }),
    });

    const { body } = await get(base, `/music/state/${GUILD}`);

    expect(body.health.errorCode).toBe("MUSIC_NODE_CAPACITY");
    expect(body.health.relay).toBe("offline");
  });
});

describe("music API validation", () => {
  it("rejects a volume outside the accepted range", async () => {
    const { base } = await start();

    const { status, body } = await post(base, `/music/volume/${GUILD}`, { volume: 500 });

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("requires the expected revision for remove and reorder", async () => {
    const { base, service } = await start();

    const removed = await post(base, `/music/remove/${GUILD}`, { index: 0 });
    expect(removed.status).toBe(400);

    const reordered = await post(base, `/music/reorder/${GUILD}`, { from: 0, to: 1 });
    expect(reordered.status).toBe(400);

    expect(service.commands).toEqual([]);
  });

  it("rejects an out-of-range queue index", async () => {
    const { base } = await start();

    const { status } = await post(base, `/music/remove/${GUILD}`, {
      index: 9,
      expectedRevision: 7,
    });

    expect(status).toBe(400);
  });
});

describe("music API mutations", () => {
  it("forwards the client revision and resolves the entry id for remove", async () => {
    const { base, service } = await start();

    const { status, body } = await post(base, `/music/remove/${GUILD}`, {
      index: 0,
      expectedRevision: 7,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.removed).toBe("Song entry-2");
    expect(body.revision).toBe(7);
    expect(service.commands).toHaveLength(1);
    expect(service.commands[0]).toMatchObject({
      type: "queue.remove",
      guildId: GUILD,
      expectedRevision: 7,
      entryId: "entry-2",
    });
  });

  it("maps a reorder onto the absolute durable queue position", async () => {
    const { base, service } = await start();

    const { status } = await post(base, `/music/reorder/${GUILD}`, {
      from: 1,
      to: 0,
      expectedRevision: 7,
    });

    expect(status).toBe(200);
    expect(service.commands[0]).toMatchObject({
      type: "queue.move",
      entryId: "entry-3",
      position: 1,
      expectedRevision: 7,
    });
  });

  it("generates an operation id when the caller omits one", async () => {
    const { base, service } = await start();

    await post(base, `/music/skip/${GUILD}`);

    expect(service.commands[0]?.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("reuses a caller-supplied operation id so replays stay idempotent", async () => {
    const { base, service } = await start();

    await post(base, `/music/skip/${GUILD}`, { operationId: "dashboard-op-1" });
    await post(base, `/music/skip/${GUILD}`, { operationId: "dashboard-op-1" });

    expect(service.commands.map((command) => command.operationId)).toEqual([
      "dashboard-op-1",
      "dashboard-op-1",
    ]);
  });

  it("retries a stateless command once against the fresh revision", async () => {
    const { base, service } = await start();
    service.responses.push({
      ok: false,
      error: new MusicError("MUSIC_CONFLICT", "The music queue changed."),
    });

    const { status } = await post(base, `/music/pause/${GUILD}`, { operationId: "op-retry" });

    expect(status).toBe(200);
    expect(service.commands).toHaveLength(2);
    expect(service.commands[1]?.operationId).toBe("op-retry");
  });

  it("returns 409 when the caller's revision is stale", async () => {
    const { base, service } = await start();
    service.responses.push({
      ok: false,
      error: new MusicError("MUSIC_CONFLICT", "The music queue changed."),
    });

    const { status, body } = await post(base, `/music/remove/${GUILD}`, {
      index: 0,
      expectedRevision: 3,
    });

    expect(status).toBe(409);
    expect(body.errorCode).toBe("MUSIC_CONFLICT");
    // A client-supplied revision must never be silently retried.
    expect(service.commands).toHaveLength(1);
  });

  it("returns 503 when the relay is offline", async () => {
    const { base, service } = await start();
    service.responses.push(
      { ok: false, error: new MusicError("MUSIC_RELAY_OFFLINE", "No node.") },
      { ok: false, error: new MusicError("MUSIC_RELAY_OFFLINE", "No node.") },
    );

    const { status, body } = await post(base, `/music/skip/${GUILD}`);

    expect(status).toBe(503);
    expect(body.errorCode).toBe("MUSIC_RELAY_OFFLINE");
  });

  it("returns 503 from every control route when music is not configured", async () => {
    const { base } = await start({ runtime: "none" });

    for (const route of ["skip", "pause", "resume", "stop", "shuffle"]) {
      const { status, body } = await post(base, `/music/${route}/${GUILD}`);
      expect(status).toBe(503);
      expect(body.error).toMatch(/unavailable/i);
    }
  });

  it("returns the new revision on a successful volume change", async () => {
    const { base, service } = await start();

    const { status, body } = await post(base, `/music/volume/${GUILD}`, { volume: 42 });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, volume: 42, revision: 7 });
    expect(service.commands[0]).toMatchObject({ type: "volume", volume: 42 });
  });
});

describe("music API play and search", () => {
  it("enqueues a resolved track using the bot's current voice channel", async () => {
    const { base, service, engine } = await start();

    const { status, body } = await post(base, `/music/play/${GUILD}`, { query: "durable song" });

    expect(status).toBe(200);
    expect(engine.loadRequests[0]).toMatchObject({ guildId: GUILD, input: "durable song" });
    expect(service.commands[0]).toMatchObject({
      type: "play",
      voiceChannelId: "voice-1",
      expectedRevision: 7,
    });
    expect(body.track.title).toBe("Found Song");
    expect(body.revision).toBe(7);
  });

  it("refuses to play when the bot is not in a voice channel", async () => {
    const { base, service } = await start({ voiceChannelId: null });

    const { status, body } = await post(base, `/music/play/${GUILD}`, { query: "durable song" });

    expect(status).toBe(400);
    expect(body.error).toMatch(/voice channel/i);
    expect(service.commands).toEqual([]);
  });

  it("returns canonical search results and never leaks encoded lavalink data", async () => {
    const { base } = await start();

    const { status, body, text } = await post(base, `/music/search/${GUILD}`, {
      query: "durable song",
    });

    expect(status).toBe(200);
    expect(body.results[0]).toMatchObject({
      title: "Found Song",
      url: "https://youtu.be/found-1",
      thumbnail: "https://art.invalid/found-1.jpg",
    });
    expect(body.results[0].requestedSource).toEqual({
      name: "youtube",
      uri: "https://youtu.be/found-1",
    });
    expect(text).not.toContain("ENCODED_SECRET_TRACK");
    expect(text).not.toContain("ephemeralEncodedTrack");
  });

  it("never leaks encoded lavalink data through the state route", async () => {
    const { base } = await start();

    const { text } = await get(base, `/music/state/${GUILD}`);

    expect(text).not.toContain("ENCODED");
    expect(text).not.toContain("ephemeralEncodedTrack");
  });
});

describe("music API error redaction", () => {
  it("does not echo internal failure details to the dashboard", async () => {
    const { base, service } = await start();
    service.executeError = new Error(
      "connect ECONNREFUSED postgres://modus:hunter2@db.internal:5432",
    );

    const { status, text, body } = await post(base, `/music/skip/${GUILD}`);

    expect(status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("ECONNREFUSED");
    expect(body.error).toBeTruthy();
  });

  it("does not echo the shared secret back to the caller", async () => {
    process.env.BOT_API_SECRET = "shared-secret-value";
    const { base } = await start();

    const { text } = await get(base, `/music/state/${GUILD}`, {
      "X-Bot-Secret": "shared-secret-value",
    });

    expect(text).not.toContain("shared-secret-value");
  });
});

describe("music API pre-queue", () => {
  it("stores canonical metadata without encoded lavalink data", async () => {
    const { base } = await start();

    const { status, body } = await post(base, `/music/prequeue-add/${GUILD}`, {
      query: "durable song",
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(store.get(`${GUILD}:music`)?.preQueue?.[0]).toMatchObject({
      title: "Found Song",
      url: "https://youtu.be/found-1",
    });
    expect(JSON.stringify(store.get(`${GUILD}:music`))).not.toContain("ENCODED_SECRET_TRACK");
  });

  it("returns 503 for pre-queue add when music is not configured", async () => {
    const { base } = await start({ runtime: "none" });

    const { status } = await post(base, `/music/prequeue-add/${GUILD}`, { query: "song" });

    expect(status).toBe(503);
  });

  it("keeps pre-queue reads and clears working without a music runtime", async () => {
    store.set(`${GUILD}:music`, { preQueue: [{ title: "Saved", url: "https://youtu.be/saved" }] });
    const { base } = await start({ runtime: "none" });

    const read = await get(base, `/music/prequeue/${GUILD}`);
    expect(read.status).toBe(200);
    expect(read.body.preQueue).toHaveLength(1);

    const cleared = await post(base, `/music/prequeue-clear/${GUILD}`);
    expect(cleared.status).toBe(200);
    expect(store.get(`${GUILD}:music`)?.preQueue).toEqual([]);
  });
});
