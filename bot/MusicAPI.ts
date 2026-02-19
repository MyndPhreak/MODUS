import http from "http";
import { URL } from "url";
import { Player, useMainPlayer, QueryType } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { Client } from "discord.js";
import { AppwriteService } from "./AppwriteService";
import { Databases, Query } from "node-appwrite";

const DEFAULT_MAX_QUEUE_SIZE = 200;

/** Read the guild's maxQueueSize from its music config, falling back to default */
async function getMaxQueueSize(guildId: string): Promise<number> {
  try {
    const doc = await findMusicConfigDoc(guildId);
    if (doc?.settings) {
      const settings = JSON.parse(doc.settings);
      if (
        typeof settings.maxQueueSize === "number" &&
        settings.maxQueueSize > 0
      ) {
        return settings.maxQueueSize;
      }
    }
  } catch {}
  return DEFAULT_MAX_QUEUE_SIZE;
}

// ─── State Cache ────────────────────────────────────────────────────────────
// Caches the player state per guild to avoid calling queue.node.getTimestamp()
// and queue.filters.ffmpeg.getFiltersEnabled() on every single poll.
// These calls can cause event-loop contention that starves the audio pipeline,
// producing periodic crackles.
const STATE_CACHE_TTL = 10_000; // 10 seconds – longer than the dashboard's 5s poll to ensure most polls hit cache
const stateCache = new Map<string, { data: any; timestamp: number }>();

function getCachedState(guildId: string): any | null {
  const entry = stateCache.get(guildId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STATE_CACHE_TTL) {
    stateCache.delete(guildId);
    return null;
  }
  return entry.data;
}

function setCachedState(guildId: string, data: any): void {
  stateCache.set(guildId, { data, timestamp: Date.now() });
}

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
}

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTrack: TrackInfo | null;
  queue: TrackInfo[];
  volume: number;
  repeatMode: number;
  /** Current playback progress in ms */
  progress: number;
  /** Total duration of current track in ms */
  totalDuration: number;
  /** Active audio filters */
  activeFilters: string[];
  /** Voice channel name the bot is in */
  voiceChannel: string | null;
}

interface SearchResult {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function serializeTrack(track: any): TrackInfo {
  return {
    title: track.title || "Unknown",
    url: track.url || "",
    duration: track.duration || "0:00",
    durationMs: track.durationMS || 0,
    thumbnail: track.thumbnail || "",
    author: track.author || "Unknown",
    requestedBy:
      track.requestedBy?.username || track.requestedBy?.tag || "Unknown",
  };
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

// ─── Pre-Queue Helpers ──────────────────────────────────────────────────────
// Pre-queue data is stored in a dedicated `preQueueData` column (100K chars)
// on the guild_configs collection, separate from the 5000-char `settings` field.

const DB_ID = "discord_bot";
const GUILD_CONFIGS_COLLECTION = "guild_configs";

let _preQueueAppwrite: AppwriteService | null = null;
function getAppwrite(): AppwriteService {
  if (!_preQueueAppwrite) _preQueueAppwrite = new AppwriteService();
  return _preQueueAppwrite;
}

/** Lazily initialised Databases instance for direct column access */
let _databases: Databases | null = null;
function getDatabases(): Databases {
  if (!_databases) {
    // Re-use the same Client that AppwriteService creates internally
    const { Client } = require("node-appwrite");
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_API_KEY!);
    _databases = new Databases(client);
  }
  return _databases!;
}

/** Find the guild_configs document for the music module */
async function findMusicConfigDoc(guildId: string): Promise<any | null> {
  const db = getDatabases();
  const response = await db.listDocuments(DB_ID, GUILD_CONFIGS_COLLECTION, [
    Query.equal("guildId", guildId),
    Query.equal("moduleName", "music"),
  ]);
  return response.total > 0 ? response.documents[0] : null;
}

async function getPreQueue(guildId: string): Promise<PreQueueItem[]> {
  const doc = await findMusicConfigDoc(guildId);
  if (!doc) return [];

  // Read from the new dedicated column
  if (doc.preQueueData) {
    try {
      const items = JSON.parse(doc.preQueueData);
      if (Array.isArray(items)) return items;
    } catch {
      // corrupted JSON — fall through to legacy
    }
  }

  // Legacy fallback: read from the old settings.preQueue field
  // (one-time migration — next save will write to the new column)
  if (doc.settings) {
    try {
      const settings = JSON.parse(doc.settings);
      if (Array.isArray(settings?.preQueue)) return settings.preQueue;
    } catch {}
  }

  return [];
}

async function savePreQueue(
  guildId: string,
  preQueue: PreQueueItem[],
): Promise<void> {
  const db = getDatabases();
  const doc = await findMusicConfigDoc(guildId);
  const preQueueData = JSON.stringify(preQueue);

  if (doc) {
    // Also clear legacy settings.preQueue if present
    const updates: Record<string, any> = { preQueueData };
    if (doc.settings) {
      try {
        const settings = JSON.parse(doc.settings);
        if (settings.preQueue) {
          delete settings.preQueue;
          updates.settings = JSON.stringify(settings);
        }
      } catch {}
    }
    await db.updateDocument(DB_ID, GUILD_CONFIGS_COLLECTION, doc.$id, updates);
  } else {
    // Create a new config document for this guild's music module
    await db.createDocument(DB_ID, GUILD_CONFIGS_COLLECTION, "unique()", {
      guildId,
      moduleName: "music",
      enabled: true,
      settings: "{}",
      preQueueData,
    });
  }
}

// ─── Music API ──────────────────────────────────────────────────────────────

export function registerMusicAPI(server: http.Server, client: Client) {
  const originalHandler = server.listeners("request")[0] as Function;

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

      // Route: GET /music/state/:guildId
      const stateMatch = pathname.match(/^\/music\/state\/(\d+)$/);
      if (stateMatch && req.method === "GET") {
        const guildId = stateMatch[1];
        try {
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);

          if (!queue || !queue.currentTrack) {
            // Clear cache when nothing is playing
            stateCache.delete(guildId);
            const state: PlayerState = {
              isPlaying: false,
              isPaused: false,
              currentTrack: null,
              queue: [],
              volume: 50,
              repeatMode: 0,
              progress: 0,
              totalDuration: 0,
              activeFilters: [],
              voiceChannel: null,
            };
            return sendJson(res, 200, state);
          }

          // ── Check cache first to avoid heavy node introspection ──
          // getTimestamp() and getFiltersEnabled() can cause event-loop
          // contention that starves the audio stream, producing crackles.
          const cached = getCachedState(guildId);
          if (cached) {
            // Update lightweight fields that don't touch the audio pipeline
            cached.currentTrack = serializeTrack(queue.currentTrack);
            cached.queue = queue.tracks.toArray().map(serializeTrack);
            cached.repeatMode = queue.repeatMode;
            cached.voiceChannel = queue.channel?.name || null;
            return sendJson(res, 200, cached);
          }

          const currentTrack = queue.currentTrack;
          const tracks = queue.tracks.toArray();

          // ── Safety: avoid touching queue.node during voice-connection init ──
          let isPlaying = false;
          let isPaused = false;
          let volume = 50;
          let progress = 0;
          let totalDuration = currentTrack.durationMS ?? 0;
          let activeFilters: string[] = [];

          const connectionReady =
            queue.connection &&
            !queue.connection.state?.status?.match?.(/connecting|signalling/i);

          if (connectionReady) {
            try {
              isPlaying = queue.node.isPlaying();
              isPaused = queue.node.isPaused();
              volume = queue.node.volume;
              const ts = queue.node.getTimestamp();
              progress = ts?.current?.value ?? 0;
              totalDuration = ts?.total?.value ?? totalDuration;
              activeFilters = queue.filters.ffmpeg.getFiltersEnabled();
            } catch (nodeErr) {
              console.warn(
                "[MusicAPI] Skipped node access (still initializing):",
                (nodeErr as Error).message,
              );
            }
          }

          const state: PlayerState = {
            isPlaying,
            isPaused,
            currentTrack: serializeTrack(currentTrack),
            queue: tracks.map(serializeTrack),
            volume,
            repeatMode: queue.repeatMode,
            progress,
            totalDuration,
            activeFilters,
            voiceChannel: queue.channel?.name || null,
          };

          // Cache the state so subsequent polls skip heavy node calls
          setCachedState(guildId, state);

          return sendJson(res, 200, state);
        } catch (err) {
          console.error("[MusicAPI] Error getting state:", err);
          return sendJson(res, 500, { error: "Failed to get player state" });
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

          const player = useMainPlayer();
          const queue = player.queues.get(guildId);

          if (!queue || !queue.channel) {
            return sendJson(res, 400, {
              error:
                "Bot is not in a voice channel. Play a song from Discord first.",
            });
          }

          const isUrl = /^https?:\/\//i.test(query);
          const result = await player.play(queue.channel, query, {
            searchEngine: isUrl
              ? QueryType.AUTO
              : `ext:${YoutubeiExtractor.identifier}`,
            nodeOptions: {
              metadata: queue.metadata,
              volume: queue.node.volume,
              bufferingTimeout: 15_000,
              selfDeaf: true,
            },
            requestedBy: { username: "Dashboard" } as any,
          });

          return sendJson(res, 200, {
            success: true,
            track: serializeTrack(result.track),
            position: queue.tracks.size,
          });
        } catch (err: any) {
          console.error("[MusicAPI] Error playing:", err);
          return sendJson(res, 500, { error: err.message || "Failed to play" });
        }
      }

      // Route: POST /music/skip/:guildId
      const skipMatch = pathname.match(/^\/music\/skip\/(\d+)$/);
      if (skipMatch && req.method === "POST") {
        const guildId = skipMatch[1];
        try {
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue || !queue.currentTrack) {
            return sendJson(res, 400, { error: "Nothing is playing" });
          }
          const skipped = queue.currentTrack.title;
          queue.node.skip();
          return sendJson(res, 200, { success: true, skipped });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // Route: POST /music/pause/:guildId
      const pauseMatch = pathname.match(/^\/music\/pause\/(\d+)$/);
      if (pauseMatch && req.method === "POST") {
        const guildId = pauseMatch[1];
        try {
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });
          queue.node.pause();
          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // Route: POST /music/resume/:guildId
      const resumeMatch = pathname.match(/^\/music\/resume\/(\d+)$/);
      if (resumeMatch && req.method === "POST") {
        const guildId = resumeMatch[1];
        try {
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });
          queue.node.resume();
          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // Route: POST /music/stop/:guildId
      const stopMatch = pathname.match(/^\/music\/stop\/(\d+)$/);
      if (stopMatch && req.method === "POST") {
        const guildId = stopMatch[1];
        try {
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });
          queue.delete();
          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
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
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });
          queue.node.setVolume(level);
          return sendJson(res, 200, { success: true, volume: level });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // Route: POST /music/shuffle/:guildId
      const shuffleMatch = pathname.match(/^\/music\/shuffle\/(\d+)$/);
      if (shuffleMatch && req.method === "POST") {
        const guildId = shuffleMatch[1];
        try {
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });
          queue.tracks.shuffle();
          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // Route: POST /music/remove/:guildId
      const removeMatch = pathname.match(/^\/music\/remove\/(\d+)$/);
      if (removeMatch && req.method === "POST") {
        const guildId = removeMatch[1];
        try {
          const body = await parseBody(req);
          const index = Number(body.index);
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });
          if (isNaN(index) || index < 0 || index >= queue.tracks.size) {
            return sendJson(res, 400, { error: "Invalid track index" });
          }
          const removed = queue.tracks.toArray()[index];
          queue.removeTrack(index);
          return sendJson(res, 200, {
            success: true,
            removed: removed?.title || "Unknown",
          });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // Route: POST /music/reorder/:guildId
      const reorderMatch = pathname.match(/^\/music\/reorder\/(\d+)$/);
      if (reorderMatch && req.method === "POST") {
        const guildId = reorderMatch[1];
        try {
          const body = await parseBody(req);
          const fromIndex = Number(body.from);
          const toIndex = Number(body.to);
          const player = useMainPlayer();
          const queue = player.queues.get(guildId);
          if (!queue)
            return sendJson(res, 400, { error: "Nothing is playing" });

          const tracks = queue.tracks.toArray();
          if (
            isNaN(fromIndex) ||
            isNaN(toIndex) ||
            fromIndex < 0 ||
            fromIndex >= tracks.length ||
            toIndex < 0 ||
            toIndex >= tracks.length
          ) {
            return sendJson(res, 400, { error: "Invalid indices" });
          }

          // Remove the track from old position and insert at new position
          const [track] = tracks.splice(fromIndex, 1);
          tracks.splice(toIndex, 0, track);

          // Clear and re-add all tracks in new order
          queue.tracks.clear();
          for (const t of tracks) {
            queue.tracks.add(t);
          }

          return sendJson(res, 200, { success: true });
        } catch (err: any) {
          return sendJson(res, 500, { error: err.message });
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

          const player = useMainPlayer();

          const isUrl = /^https?:\/\//i.test(query);
          const result = (await Promise.race([
            player.search(query, {
              searchEngine: isUrl
                ? QueryType.AUTO
                : `ext:${YoutubeiExtractor.identifier}`,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Search timeout")), 10000),
            ),
          ])) as any;

          if (!result?.tracks?.length) {
            return sendJson(res, 200, { results: [] });
          }

          // Detect playlist: result.playlist is set, or URL resolved to many tracks
          const isPlaylist =
            result.playlist != null || (isUrl && result.tracks.length > 1);

          const results: SearchResult[] = result.tracks
            .slice(0, isPlaylist ? 50 : 10)
            .map((t: any) => ({
              title: t.title || "Unknown",
              url: t.url || "",
              duration: t.duration || "0:00",
              thumbnail: t.thumbnail || "",
              author: t.author || "Unknown",
            }));

          return sendJson(res, 200, {
            results,
            isPlaylist,
            trackCount: isPlaylist ? result.tracks.length : undefined,
            playlistTitle: isPlaylist
              ? result.playlist?.title || undefined
              : undefined,
          });
        } catch (err: any) {
          console.error("[MusicAPI] Search error:", err);
          return sendJson(res, 500, { error: err.message || "Search failed" });
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
          return sendJson(res, 500, { error: err.message });
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

          const preQueue = await getPreQueue(guildId);
          const maxQueueSize = await getMaxQueueSize(guildId);
          if (preQueue.length >= maxQueueSize) {
            return sendJson(res, 400, {
              error: `Pre-queue is full (max ${maxQueueSize} songs)`,
            });
          }

          // Search for the track(s) to get metadata
          const player = useMainPlayer();
          const isUrl = /^https?:\/\//i.test(query);
          const result = (await Promise.race([
            player.search(query, {
              searchEngine: isUrl
                ? QueryType.AUTO
                : `ext:${YoutubeiExtractor.identifier}`,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Search timeout")), 10000),
            ),
          ])) as any;

          if (!result?.tracks?.length) {
            return sendJson(res, 404, { error: "No results found" });
          }

          // Determine if this is a playlist (discord-player sets result.playlist, or URL gives multiple tracks)
          const isPlaylist =
            result.playlist != null || (isUrl && result.tracks.length > 1);
          const tracksToAdd = isPlaylist ? result.tracks : [result.tracks[0]];
          const slotsAvailable = maxQueueSize - preQueue.length;
          const capped = tracksToAdd.slice(0, slotsAvailable);

          const addedItems: PreQueueItem[] = capped.map((track: any) => ({
            title: track.title || "Unknown",
            url: track.url || query,
            duration: track.duration || "0:00",
            thumbnail: track.thumbnail || "",
            author: track.author || "Unknown",
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
          console.error("[MusicAPI] Pre-queue add error:", err);
          return sendJson(res, 500, { error: err.message || "Failed to add" });
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
          return sendJson(res, 500, { error: err.message });
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
          return sendJson(res, 500, { error: err.message });
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
          return sendJson(res, 500, { error: err.message });
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
