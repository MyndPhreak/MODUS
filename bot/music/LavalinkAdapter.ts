import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Client } from "discord.js";
import {
  Connectors,
  Shoukaku,
  type Connection,
  type FilterOptions,
  type Node,
  type Player,
  type ShoukakuEvents,
  type Track,
} from "shoukaku";
import { MusicError, type MusicErrorCode } from "./errors";
import type { LavalinkAdapterEventMap, MusicPlaybackEvent, MusicPlaybackTrack } from "./LavalinkEvents";
import { NodeRegistry, type NodeSelectionRequest } from "./NodeRegistry";
import type { CanonicalTrack, LyricsData, MusicFilters, MusicResult, MusicSource } from "./types";
import { fetchLrclibLyrics, normalizeLavaLyrics } from "./lyrics";

export type LavalinkSearchSource = "youtube" | "youtube-music" | "soundcloud";

export interface LavalinkLoadRequest {
  guildId: string;
  input: string;
  requestedBy: string;
  requestType?: CanonicalTrack["requestType"];
  source?: LavalinkSearchSource;
  nodeId?: string;
  region?: string;
}

export interface LavalinkTrackCandidate {
  track: CanonicalTrack;
  /** Ephemeral Lavalink data. It must never be written to durable state. */
  ephemeralEncodedTrack: string;
}

export interface LavalinkLoadResult {
  kind: "track" | "search" | "playlist";
  candidates: LavalinkTrackCandidate[];
  playlist?: {
    name: string;
    selectedTrack: number;
  };
}

export interface LavalinkPlayerSnapshot {
  guildId: string;
  nodeId: string;
  positionMs: number;
  volume: number;
  paused: boolean;
  filters: MusicFilters;
}

export interface LavalinkPlayerUpdate {
  guildId: string;
  nodeId: string;
  voiceChannelId?: string;
  shardId?: number;
  ephemeralEncodedTrack?: string;
  positionMs?: number;
  volume?: number;
  paused?: boolean;
  filters?: MusicFilters;
}

const SEARCH_PREFIX: Record<LavalinkSearchSource, string> = {
  youtube: "ytsearch",
  "youtube-music": "ytmsearch",
  soundcloud: "scsearch",
};

const SOURCE_UNAVAILABLE_MESSAGE = "The music source could not be reached.";
const RELAY_UNAVAILABLE_MESSAGE = "The Lavalink relay is unavailable.";
const VOICE_UNAVAILABLE_MESSAGE = "The Discord voice player could not be updated.";

type NumericRecord = Record<string, number>;
type FilterInput = Partial<Record<keyof FilterOptions, unknown>>;

function ok<T>(value: T): MusicResult<T> {
  return { ok: true, value };
}

function failure<T>(
  code: MusicErrorCode,
  message: string,
  retryable = false,
): MusicResult<T> {
  return { ok: false, error: new MusicError(code, message, { retryable }) };
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";

    const host = parsed.hostname.toLowerCase();
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      const v = parsed.searchParams.get("v");
      const list = parsed.searchParams.get("list");
      parsed.search = "";
      if (v) parsed.searchParams.set("v", v);
      if (list) parsed.searchParams.set("list", list);
    } else {
      parsed.search = "";
    }

    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "" : "/");
  } catch {
    return undefined;
  }
}

function isDirectUrl(input: string): boolean {
  return safeUrl(input) !== undefined;
}

function redactText(value: string): string {
  const withoutSignedUrls = value.replace(/https?:\/\/[^\s]+/gi, (url) => safeUrl(url) ?? "[REDACTED]");
  return withoutSignedUrls
    .replace(
      /\b([a-z0-9-]*(?:authorization|cookie|api-key|access-key|auth-token|access-token|secret|password|token)[a-z0-9-]*)\s*:\s*[^\r\n]*/gi,
      "$1: [REDACTED]",
    )
    .replace(/\b(token|password|secret|signature|x-amz-signature)\s*=\s*[^\s;,]+/gi, "$1=[REDACTED]");
}

function safeIdentifier(value: string): string {
  return safeUrl(value) ?? redactText(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericSettings(value: unknown, keys: readonly string[]): NumericRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const result: NumericRecord = {};
  for (const key of keys) {
    const setting = (value as Record<string, unknown>)[key];
    if (finiteNumber(setting)) result[key] = setting;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function nullableNumericSettings(value: unknown, keys: readonly string[]): NumericRecord | null | undefined {
  if (value === null) return null;
  return numericSettings(value, keys);
}

function toFilterOptions(filters: FilterInput | undefined): FilterOptions | undefined {
  if (!filters) return undefined;

  const result: FilterOptions = {};
  if (finiteNumber(filters.volume)) result.volume = filters.volume;

  if (Array.isArray(filters.equalizer)) {
    const equalizer = filters.equalizer.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const { band, gain } = candidate as Record<string, unknown>;
      return finiteNumber(band) && finiteNumber(gain) ? [{ band, gain }] : [];
    });
    if (equalizer.length > 0) result.equalizer = equalizer;
  }

  result.karaoke = nullableNumericSettings(filters.karaoke, ["level", "monoLevel", "filterBand", "filterWidth"]);
  result.timescale = nullableNumericSettings(filters.timescale, ["speed", "pitch", "rate"]);
  result.tremolo = nullableNumericSettings(filters.tremolo, ["frequency", "depth"]);
  result.vibrato = nullableNumericSettings(filters.vibrato, ["frequency", "depth"]);
  result.rotation = nullableNumericSettings(filters.rotation, ["rotationHz"]);
  result.distortion = nullableNumericSettings(filters.distortion, [
    "sinOffset", "sinScale", "cosOffset", "cosScale", "tanOffset", "tanScale", "offset", "scale",
  ]);
  result.channelMix = nullableNumericSettings(filters.channelMix, [
    "leftToLeft", "leftToRight", "rightToLeft", "rightToRight",
  ]);
  result.lowPass = nullableNumericSettings(filters.lowPass, ["smoothing"]);

  for (const key of Object.keys(result) as Array<keyof FilterOptions>) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

function playbackTrack(track: Track): MusicPlaybackTrack {
  return {
    identifier: safeIdentifier(track.info.identifier),
    title: redactText(track.info.title),
    artist: redactText(track.info.author),
    durationMs: track.info.length,
    sourceName: redactText(track.info.sourceName),
    ...(track.info.isrc ? { isrc: redactText(track.info.isrc) } : {}),
  };
}

/**
 * Contains Shoukaku at the Lavalink boundary. Public values deliberately omit
 * encoded tracks, media URLs, REST headers, node passwords, and voice tokens.
 */
export class LavalinkAdapter extends EventEmitter {
  readonly #client: Client;
  readonly #registry: NodeRegistry;
  #manager: Shoukaku | null = null;
  readonly #requestedNodes = new Map<string, string>();
  readonly #boundPlayers = new WeakSet<object>();
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #destroyed = false;

  constructor(client: Client, registry: NodeRegistry) {
    super();
    this.#client = client;
    this.#registry = registry;
  }

  override on<K extends keyof LavalinkAdapterEventMap>(
    eventName: K,
    listener: (...args: LavalinkAdapterEventMap[K]) => void,
  ): this {
    return super.on(eventName, listener);
  }

  override emit<K extends keyof LavalinkAdapterEventMap>(
    eventName: K,
    ...args: LavalinkAdapterEventMap[K]
  ): boolean {
    return super.emit(eventName, ...args);
  }

  async connect(): Promise<MusicResult<void>> {
    if (this.#destroyed) return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE);
    if (this.#manager) return ok(undefined);

    try {
      const nodes = this.#registry.snapshots().map((snapshot) => {
        const config = this.#registry.getConfig(snapshot.id);
        const parsed = new URL(config.url);
        const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
        return {
          name: config.id,
          url: `${parsed.host}${path}`,
          auth: config.password,
          secure: parsed.protocol === "https:",
          group: config.region,
        };
      });

      const manager = new Shoukaku(new Connectors.DiscordJS(this.#client), nodes, {
        // Server-side resume stays off: a resumed socket was being rejected by
        // the node after a restart. Library-side resume is the replacement —
        // when a node reconnects, Shoukaku re-PATCHes every live player (track,
        // position, filters, volume, and the current voice credentials) onto
        // the node's new session. Without it a Lavalink restart leaves this
        // process holding players bound to a session that no longer exists, and
        // every affected guild goes silent until someone issues a new command.
        // It re-uses the existing Discord voice connection, so the bot never
        // leaves the channel and no spurious voiceStateUpdate is raised.
        resume: false,
        resumeTimeout: 30,
        resumeByLibrary: true,
        reconnectTries: Number.MAX_SAFE_INTEGER,
        reconnectInterval: 5,
        restTimeout: 30,
        moveOnDisconnect: false,
        voiceConnectionTimeout: 15,
        nodeResolver: (availableNodes, connection) => this.#resolveNode(availableNodes, connection),
      });
      this.#manager = manager;
      this.#bindManagerEvents(manager);
      if (this.#client.isReady() && manager.nodes.size === 0) {
        manager.id = this.#client.user?.id ?? null;
        for (const node of nodes) {
          manager.addNode(node);
        }
      }

      if (!this.#heartbeatTimer) {
        this.#heartbeatTimer = setInterval(async () => {
          if (!this.#manager || !this.#client.isReady()) return;
          for (const snapshot of this.#registry.snapshots()) {
            const node = this.#manager.nodes.get(snapshot.id);
            if (!node || (node.state as number) !== 1 /* CONNECTED */) {
              const nodeConfig = this.#registry.getConfig(snapshot.id);
              if (nodeConfig) {
                try {
                  const checkUrl = `${nodeConfig.url.replace(/\/$/, "")}/version`;
                  const res = await fetch(checkUrl, {
                    headers: { Authorization: nodeConfig.password },
                    signal: AbortSignal.timeout(2000),
                  });
                  if (res.ok) {
                    if (!this.#manager.nodes.has(snapshot.id)) {
                      console.log(`[Music] Lavalink node "${snapshot.id}" REST is healthy — re-adding to connection pool...`);
                      const parsed = new URL(nodeConfig.url);
                      const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
                      this.#manager.addNode({
                        name: nodeConfig.id,
                        url: `${parsed.host}${path}`,
                        auth: nodeConfig.password,
                        secure: parsed.protocol === "https:",
                        group: nodeConfig.region,
                      });
                    } else if ((node!.state as number) !== 1) {
                      console.log(`[Music] Lavalink node "${snapshot.id}" REST is healthy — reconnecting WebSocket...`);
                      const nodeAny = node as any;
                      nodeAny.cleanupWebsocket();
                      nodeAny.state = 3 /* DISCONNECTED */;
                      node!.connect().catch(() => {});
                    }
                  }
                } catch {
                  // Node host is still starting up or unreachable
                }
              }
            }
          }
        }, 5_000);
        this.#heartbeatTimer.unref();
      }

      return ok(undefined);
    } catch {
      return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
    }
  }

  /**
   * Stops the reconnect probe and retires this adapter. The Shoukaku sockets
   * are deliberately left for process exit to reap: Shoukaku's own close
   * handler reconnects unconditionally — it does not honour the DISCONNECTING
   * state — so an explicit node.disconnect() paired with our unbounded
   * reconnectTries would start a reconnect storm inside the shutdown window.
   * The destroyed flag exists so a connect() after this cannot hand back a
   * manager whose heartbeat is no longer armed.
   */
  destroy(): void {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    this.#destroyed = true;
  }

  async loadTracks(request: LavalinkLoadRequest): Promise<MusicResult<LavalinkLoadResult>> {
    const manager = this.#manager;
    if (!manager) return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);

    const source = request.source ?? "youtube";
    const selected = this.#selectNode(manager.nodes, {
      guildId: request.guildId,
      assignedNodeId: request.nodeId,
      region: request.region,
      capabilities: [source],
    });
    if (!selected.ok) return selected;

    const directUrl = isDirectUrl(request.input);
    const identifier = directUrl ? request.input : `${SEARCH_PREFIX[source]}:${request.input}`;
    const requestType = request.requestType ?? (directUrl ? "url" : "search");

    try {
      const response = await selected.value.rest.resolve(identifier);
      if (!response || response.loadType === "empty") {
        return failure("MUSIC_NO_MATCH", "No matching track was found.");
      }
      if (response.loadType === "error") {
        return failure(
          "MUSIC_SOURCE_UNAVAILABLE",
          SOURCE_UNAVAILABLE_MESSAGE,
          response.data.severity !== "fault",
        );
      }

      const requestedInput = directUrl ? safeUrl(request.input)! : redactText(request.input);
      const requestedSource: MusicSource = {
        name: source,
        ...(directUrl ? { uri: requestedInput } : {}),
      };

      if (response.loadType === "playlist") {
        if (response.data.tracks.length === 0) {
          return failure("MUSIC_NO_MATCH", "No matching track was found.");
        }
        return ok({
          kind: "playlist",
          playlist: {
            name: redactText(response.data.info.name),
            selectedTrack: response.data.info.selectedTrack,
          },
          candidates: response.data.tracks.map((item) => this.#candidate(
            item,
            request,
            requestedInput,
            requestedSource,
            requestType,
          )),
        });
      }

      const tracks = response.loadType === "track" ? [response.data] : response.data;
      if (tracks.length === 0) return failure("MUSIC_NO_MATCH", "No matching track was found.");

      return ok({
        kind: response.loadType,
        candidates: tracks.map((item) => this.#candidate(
          item,
          request,
          requestedInput,
          requestedSource,
          requestType,
        )),
      });
    } catch {
      return failure("MUSIC_SOURCE_UNAVAILABLE", SOURCE_UNAVAILABLE_MESSAGE, true);
    }
  }

  async createOrUpdatePlayer(update: LavalinkPlayerUpdate): Promise<MusicResult<LavalinkPlayerSnapshot>> {
    const manager = this.#manager;
    if (!manager) return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);

    const selected = this.#registry.selectNode({ guildId: update.guildId, assignedNodeId: update.nodeId });
    if (!selected.ok) return selected;
    if (selected.value.id !== update.nodeId || !manager.nodes.has(update.nodeId)) {
      return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
    }

    try {
      let player = manager.players.get(update.guildId);
      if (player && player.node.name !== update.nodeId) {
        const moved = await player.move(update.nodeId);
        if (!moved) return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
      }

      if (!player || update.voiceChannelId) {
        if (!update.voiceChannelId || update.shardId === undefined) {
          return failure("MUSIC_VOICE_FAILED", "A voice channel and shard are required to create a player.");
        }

        this.#requestedNodes.set(update.guildId, update.nodeId);
        try {
          player = await manager.joinVoiceChannel({
            guildId: update.guildId,
            channelId: update.voiceChannelId,
            shardId: update.shardId,
            deaf: true,
            mute: false,
          });
        } finally {
          this.#requestedNodes.delete(update.guildId);
        }
      }

      if (player.node.name !== update.nodeId) {
        return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
      }

      this.#bindPlayerEvents(player);
      const filters = toFilterOptions(update.filters);
      const payload = {
        ...(update.ephemeralEncodedTrack !== undefined
          ? { track: { encoded: update.ephemeralEncodedTrack } }
          : {}),
        ...(update.positionMs !== undefined ? { position: update.positionMs } : {}),
        ...(update.volume !== undefined ? { volume: update.volume } : {}),
        ...(update.paused !== undefined ? { paused: update.paused } : {}),
        ...(filters !== undefined ? { filters } : {}),
      };
      if (Object.keys(payload).length > 0) await player.update(payload);

      return ok(this.#snapshot(player));
    } catch {
      return failure("MUSIC_VOICE_FAILED", VOICE_UNAVAILABLE_MESSAGE, true);
    }
  }

  getPlayer(guildId: string): LavalinkPlayerSnapshot | null {
    const player = this.#manager?.players.get(guildId);
    return player ? this.#snapshot(player) : null;
  }

  async destroyPlayer(guildId: string): Promise<MusicResult<void>> {
    const manager = this.#manager;
    if (!manager) return ok(undefined);

    try {
      await manager.leaveVoiceChannel(guildId);
      return ok(undefined);
    } catch {
      return failure("MUSIC_VOICE_FAILED", "The Discord voice player could not be destroyed.", true);
    }
  }

  async transferPlayer(guildId: string, nodeId: string): Promise<MusicResult<LavalinkPlayerSnapshot>> {
    const manager = this.#manager;
    if (!manager) return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
    const player = manager.players.get(guildId);
    if (!player) return failure("MUSIC_VOICE_FAILED", "No active voice player exists for this guild.");

    const selected = this.#registry.selectNode({ guildId, assignedNodeId: nodeId });
    if (!selected.ok) return selected;
    if (selected.value.id !== nodeId || !manager.nodes.has(nodeId)) {
      return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
    }

    try {
      const moved = await player.move(nodeId);
      return moved
        ? ok(this.#snapshot(player))
        : failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
    } catch {
      return failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
    }
  }

  async getLyrics(request: { guildId: string; track?: CanonicalTrack; query?: string }): Promise<MusicResult<LyricsData>> {
    const manager = this.#manager;
    const player = manager?.players.get(request.guildId);
    const selected = this.#registry.selectNode({ guildId: request.guildId, assignedNodeId: player?.node.name });
    const node = (selected.ok && manager) ? manager.nodes.get(selected.value.id) : undefined;

    // 1. Try LavaLyrics via Lavalink node REST if node is available
    if (node && node.sessionId) {
      try {
        const nodeAny = node as any;
        const rawUrl = nodeAny.rest?.url || nodeAny.url || (nodeAny.options?.secure ? `https://${nodeAny.options?.url}` : `http://${nodeAny.options?.url}`);
        const auth = nodeAny.rest?.auth || nodeAny.auth || nodeAny.options?.auth;
        const queryParams = request.query ? `?query=${encodeURIComponent(request.query)}` : "";
        const url = `${rawUrl}/v4/sessions/${node.sessionId}/players/${request.guildId}/track/lyrics${queryParams}`;
        const res = await fetch(url, {
          headers: auth ? { Authorization: auth } : {},
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          const normalized = normalizeLavaLyrics(data);
          if (normalized) return ok(normalized);
        }
      } catch {
        // Fallthrough to LRCLIB
      }
    }

    // 2. Fallback to open LRCLIB database
    const title = request.query ?? request.track?.title;
    if (!title) {
      return failure("MUSIC_NO_MATCH", "No track or query specified to find lyrics for.");
    }
    const artist = request.track?.artists?.[0];
    const duration = request.track?.durationMs ? request.track.durationMs / 1000 : undefined;
    const lrclibLyrics = await fetchLrclibLyrics(title, artist, duration);
    if (lrclibLyrics) return ok(lrclibLyrics);

    return failure("MUSIC_NO_MATCH", "No matching lyrics found.");
  }


  #candidate(
    item: Track,
    request: LavalinkLoadRequest,
    requestedInput: string,
    requestedSource: MusicSource,
    requestType: CanonicalTrack["requestType"],
  ): LavalinkTrackCandidate {
    return {
      ephemeralEncodedTrack: item.encoded,
      track: {
        id: randomUUID(),
        requestedInput,
        requestType,
        title: redactText(item.info.title),
        artists: [redactText(item.info.author)],
        durationMs: item.info.length,
        ...(safeUrl(item.info.artworkUrl) ? { artworkUrl: safeUrl(item.info.artworkUrl) } : {}),
        ...(item.info.isrc ? { isrc: redactText(item.info.isrc) } : {}),
        requestedBy: request.requestedBy,
        requestedAt: new Date().toISOString(),
        requestedSource: { ...requestedSource },
        playbackSource: {
          name: redactText(item.info.sourceName),
          identifier: safeIdentifier(item.info.identifier),
        },
      },
    };
  }

  #selectNode(nodes: Map<string, Node>, request: NodeSelectionRequest): MusicResult<Node> {
    const selected = this.#registry.selectNode(request);
    if (!selected.ok) return selected;
    const node = nodes.get(selected.value.id);
    return node ? ok(node) : failure("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, true);
  }

  #resolveNode(nodes: Map<string, Node>, connection?: Connection): Node | undefined {
    const guildId = connection?.guildId ?? "shoukaku";
    const requestedNodeId = connection ? this.#requestedNodes.get(guildId) : undefined;
    const selected = this.#registry.selectNode({ guildId, assignedNodeId: requestedNodeId });
    if (!selected.ok) return undefined;
    if (requestedNodeId && selected.value.id !== requestedNodeId) return undefined;
    return nodes.get(selected.value.id);
  }

  #snapshot(player: Player): LavalinkPlayerSnapshot {
    return {
      guildId: player.guildId,
      nodeId: player.node.name,
      positionMs: player.position,
      volume: player.volume,
      paused: player.paused,
      filters: { ...toFilterOptions(player.filters) },
    };
  }

  #bindManagerEvents(manager: Shoukaku): void {
    manager.on("ready", (name, resumed) => {
      console.log(`[Music] Lavalink node "${name}" connected and ready (resumed: ${resumed})`);
      this.#safeRegistryUpdate(name, { available: true });
    });
    manager.on("reconnecting", (name, triesLeft, reconnectInterval) => {
      console.warn(`[Music] Lavalink node "${name}" reconnecting in ${reconnectInterval}s (${triesLeft} tries left)...`);
      this.#safeRegistryUnavailable(name);
    });
    manager.on("close", (name, code, reason) => {
      console.warn(`[Music] Lavalink node "${name}" connection closed (code: ${code}, reason: ${reason})`);
      this.#safeRegistryUnavailable(name);
    });
    manager.on("disconnect", (name, count) => {
      console.warn(`[Music] Lavalink node "${name}" disconnected (moved players: ${count})`);
      this.#safeRegistryUnavailable(name);
      const node = manager.nodes.get(name);
      if (node && (node.state === 3 || node.state === 2)) {
        setTimeout(() => {
          if (node.state === 3 && this.#manager) {
            node.connect().catch(() => {});
          }
        }, 3000);
      }
    });
    manager.on("error", (name, error: any) => {
      const msg = error?.message || String(error);
      const isTransient = msg.includes("ECONNREFUSED") || msg.includes("Websocket closed before a connection was established");
      if (isTransient) {
        console.warn(`[Music] Lavalink node "${name}" connection retry pending (${msg})`);
      } else {
        console.error(`[Music] Lavalink node "${name}" error:`, error);
      }
      this.#safeRegistryUnavailable(name);
      this.emit("playback", {
        type: "node.unavailable",
        nodeId: name,
        error: new MusicError("MUSIC_RELAY_OFFLINE", RELAY_UNAVAILABLE_MESSAGE, { retryable: true }),
      });
    });
    manager.on("raw", (name, json) => {
      this.#handleRawStats(name, json);
    });
  }

  #safeRegistryUpdate(name: string, update: Parameters<NodeRegistry["update"]>[1]): void {
    try {
      this.#registry.update(name, update);
    } catch {
      // Shoukaku node names are deployment input; unknown/malformed stats are ignored safely.
    }
  }

  #safeRegistryUnavailable(name: string): void {
    try {
      this.#registry.markUnavailable(name);
    } catch {
      // Ignore events for nodes no longer present in deployment configuration.
    }
  }

  #handleRawStats(name: string, json: unknown): void {
    if (!json || typeof json !== "object" || (json as { op?: unknown }).op !== "stats") return;
    const stats = json as {
      players?: unknown;
      cpu?: { lavalinkLoad?: unknown };
      frameStats?: { deficit?: unknown; nulled?: unknown } | null;
    };
    const update: Parameters<NodeRegistry["update"]>[1] = {};
    if (finiteNumber(stats.players) && stats.players >= 0) update.activePlayers = stats.players;
    if (finiteNumber(stats.cpu?.lavalinkLoad) && stats.cpu.lavalinkLoad >= 0 && stats.cpu.lavalinkLoad <= 1) {
      update.cpuLoad = stats.cpu.lavalinkLoad;
    }
    const deficit = finiteNumber(stats.frameStats?.deficit) && stats.frameStats.deficit >= 0
      ? stats.frameStats.deficit
      : 0;
    const nulled = finiteNumber(stats.frameStats?.nulled) && stats.frameStats.nulled >= 0
      ? stats.frameStats.nulled
      : 0;
    if (stats.frameStats) update.frameLoss = deficit + nulled;
    this.#safeRegistryUpdate(name, update);
  }

  #bindPlayerEvents(player: Player): void {
    if (this.#boundPlayers.has(player)) return;
    this.#boundPlayers.add(player);

    const base = () => ({ guildId: player.guildId, nodeId: player.node.name });
    player.on("start", (data) => {
      this.#emitPlayback({ ...base(), type: "track.start", track: playbackTrack(data.track) });
    });
    player.on("end", (data) => {
      this.#emitPlayback({ ...base(), type: "track.end", track: playbackTrack(data.track), reason: data.reason });
    });
    player.on("stuck", (data) => {
      this.#emitPlayback({
        ...base(),
        type: "track.stuck",
        track: playbackTrack(data.track),
        thresholdMs: data.thresholdMs,
        error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Playback became stuck.", { retryable: true }),
      });
    });
    player.on("exception", (data) => {
      this.#emitPlayback({
        ...base(),
        type: "track.exception",
        error: new MusicError("MUSIC_SOURCE_UNAVAILABLE", "Playback failed at the music source.", {
          retryable: data.exception.severity !== "fault",
        }),
      });
    });
    player.on("update", (data) => {
      this.#emitPlayback({
        ...base(),
        type: "player.update",
        connected: data.state.connected,
        positionMs: data.state.position,
        timestamp: data.state.time,
        pingMs: data.state.ping,
      });
    });
    player.on("closed", (data) => {
      this.#emitPlayback({
        ...base(),
        type: "voice.closed",
        code: data.code,
        byRemote: data.byRemote,
        error: new MusicError("MUSIC_VOICE_FAILED", "The Discord voice connection closed.", { retryable: true }),
      });
    });
  }

  #emitPlayback(event: MusicPlaybackEvent): void {
    this.emit("playback", event);
  }
}
