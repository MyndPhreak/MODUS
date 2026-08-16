import http from "http";
import crypto from "crypto";
import { URL } from "url";
import type { Client } from "discord.js";
import { DatabaseService } from "./DatabaseService";
import type { MusicRuntime } from "./music";
import type { MusicError, MusicErrorCode } from "./music/errors";
import type {
  CanonicalTrack,
  MusicCommand,
  MusicQueueEntry,
  MusicQueueSnapshot,
  MusicRepeatMode,
  MusicResult,
  MusicSource,
} from "./music/types";

const DEFAULT_MAX_QUEUE_SIZE = 200;
const SEARCH_RESULT_LIMIT = 10;
const PLAYLIST_RESULT_LIMIT = 50;

const MUSIC_UNAVAILABLE =
  "Music playback is unavailable — no Lavalink node is configured or reachable.";
const NOTHING_PLAYING = "Nothing is playing";

/** Read the guild's maxQueueSize from its music config, falling back to default */
async function getMaxQueueSize(guildId: string): Promise<number> {
  try {
    const settings = await getDb().getModuleSettings(guildId, "music");
    if (
      typeof settings.maxQueueSize === "number" &&
      settings.maxQueueSize > 0
    ) {
      return settings.maxQueueSize;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_MAX_QUEUE_SIZE;
}

// ─── State Reads ────────────────────────────────────────────────────────────
// The old 10s state cache existed because `queue.node.getTimestamp()` and
// `queue.filters.ffmpeg.getFiltersEnabled()` introspected the in-process audio
// pipeline, and polling them starved the encoder (audible crackles). Playback
// now runs on Lavalink and dashboard state is a durable Postgres read, so that
// contention no longer exists — and a cached snapshot would hand the dashboard
// a stale `revision`, turning every optimistic mutation into a spurious 409.
// The cache is therefore gone rather than kept by inertia.

interface PreQueueItem {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
  addedBy: string;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrackInfo {
  title: string;
  url: string;
  duration: string;
  durationMs: number;
  thumbnail: string;
  author: string;
  requestedBy: string;
  /** Durable queue entry this track occupies, when it is queued. */
  entryId?: string;
  /** What the requester asked for — never a signed media URL. */
  requestedSource: MusicSource;
  /** What is actually being streamed, once a node resolved it. */
  playbackSource?: MusicSource;
}

interface PlayerHealth {
  /** Whether a Lavalink relay is currently serving this guild. */
  relay: "online" | "offline";
  nodeId: string | null;
  status: string;
  /** Stable `MusicErrorCode`, or null while healthy. */
  errorCode: MusicErrorCode | null;
  /** Source name backing the current track (youtube, soundcloud, …). */
  source: string | null;
}

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTrack: TrackInfo | null;
  queue: TrackInfo[];
  volume: number;
  /** Repeat mode: 0 = off, 1 = track, 2 = queue */
  repeatMode: number;
  /** Whether smart autoplay is enabled when the queue ends */
  autoplay: boolean;
  /** Current progress in ms */
  progress: number;
  /** Total duration in ms */
  totalDuration: number;
  /** Active audio filters */
  activeFilters: string[];
  /** Voice channel name the bot is in */
  voiceChannel: string | null;
  /** Durable queue revision — clients echo this back on mutations. */
  revision: number;
  /** Durable player status: idle | connecting | playing | paused | unavailable */
  status: string;
  nodeId: string | null;
  currentEntryId: string | null;
  /** Lavalink filter payload backing `activeFilters`. */
  filters: Record<string, unknown>;
  health: PlayerHealth;
}

interface SearchResult {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
  requestedSource: MusicSource;
  playbackSource?: MusicSource;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(milliseconds: number | undefined): string {
  if (!milliseconds || milliseconds <= 0) return "0:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = `${minutes.toString().padStart(hours > 0 ? 2 : 1, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}

/**
 * `CanonicalTrack.requestedBy` is a Discord user ID, but the dashboard has
 * always rendered a name. Resolved from the gateway cache only — a state poll
 * must not turn into a Discord API fetch.
 */
function displayRequester(client: Client, requestedBy: string): string {
  if (!requestedBy) return "Unknown";
  if (requestedBy === "dashboard") return "Dashboard";
  try {
    return client.users.cache.get(requestedBy)?.username ?? requestedBy;
  } catch {
    return requestedBy;
  }
}

/**
 * Canonical fields only. Lavalink encodings and signed media URLs live inside
 * the adapter and must never reach an HTTP response.
 */
function serializeTrack(
  track: CanonicalTrack,
  client: Client,
  entryId?: string,
): TrackInfo {
  return {
    title: track.title || "Unknown",
    url: track.requestedSource?.uri || track.playbackSource?.uri || "",
    duration: formatDuration(track.durationMs),
    durationMs: track.durationMs ?? 0,
    thumbnail: track.artworkUrl || "",
    author: track.artists?.[0] || "Unknown",
    requestedBy: displayRequester(client, track.requestedBy),
    ...(entryId ? { entryId } : {}),
    requestedSource: track.requestedSource,
    ...(track.playbackSource ? { playbackSource: track.playbackSource } : {}),
  };
}

function serializeSearchResult(track: CanonicalTrack): SearchResult {
  return {
    title: track.title || "Unknown",
    url: track.requestedSource?.uri || track.playbackSource?.uri || "",
    duration: formatDuration(track.durationMs),
    thumbnail: track.artworkUrl || "",
    author: track.artists?.[0] || "Unknown",
    requestedSource: track.requestedSource,
    ...(track.playbackSource ? { playbackSource: track.playbackSource } : {}),
  };
}

/** Entries that can still play, in durable queue order. */
function playableEntries(snapshot: MusicQueueSnapshot): MusicQueueEntry[] {
  return snapshot.entries
    .filter((entry) => entry.status !== "failed")
    .sort((left, right) => left.position - right.position);
}

function currentEntry(snapshot: MusicQueueSnapshot): MusicQueueEntry | null {
  return snapshot.entries.find((entry) => entry.id === snapshot.currentEntryId) ?? null;
}

/**
 * The dashboard's `queue` array has always meant "tracks after this one", so
 * the current entry stays out of it and every index the dashboard sends back
 * is an index into this list.
 */
function upcomingEntries(snapshot: MusicQueueSnapshot): MusicQueueEntry[] {
  return playableEntries(snapshot).filter((entry) => entry.id !== snapshot.currentEntryId);
}

/** The dashboard's numeric repeat modes, kept from the pre-Lavalink contract. */
function repeatModeToNumber(mode: MusicRepeatMode): number {
  return mode === "track" ? 1 : mode === "queue" ? 2 : 0;
}

function voiceChannelName(client: Client, guildId: string): string | null {
  try {
    const guild = client.guilds.cache.get(guildId);
    return guild?.members?.me?.voice?.channel?.name ?? null;
  } catch {
    return null;
  }
}

function botVoiceChannelId(client: Client, guildId: string): string | null {
  try {
    const guild = client.guilds.cache.get(guildId);
    return guild?.members?.me?.voice?.channelId ?? null;
  } catch {
    return null;
  }
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Bot-Secret",
  });
  res.end(JSON.stringify(data));
}

// ─── Music Service Plumbing ─────────────────────────────────────────────────

/**
 * Stable HTTP mapping for the engine-neutral error codes. Anything transient
 * (relay down, node saturated, source flapping) is a 503 the dashboard can
 * retry; a lost optimistic-concurrency race is a 409.
 */
function statusForMusicError(code: MusicErrorCode): number {
  switch (code) {
    case "MUSIC_NO_MATCH":
      return 404;
    case "MUSIC_CONFLICT":
      return 409;
    case "MUSIC_SOURCE_UNAVAILABLE":
    case "MUSIC_NODE_CAPACITY":
    case "MUSIC_RELAY_OFFLINE":
    case "MUSIC_RETRY_EXHAUSTED":
      return 503;
    case "MUSIC_VOICE_FAILED":
      return 500;
    default:
      return 500;
  }
}

function musicErrorMessage(code: MusicErrorCode): string {
  switch (code) {
    case "MUSIC_NO_MATCH":
      return "No matching track was found.";
    case "MUSIC_SOURCE_UNAVAILABLE":
      return "That music source is unavailable right now — try again shortly.";
    case "MUSIC_NODE_CAPACITY":
      return "Every music server is at capacity — try again shortly.";
    case "MUSIC_VOICE_FAILED":
      return "Could not update the voice connection.";
    case "MUSIC_RELAY_OFFLINE":
      return MUSIC_UNAVAILABLE;
    case "MUSIC_RETRY_EXHAUSTED":
      return "Playback kept failing — try again shortly.";
    case "MUSIC_CONFLICT":
      return "The queue changed while that command ran — reload and try again.";
    default:
      return "Could not complete that music command.";
  }
}

function sendMusicError(res: http.ServerResponse, error: MusicError) {
  return sendJson(res, statusForMusicError(error.code), {
    error: musicErrorMessage(error.code),
    errorCode: error.code,
  });
}

function sendUnavailable(res: http.ServerResponse) {
  return sendJson(res, 503, {
    error: MUSIC_UNAVAILABLE,
    errorCode: "MUSIC_RELAY_OFFLINE" satisfies MusicErrorCode,
  });
}

/**
 * Internal failures are logged in full and reported generically — the raw
 * message can carry connection strings, tokens, or node addresses that must
 * not reach a browser.
 */
function sendInternalError(
  res: http.ServerResponse,
  context: string,
  error: unknown,
) {
  console.error(`[MusicAPI] ${context}:`, error);
  return sendJson(res, 500, {
    error: "The music request could not be completed.",
  });
}

/** Parses an operation ID supplied by the caller, minting one when absent. */
function operationIdFrom(body: any): string {
  const provided = body?.operationId;
  if (typeof provided === "string" && provided.trim().length > 0) {
    return provided.trim().slice(0, 128);
  }
  return crypto.randomUUID();
}

/** `null` means "the caller did not pin a revision"; NaN is rejected upstream. */
function revisionFrom(body: any): number | null {
  const raw = body?.expectedRevision;
  if (raw === undefined || raw === null || raw === "") return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

/**
 * Runs one durable mutation.
 *
 * When the caller pinned a revision (index-bound edits like remove/reorder)
 * the command is dispatched exactly once: a conflict means the caller's view
 * of the queue is stale, so retrying would act on a different track than the
 * one the user clicked. Commands that are not index-bound resolve the current
 * revision here and retry once with the same operation ID, which stays
 * idempotent in the durable layer.
 */
async function runMutation(
  runtime: MusicRuntime,
  guildId: string,
  clientRevision: number | null,
  build: (revision: number) => MusicCommand,
): Promise<MusicResult<MusicQueueSnapshot>> {
  if (clientRevision !== null) {
    return runtime.musicService.execute(build(clientRevision));
  }

  let result: MusicResult<MusicQueueSnapshot> | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await runtime.musicService.getQueue(guildId);
    result = await runtime.musicService.execute(build(snapshot.revision));
    if (result.ok || result.error.code !== "MUSIC_CONFLICT") return result;
  }
  return result!;
}

// ─── Pre-Queue Helpers ──────────────────────────────────────────────────────
// Pre-queue lives inside the music module's settings.preQueue array. The old
// dedicated `preQueueData` column was an Appwrite-era workaround for that
// collection's 5000-char settings field cap; Postgres's JSONB has no such
// limit so the separate column is gone.

let _db: DatabaseService | null = null;
function getDb(): DatabaseService {
  if (!_db) _db = new DatabaseService();
  return _db;
}

async function getPreQueue(guildId: string): Promise<PreQueueItem[]> {
  try {
    const settings = await getDb().getModuleSettings(guildId, "music");
    const items = settings?.preQueue;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function savePreQueue(
  guildId: string,
  preQueue: PreQueueItem[],
): Promise<void> {
  const db = getDb();
  const settings = (await db.getModuleSettings(guildId, "music")) ?? {};
  settings.preQueue = preQueue;
  await db.setModuleSettings(guildId, "music", settings);
}

// ─── Music API ──────────────────────────────────────────────────────────────

/**
 * Constant-time check of the shared secret guarding the /music/* control and
 * query API. Returns true when the request is allowed to proceed:
 *   - no BOT_API_SECRET configured → allowed (legacy behaviour, warned at boot)
 *   - configured and the X-Bot-Secret header matches → allowed
 */
function musicRequestAuthorized(req: http.IncomingMessage): boolean {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) return true;
  const provided = req.headers["x-bot-secret"];
  if (typeof provided !== "string" || provided.length !== secret.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

/**
 * Dashboard control plane over the durable music service.
 *
 * `musicRuntime` is null when no Lavalink node is configured; every route that
 * needs playback answers 503 in that case, while the pre-queue (a plain
 * settings row) keeps working so admins can still stage tracks.
 */
export function registerMusicAPI(
  server: http.Server,
  client: Client,
  musicRuntime: MusicRuntime | null,
) {
  const originalHandler = server.listeners("request")[0] as Function;

  if (!process.env.BOT_API_SECRET) {
    console.warn(
      "[MusicAPI] BOT_API_SECRET is not set — the /music control API is " +
        "reachable without authentication. Set BOT_API_SECRET on the bot and " +
        "NUXT_BOT_API_SECRET on the web app to lock it down.",
    );
  }

  if (!musicRuntime) {
    console.warn(
      "[MusicAPI] No music runtime — dashboard playback controls will report " +
        "music as unavailable.",
    );
  }

  // Remove the original handler and replace with our router
  server.removeAllListeners("request");

  server.on(
    "request",
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`,
      );
      const pathname = url.pathname;

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Bot-Secret",
        });
        res.end();
        return;
      }

      // Shared-secret gate for the whole /music surface. This defends the
      // control/query API even when the bot's HTTP port is reachable directly
      // (not only through the now-authenticated web proxy). Non-/music paths
      // fall through to the webhook/health handlers, which have their own auth.
      if (pathname.startsWith("/music/") && !musicRequestAuthorized(req)) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }

      // Route: GET /music/state/:guildId
      const stateMatch = pathname.match(/^\/music\/state\/(\d+)$/);
      if (stateMatch && req.method === "GET") {
        const guildId = stateMatch[1];
        try {
          // State is a poll, not a command: an unconfigured relay answers with
          // an idle snapshot flagged unhealthy rather than an error, so the
          // dashboard keeps rendering instead of showing "cannot reach bot".
          if (!musicRuntime) {
            return sendJson(res, 200, offlinePlayerState());
          }

          const [state, snapshot] = await Promise.all([
            musicRuntime.musicService.getState(guildId),
            musicRuntime.musicService.getQueue(guildId),
          ]);

          const current = currentEntry(snapshot);
          const currentTrack = current
            ? serializeTrack(current.track, client, current.id)
            : null;
          const relayOnline = state.status !== "unavailable";

          const playerState: PlayerState = {
            isPlaying: state.status === "playing",
            isPaused: state.status === "paused",
            currentTrack,
            queue: upcomingEntries(snapshot).map((entry) =>
              serializeTrack(entry.track, client, entry.id),
            ),
            volume: snapshot.volume,
            repeatMode: repeatModeToNumber(snapshot.repeatMode),
            autoplay: snapshot.autoplay ?? false,
            progress: state.positionMs,
            totalDuration: current?.track.durationMs ?? 0,
            // Lavalink stores the merged filter payload, so the names are its
            // top-level filter keys rather than the old FFmpeg chain names.
            activeFilters: Object.keys(snapshot.filters ?? {}),
            voiceChannel: voiceChannelName(client, guildId),
            revision: snapshot.revision,
            status: state.status,
            nodeId: state.nodeId,
            currentEntryId: snapshot.currentEntryId,
            filters: (snapshot.filters ?? {}) as Record<string, unknown>,
            health: {
              relay: relayOnline ? "online" : "offline",
              nodeId: state.nodeId,
              status: state.status,
              errorCode: state.errorCode ?? null,
              source:
                current?.track.playbackSource?.name ??
                current?.track.requestedSource?.name ??
                null,
            },
          };

          return sendJson(res, 200, playerState);
        } catch (err) {
          return sendInternalError(res, "Error getting state", err);
        }
      }

      // Route: POST /music/play/:guildId
      const playMatch = pathname.match(/^\/music\/play\/(\d+)$/);
      if (playMatch && req.method === "POST") {
        const guildId = playMatch[1];
        try {
          const body = await parseBody(req);
          const query = body.query;
          if (!query) return sendJson(res, 400, { error: "Missing query" });
          if (!musicRuntime) return sendUnavailable(res);

          const voiceChannelId = botVoiceChannelId(client, guildId);
          if (!voiceChannelId) {
            return sendJson(res, 400, {
              error:
                "Bot is not in a voice channel. Play a song from Discord first.",
            });
          }

          const requestedBy =
            typeof body.requestedBy === "string" && body.requestedBy.trim()
              ? body.requestedBy.trim()
              : "dashboard";

          const resolved = await musicRuntime.engine.loadTracks({
            guildId,
            input: query,
            requestedBy,
          });
          if (!resolved.ok) return sendMusicError(res, resolved.error);

          const candidates =
            resolved.value.kind === "playlist"
              ? resolved.value.candidates
              : resolved.value.candidates.slice(0, 1);
          if (candidates.length === 0) {
            return sendJson(res, 404, { error: "No results found" });
          }

          const maxQueueSize = await getMaxQueueSize(guildId);
          const before = await musicRuntime.musicService.getQueue(guildId);
          const room = Math.max(0, maxQueueSize - playableEntries(before).length);
          if (room === 0) {
            return sendJson(res, 400, {
              error: `Queue is full (max ${maxQueueSize} songs)`,
            });
          }

          const operationId = operationIdFrom(body);
          const clientRevision = revisionFrom(body);
          let queued = 0;
          let latest: MusicQueueSnapshot | null = null;

          for (const [index, candidate] of candidates.slice(0, room).entries()) {
            const result = await runMutation(
              musicRuntime,
              guildId,
              // Only the first insert can honour the caller's revision; the
              // rest necessarily follow the revisions this loop produces.
              index === 0 ? clientRevision : null,
              (revision) => ({
                type: "play",
                guildId,
                operationId: index === 0 ? operationId : `${operationId}:${index}`,
                expectedRevision: revision,
                track: candidate.track,
                voiceChannelId,
              }),
            );
            if (!result.ok) {
              if (queued === 0) return sendMusicError(res, result.error);
              break;
            }
            queued += 1;
            latest = result.value;
          }

          const snapshot =
            latest ?? (await musicRuntime.musicService.getQueue(guildId));

          return sendJson(res, 200, {
            success: true,
            track: serializeTrack(candidates[0].track, client),
            position: upcomingEntries(snapshot).length,
            queued,
            revision: snapshot.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error playing", err);
        }
      }

      // Route: POST /music/skip/:guildId
      const skipMatch = pathname.match(/^\/music\/skip\/(\d+)$/);
      if (skipMatch && req.method === "POST") {
        const guildId = skipMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);
          const snapshot = await musicRuntime.musicService.getQueue(guildId);
          const current = currentEntry(snapshot);
          if (!current) return sendJson(res, 400, { error: NOTHING_PLAYING });

          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            revisionFrom(body),
            (revision) => ({
              type: "skip",
              guildId,
              operationId,
              expectedRevision: revision,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            skipped: current.track.title,
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error skipping", err);
        }
      }

      // Route: POST /music/pause/:guildId  |  POST /music/resume/:guildId
      const playbackToggleMatch = pathname.match(
        /^\/music\/(pause|resume)\/(\d+)$/,
      );
      if (playbackToggleMatch && req.method === "POST") {
        const type = playbackToggleMatch[1] as "pause" | "resume";
        const guildId = playbackToggleMatch[2];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);
          const snapshot = await musicRuntime.musicService.getQueue(guildId);
          if (playableEntries(snapshot).length === 0) {
            return sendJson(res, 400, { error: NOTHING_PLAYING });
          }

          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            revisionFrom(body),
            (revision) => ({
              type,
              guildId,
              operationId,
              expectedRevision: revision,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, `Error running ${type}`, err);
        }
      }

      // Route: POST /music/stop/:guildId
      const stopMatch = pathname.match(/^\/music\/stop\/(\d+)$/);
      if (stopMatch && req.method === "POST") {
        const guildId = stopMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);
          const snapshot = await musicRuntime.musicService.getQueue(guildId);
          if (playableEntries(snapshot).length === 0) {
            return sendJson(res, 400, { error: NOTHING_PLAYING });
          }

          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            revisionFrom(body),
            (revision) => ({
              type: "stop",
              guildId,
              operationId,
              expectedRevision: revision,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error stopping", err);
        }
      }

      // Route: POST /music/volume/:guildId
      const volumeMatch = pathname.match(/^\/music\/volume\/(\d+)$/);
      if (volumeMatch && req.method === "POST") {
        const guildId = volumeMatch[1];
        try {
          const body = await parseBody(req);
          const level = Number(body.volume);
          if (isNaN(level) || level < 0 || level > 100) {
            return sendJson(res, 400, { error: "Volume must be 0-100" });
          }
          if (!musicRuntime) return sendUnavailable(res);

          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            revisionFrom(body),
            (revision) => ({
              type: "volume",
              guildId,
              operationId,
              expectedRevision: revision,
              volume: Math.trunc(level),
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            volume: Math.trunc(level),
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error setting volume", err);
        }
      }

      // Route: POST /music/autoplay/:guildId
      const autoplayMatch = pathname.match(/^\/music\/autoplay\/(\d+)$/);
      if (autoplayMatch && req.method === "POST") {
        const guildId = autoplayMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);
          const enabled = Boolean(body.enabled);
          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            revisionFrom(body),
            (revision) => ({
              type: "autoplay",
              guildId,
              operationId,
              expectedRevision: revision,
              enabled,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);
          return sendJson(res, 200, {
            success: true,
            autoplay: enabled,
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error updating autoplay", err);
        }
      }

      // Route: GET /music/lyrics/:guildId
      const lyricsMatch = pathname.match(/^\/music\/lyrics\/(\d+)$/);
      if (lyricsMatch && req.method === "GET") {
        const guildId = lyricsMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const query = parsedUrl.searchParams.get("query") ?? undefined;
          const result = await musicRuntime.musicService.getLyrics(guildId, query);
          if (!result.ok) {
            return sendJson(res, 404, { error: result.error.message });
          }
          return sendJson(res, 200, result.value);
        } catch (err: any) {
          return sendInternalError(res, "Error fetching lyrics", err);
        }
      }

      // Route: POST /music/shuffle/:guildId
      const shuffleMatch = pathname.match(/^\/music\/shuffle\/(\d+)$/);
      if (shuffleMatch && req.method === "POST") {
        const guildId = shuffleMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);
          const snapshot = await musicRuntime.musicService.getQueue(guildId);
          if (playableEntries(snapshot).length === 0) {
            return sendJson(res, 400, { error: NOTHING_PLAYING });
          }

          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            revisionFrom(body),
            (revision) => ({
              type: "queue.shuffle",
              guildId,
              operationId,
              expectedRevision: revision,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error shuffling", err);
        }
      }

      // Route: POST /music/remove/:guildId
      const removeMatch = pathname.match(/^\/music\/remove\/(\d+)$/);
      if (removeMatch && req.method === "POST") {
        const guildId = removeMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);

          // Index-bound edits are only meaningful against the snapshot the
          // dashboard rendered, so the revision is mandatory here.
          const expectedRevision = revisionFrom(body);
          if (expectedRevision === null) {
            return sendJson(res, 400, {
              error: "Missing expectedRevision — reload the queue and retry.",
            });
          }

          const index = Number(body.index);
          const snapshot = await musicRuntime.musicService.getQueue(guildId);
          const upcoming = upcomingEntries(snapshot);
          if (!Number.isInteger(index) || index < 0 || index >= upcoming.length) {
            return sendJson(res, 400, { error: "Invalid track index" });
          }

          const target = upcoming[index];
          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            expectedRevision,
            (revision) => ({
              type: "queue.remove",
              guildId,
              operationId,
              expectedRevision: revision,
              entryId: target.id,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            removed: target.track.title || "Unknown",
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error removing track", err);
        }
      }

      // Route: POST /music/reorder/:guildId
      const reorderMatch = pathname.match(/^\/music\/reorder\/(\d+)$/);
      if (reorderMatch && req.method === "POST") {
        const guildId = reorderMatch[1];
        try {
          if (!musicRuntime) return sendUnavailable(res);
          const body = await parseBody(req);

          const expectedRevision = revisionFrom(body);
          if (expectedRevision === null) {
            return sendJson(res, 400, {
              error: "Missing expectedRevision — reload the queue and retry.",
            });
          }

          const fromIndex = Number(body.from);
          const toIndex = Number(body.to);
          const snapshot = await musicRuntime.musicService.getQueue(guildId);
          const upcoming = upcomingEntries(snapshot);
          if (
            !Number.isInteger(fromIndex) ||
            !Number.isInteger(toIndex) ||
            fromIndex < 0 ||
            fromIndex >= upcoming.length ||
            toIndex < 0 ||
            toIndex >= upcoming.length
          ) {
            return sendJson(res, 400, { error: "Invalid indices" });
          }

          // The dashboard indexes the upcoming list, but `queue.move` addresses
          // the stored position column — which stays contiguous across *every*
          // row, including the current entry and the "failed" tombstones a
          // finished track leaves behind. Counting positions in the filtered
          // list would land the track short by one slot per preceding tombstone
          // (and, moving down, ahead of the track that is playing), so the
          // destination entry's own stored position is used verbatim. That
          // reproduces `splice(from, 1); splice(to, 0, track)` in both
          // directions: the mover ends up exactly where the target sits today.
          const moved = upcoming[fromIndex];
          const position = upcoming[toIndex].position;
          const operationId = operationIdFrom(body);
          const result = await runMutation(
            musicRuntime,
            guildId,
            expectedRevision,
            (revision) => ({
              type: "queue.move",
              guildId,
              operationId,
              expectedRevision: revision,
              entryId: moved.id,
              position,
            }),
          );
          if (!result.ok) return sendMusicError(res, result.error);

          return sendJson(res, 200, {
            success: true,
            revision: result.value.revision,
            operationId,
          });
        } catch (err: any) {
          return sendInternalError(res, "Error reordering queue", err);
        }
      }

      // Route: POST /music/search/:guildId
      const searchMatch = pathname.match(/^\/music\/search\/(\d+)$/);
      if (searchMatch && req.method === "POST") {
        const guildId = searchMatch[1];
        try {
          const body = await parseBody(req);
          const query = body.query;
          if (!query || query.length < 2) {
            return sendJson(res, 400, { error: "Query too short" });
          }
          if (!musicRuntime) return sendUnavailable(res);

          const resolved = await musicRuntime.engine.loadTracks({
            guildId,
            input: query,
            requestedBy: "dashboard",
          });
          if (!resolved.ok) {
            // A dead-end search is an empty result set, not a page-level error.
            if (resolved.error.code === "MUSIC_NO_MATCH") {
              return sendJson(res, 200, { results: [] });
            }
            return sendMusicError(res, resolved.error);
          }

          const isPlaylist = resolved.value.kind === "playlist";
          const results: SearchResult[] = resolved.value.candidates
            .slice(0, isPlaylist ? PLAYLIST_RESULT_LIMIT : SEARCH_RESULT_LIMIT)
            .map((candidate) => serializeSearchResult(candidate.track));

          return sendJson(res, 200, {
            results,
            isPlaylist,
            trackCount: isPlaylist ? resolved.value.candidates.length : undefined,
            playlistTitle: isPlaylist ? resolved.value.playlist?.name : undefined,
          });
        } catch (err: any) {
          return sendInternalError(res, "Search error", err);
        }
      }

      // ─── Pre-Queue Routes ──────────────────────────────────────────────

      // Route: GET /music/prequeue/:guildId
      const prequeueGetMatch = pathname.match(/^\/music\/prequeue\/(\d+)$/);
      if (prequeueGetMatch && req.method === "GET") {
        const guildId = prequeueGetMatch[1];
        try {
          const preQueue = await getPreQueue(guildId);
          return sendJson(res, 200, { preQueue });
        } catch (err: any) {
          return sendInternalError(res, "Pre-queue read error", err);
        }
      }

      // Route: POST /music/prequeue-add/:guildId
      const prequeueAddMatch = pathname.match(/^\/music\/prequeue-add\/(\d+)$/);
      if (prequeueAddMatch && req.method === "POST") {
        const guildId = prequeueAddMatch[1];
        try {
          const body = await parseBody(req);
          const query = body.query;
          if (!query) return sendJson(res, 400, { error: "Missing query" });
          if (!musicRuntime) return sendUnavailable(res);

          const preQueue = await getPreQueue(guildId);
          const maxQueueSize = await getMaxQueueSize(guildId);
          if (preQueue.length >= maxQueueSize) {
            return sendJson(res, 400, {
              error: `Pre-queue is full (max ${maxQueueSize} songs)`,
            });
          }

          // Resolve metadata through the same engine playback uses, so a staged
          // track and a played track describe the same thing.
          const resolved = await musicRuntime.engine.loadTracks({
            guildId,
            input: query,
            requestedBy: "dashboard",
          });
          if (!resolved.ok) {
            if (resolved.error.code === "MUSIC_NO_MATCH") {
              return sendJson(res, 404, { error: "No results found" });
            }
            return sendMusicError(res, resolved.error);
          }
          if (resolved.value.candidates.length === 0) {
            return sendJson(res, 404, { error: "No results found" });
          }

          const isPlaylist = resolved.value.kind === "playlist";
          const tracksToAdd = isPlaylist
            ? resolved.value.candidates
            : resolved.value.candidates.slice(0, 1);
          const slotsAvailable = maxQueueSize - preQueue.length;
          const capped = tracksToAdd.slice(0, slotsAvailable);

          const addedItems: PreQueueItem[] = capped.map(({ track }) => ({
            title: track.title || "Unknown",
            url: track.requestedSource?.uri || track.playbackSource?.uri || query,
            duration: formatDuration(track.durationMs),
            thumbnail: track.artworkUrl || "",
            author: track.artists?.[0] || "Unknown",
            addedBy: body.addedBy || "Dashboard",
          }));

          preQueue.push(...addedItems);
          await savePreQueue(guildId, preQueue);

          return sendJson(res, 200, {
            success: true,
            track: addedItems[0],
            addedCount: addedItems.length,
            totalFound: tracksToAdd.length,
            count: preQueue.length,
          });
        } catch (err: any) {
          return sendInternalError(res, "Pre-queue add error", err);
        }
      }

      // Route: POST /music/prequeue-remove/:guildId
      const prequeueRemoveMatch = pathname.match(
        /^\/music\/prequeue-remove\/(\d+)$/,
      );
      if (prequeueRemoveMatch && req.method === "POST") {
        const guildId = prequeueRemoveMatch[1];
        try {
          const body = await parseBody(req);
          const index = Number(body.index);
          const preQueue = await getPreQueue(guildId);

          if (isNaN(index) || index < 0 || index >= preQueue.length) {
            return sendJson(res, 400, { error: "Invalid index" });
          }

          const removed = preQueue.splice(index, 1)[0];
          await savePreQueue(guildId, preQueue);

          return sendJson(res, 200, {
            success: true,
            removed: removed.title,
            count: preQueue.length,
          });
        } catch (err: any) {
          return sendInternalError(res, "Pre-queue remove error", err);
        }
      }

      // Route: POST /music/prequeue-reorder/:guildId
      const prequeueReorderMatch = pathname.match(
        /^\/music\/prequeue-reorder\/(\d+)$/,
      );
      if (prequeueReorderMatch && req.method === "POST") {
        const guildId = prequeueReorderMatch[1];
        try {
          const body = await parseBody(req);
          const fromIndex = Number(body.from);
          const toIndex = Number(body.to);
          const preQueue = await getPreQueue(guildId);

          if (
            isNaN(fromIndex) ||
            isNaN(toIndex) ||
            fromIndex < 0 ||
            fromIndex >= preQueue.length ||
            toIndex < 0 ||
            toIndex >= preQueue.length
          ) {
            return sendJson(res, 400, { error: "Invalid indices" });
          }

          const [item] = preQueue.splice(fromIndex, 1);
          preQueue.splice(toIndex, 0, item);
          await savePreQueue(guildId, preQueue);

          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendInternalError(res, "Pre-queue reorder error", err);
        }
      }

      // Route: POST /music/prequeue-clear/:guildId
      const prequeueClearMatch = pathname.match(
        /^\/music\/prequeue-clear\/(\d+)$/,
      );
      if (prequeueClearMatch && req.method === "POST") {
        const guildId = prequeueClearMatch[1];
        try {
          await savePreQueue(guildId, []);
          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendInternalError(res, "Pre-queue clear error", err);
        }
      }

      // Fallback: pass to original health check handler
      if (originalHandler) {
        (originalHandler as any)(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      }
    },
  );

  console.log("[MusicAPI] REST API routes registered on HTTP server");
}

/** Shape returned when no Lavalink relay is configured for this process. */
function offlinePlayerState(): PlayerState {
  return {
    isPlaying: false,
    isPaused: false,
    currentTrack: null,
    queue: [],
    volume: 50,
    repeatMode: 0,
    autoplay: false,
    progress: 0,
    totalDuration: 0,
    activeFilters: [],
    voiceChannel: null,
    revision: 0,
    status: "unavailable",
    nodeId: null,
    currentEntryId: null,
    filters: {},
    health: {
      relay: "offline",
      nodeId: null,
      status: "unavailable",
      errorCode: "MUSIC_RELAY_OFFLINE",
      source: null,
    },
  };
}
