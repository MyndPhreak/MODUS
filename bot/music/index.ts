import type { Client } from "discord.js";
import type { MusicRepository } from "@modus/db";
import type { RedisClients } from "../RedisClient";
import { GuildPlaybackLease } from "./GuildPlaybackLease";
import {
  LavalinkAdapter,
  type LavalinkLoadRequest,
  type LavalinkLoadResult,
} from "./LavalinkAdapter";
import type { MusicPlaybackEvent } from "./LavalinkEvents";
import { LavalinkMusicService, type AdvanceQueueOptions } from "./LavalinkMusicService";
import { MusicMetrics } from "./MusicMetrics";
import { CHANNEL_MUSIC_STATE, type MusicStateEvent, type RecoverGuildInput } from "./MusicRecovery";
import type { MusicService } from "./MusicService";
import { NodeRegistry } from "./NodeRegistry";
import { parseLavalinkNodes } from "./node-config";
import type { MusicQueueSnapshot, MusicResult } from "./types";

export type { MusicService } from "./MusicService";

const NODE_WAIT_TIMEOUT_MS = 5_000;
const NODE_WAIT_INTERVAL_MS = 250;

/**
 * The Lavalink boundary the command layer is allowed to touch: playback events
 * to render, and track resolution that turns a query into a canonical track.
 * `MusicService` owns every state mutation.
 */
export interface MusicEngine {
  on(eventName: "playback", listener: (event: MusicPlaybackEvent) => void): unknown;
  off(eventName: "playback", listener: (event: MusicPlaybackEvent) => void): unknown;
  loadTracks(request: LavalinkLoadRequest): Promise<MusicResult<LavalinkLoadResult>>;
}

export interface MusicRuntime {
  readonly musicService: MusicService;
  readonly engine: MusicEngine;
  /**
   * Observability rollup for this process. Built here because it needs the
   * node registry, which stays private to the control plane.
   */
  readonly metrics: MusicMetrics;
  /** Moves the durable queue on after a track ended on its own. */
  advance(
    guildId: string,
    options?: AdvanceQueueOptions,
  ): Promise<MusicResult<MusicQueueSnapshot>>;
  /** Connects to Lavalink and recovers sessions this process owns. */
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

interface MusicEventPublisher {
  publish(channel: string, payload: MusicStateEvent): Promise<void>;
}

interface MusicRuntimeLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface CreateMusicServiceOptions {
  client: Client;
  repository: MusicRepository;
  redisClients: RedisClients | null;
  /** Optional: without Redis there is no realtime fan-out, only local state. */
  eventBus: MusicEventPublisher | null;
  shardId?: number;
  logger?: MusicRuntimeLogger;
  environment?: NodeJS.ProcessEnv;
}

const noopPublisher: MusicEventPublisher = {
  async publish(): Promise<void> {},
};

const consoleLogger: MusicRuntimeLogger = {
  info: (message) => console.log(`[Music] ${message}`),
  warn: (message) => console.warn(`[Music] ${message}`),
  error: (message, error) => console.error(`[Music] ${message}`, error ?? ""),
};

/**
 * Builds the production music control plane. Returns null when no Lavalink
 * node is configured; malformed configuration throws so a deployment cannot
 * silently run without the playback engine it declared.
 */
export function createMusicService(options: CreateMusicServiceOptions): MusicRuntime | null {
  const environment = options.environment ?? process.env;
  const logger = options.logger ?? consoleLogger;

  if (!environment.LAVALINK_NODES_JSON?.trim()) {
    logger.warn("LAVALINK_NODES_JSON is not set — music playback is unavailable.");
    return null;
  }

  const shardId = options.shardId ?? 0;
  // Malformed node configuration is a deployment error and must not be
  // swallowed — a bot that silently runs without its declared playback engine
  // is worse than one that refuses to start.
  const nodeRegistry = new NodeRegistry(parseLavalinkNodes(environment));
  const adapter = new LavalinkAdapter(options.client, nodeRegistry);

  let lease: GuildPlaybackLease;
  try {
    lease = new GuildPlaybackLease({
      redisClients: options.redisClients,
      ownerId: `${process.pid}:shard-${shardId}`,
    });
  } catch (error) {
    // Multi-process deployments require Redis for playback ownership. Music
    // fails closed rather than risking two shards driving one guild.
    logger.error("Guild playback leases are unavailable — music is disabled.", error);
    return null;
  }

  const musicService = new LavalinkMusicService({
    repository: options.repository,
    nodeRegistry,
    lease,
    adapter,
    eventBus: options.eventBus ?? noopPublisher,
    shardId,
  });

  const metrics = new MusicMetrics({
    shardId,
    nodes: () => nodeRegistry.snapshots(),
  });

  return {
    musicService,
    engine: adapter,
    metrics,

    advance(guildId: string, options: AdvanceQueueOptions = {}) {
      return musicService.advanceQueue(guildId, `advance:${guildId}:${Date.now()}`, options);
    },

    async start(): Promise<void> {
      const connected = await adapter.connect();
      if (!connected.ok) {
        logger.error(`Lavalink connection failed: ${connected.error.code}`);
        return;
      }
      logger.info(
        `Lavalink nodes configured: ${nodeRegistry.snapshots().map((node) => node.id).join(", ")}`,
      );
      await recoverDormantSessions({
        client: options.client,
        repository: options.repository,
        musicService,
        nodeRegistry,
        shardId,
        logger,
      });
    },

    async shutdown(): Promise<void> {
      await musicService.shutdown();
    },
  };
}

export interface DormantRecoveryContext {
  client: Pick<Client, "guilds">;
  repository: Pick<MusicRepository, "listRecoverableSessions">;
  musicService: Pick<LavalinkMusicService, "recoverOnStartup">;
  nodeRegistry: NodeRegistry;
  shardId: number;
  logger: MusicRuntimeLogger;
  /** Injectable for tests; production waits on the real clock. */
  sleep?: (milliseconds: number) => Promise<void>;
  nodeWaitTimeoutMs?: number;
}

/**
 * Restores guilds that were mid-playback when this process last stopped. Only
 * guilds this process currently holds are recovered — a guild owned by another
 * shard is that shard's session to fence, not ours.
 */
export async function recoverDormantSessions(context: DormantRecoveryContext): Promise<void> {
  let sessions;
  try {
    sessions = await context.repository.listRecoverableSessions();
  } catch (error) {
    context.logger.error("Failed to read recoverable music sessions", error);
    return;
  }

  const owned: RecoverGuildInput[] = sessions.flatMap((session) => {
    const guild = context.client.guilds.cache.get(session.guildId);
    if (!guild) return [];
    const voiceChannelId = guild.members.me?.voice?.channelId ?? undefined;
    return [{
      guildId: session.guildId,
      failedNodeId: session.assignedNodeId,
      // The node is the previous owner, not a failed one — a startup restore
      // must never mark the node this process just connected to as down.
      markNodeFailed: false,
      operationId: `recover:startup:${session.revision}`,
      ...(voiceChannelId ? { voiceChannelId, shardId: context.shardId } : {}),
    }];
  });
  if (owned.length === 0) return;

  if (!(await waitForAvailableNode(context))) {
    context.logger.warn(
      `No Lavalink node became available — ${owned.length} dormant music session(s) stay queued.`,
    );
    return;
  }

  context.logger.info(`Recovering ${owned.length} dormant music session(s).`);
  const results = await context.musicService.recoverOnStartup(owned);
  for (const result of results) {
    if (result.ok) continue;
    context.logger.error(
      `Startup music recovery failed for guild ${result.guildId}: ${result.errorCode ?? "unknown"}`,
    );
  }
}

async function waitForAvailableNode(context: DormantRecoveryContext): Promise<boolean> {
  const sleep = context.sleep
    ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = context.nodeWaitTimeoutMs ?? NODE_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (context.nodeRegistry.snapshots().some((node) => node.available)) return true;
    await sleep(NODE_WAIT_INTERVAL_MS);
  }
  return context.nodeRegistry.snapshots().some((node) => node.available);
}

export { CHANNEL_MUSIC_STATE };
