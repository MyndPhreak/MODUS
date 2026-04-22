import { Client, GatewayIntentBits, Events, Partials } from "discord.js";
import { Player } from "discord-player";
import { DefaultExtractors, SpotifyExtractor } from "@discord-player/extractor";
import { YoutubeiExtractor } from "discord-player-youtubei";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import { ModuleManager } from "./ModuleManager";
import { DatabaseService } from "./DatabaseService";
import { ServerStatusService } from "./ServerStatusService";
import { RecordingRetentionWorker } from "./RecordingRetentionWorker";
import { TranscriptRetentionWorker } from "./TranscriptRetentionWorker";
import { Logger } from "./Logger";
import {
  createRedisClients,
  closeRedisClients,
  type RedisClients,
} from "./RedisClient";
import { EventBus } from "./EventBus";
import { LeaderElection } from "./LeaderElection";
import {
  createYtDlpStreamFunction,
  createSpotifyBridgeStreamFunction,
} from "./lib/ytdlp-stream";
import { registerWelcomeEvents } from "./modules/welcome";
import { registerMilestoneEvents } from "./modules/milestones";
import { registerAutoModEvents } from "./modules/automod";
import { registerAIEvents } from "./modules/ai";
import { registerLoggingEvents } from "./modules/logging";
import { registerTempVoiceEvents } from "./modules/tempvoice";
import { registerAntiRaidEvents } from "./modules/antiraid";
import { registerVerificationEvents } from "./modules/verification";
import { registerTicketsEvents } from "./modules/tickets/index";
import { registerReactionRolesEvents } from "./modules/reaction-roles";
import { registerPollsEvents } from "./modules/polls";
import { registerEventsEvents } from "./modules/events";
import { registerAlertsEvents } from "./modules/alerts";
import { registerMusicAPI } from "./MusicAPI";
import { registerWebhookRoutes } from "./WebhookRouter";

dotenv.config();

// Silence verbose parsing warnings from youtubei.js
import { Log } from "youtubei.js";
Log.setLevel(Log.Level.ERROR);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
});

// Initialize discord-player
const player = new Player(client, {
  probeTimeout: 20000,
  connectionTimeout: 20000,
});

// Load default extractors + YouTube extractor (removed from defaults in v7)
// Load extractors before login
async function loadExtractors() {
  try {
    await player.extractors.loadMulti(DefaultExtractors);
    await player.extractors.register(YoutubeiExtractor, {
      streamOptions: {
        useClient: "TV_EMBEDDED",
        highWaterMark: 1024 * 1024 * 10,
      },
      // Use yt-dlp for streaming — bypasses YouTube's 30-second throttle
      createStream: createYtDlpStreamFunction,
    } as any);

    const spClientId =
      process.env.DP_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || null;
    const spClientSecret =
      process.env.DP_SPOTIFY_CLIENT_SECRET ||
      process.env.SPOTIFY_CLIENT_SECRET ||
      null;

    await player.extractors.register(SpotifyExtractor, {
      clientId: spClientId,
      clientSecret: spClientSecret,
      createStream: createSpotifyBridgeStreamFunction,
    } as any);

    console.log(
      "[Music] All extractors loaded:",
      player.extractors.store.map((e) => e.identifier).join(", "),
    );
    console.log(
      `[Music] Spotify API credentials: ${spClientId ? "✅ present" : "❌ missing"}`,
    );
  } catch (err) {
    console.error("[Music] Failed to load extractors:", err);
  }
}
// Expect loadExtractors to be awaited in the init flow or use top-level await if module
// For now, we'll keep it as a promise chain or await it in client.once("ready")

// Redis is optional: when REDIS_URL is unset, `clients` is null and
// everything downstream falls back to in-process behavior (same as before).
const redisClients: RedisClients | null = createRedisClients();
const eventBus: EventBus | null = redisClients
  ? new EventBus(redisClients)
  : null;

const databaseService = new DatabaseService({ eventBus });
const shardId = client.shard?.ids[0] ?? 0;
const logger = new Logger(databaseService, shardId);
const moduleManager = new ModuleManager(client, logger, player);
const serverStatusService = new ServerStatusService(client, databaseService);

client.once("ready", async () => {
  const shardIdStr = client.shard?.ids[0] ?? "N/A";
  logger.info(`Logged in as ${client.user?.tag}!`);

  // ─── Crash-Recovery ─────────────────────────────────────────────────

  // 1. Reset stale nicknames left behind by music (🎵) or recording (🔴)
  try {
    const staleGuilds: string[] = [];
    await Promise.allSettled(
      client.guilds.cache.map(async (guild) => {
        const me =
          guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
        if (me?.nickname?.startsWith("🎵") || me?.nickname?.startsWith("🔴")) {
          await me.setNickname(null);
          staleGuilds.push(`${guild.name} (was: ${me.nickname})`);
        }
      }),
    );
    if (staleGuilds.length > 0) {
      logger.info(
        `[CrashRecovery] Reset stale nickname in ${staleGuilds.length} guild(s): ${staleGuilds.join(", ")}`,
      );
    }
  } catch (err) {
    logger.warn(
      `[CrashRecovery] Nickname reset check failed: ${(err as Error).message}`,
    );
  }

  // 2. Clean up orphaned temp recording files from a previous crash
  try {
    const tempDir = path.join(os.tmpdir(), "modus-recordings");
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      if (files.length > 0) {
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(tempDir, file));
          } catch {}
        }
        logger.info(
          `[CrashRecovery] Cleaned up ${files.length} orphaned temp recording file(s)`,
        );
      }
    }
  } catch (err) {
    logger.warn(
      `[CrashRecovery] Temp file cleanup failed: ${(err as Error).message}`,
    );
  }

  // Auto-populate CLIENT_ID from token if missing
  if (!process.env.CLIENT_ID && process.env.DISCORD_TOKEN) {
    try {
      const clientId = Buffer.from(
        process.env.DISCORD_TOKEN.split(".")[0],
        "base64",
      ).toString();
      process.env.CLIENT_ID = clientId;
      logger.info(`Auto-detected Client ID: ${clientId}`);
    } catch (e) {
      logger.error(`Failed to auto-detect Client ID from token.`, undefined, e);
    }
  }

  await loadExtractors();
  await moduleManager.loadModules();
  registerWelcomeEvents(moduleManager);
  registerMilestoneEvents(moduleManager);
  registerAutoModEvents(moduleManager);
  registerAIEvents(moduleManager);
  registerLoggingEvents(moduleManager);
  await registerTempVoiceEvents(moduleManager);
  registerAntiRaidEvents(moduleManager);
  registerVerificationEvents(moduleManager);
  registerTicketsEvents(moduleManager);
  registerReactionRolesEvents(moduleManager);
  registerPollsEvents(moduleManager);
  registerEventsEvents(moduleManager);
  registerAlertsEvents(moduleManager);
  serverStatusService.start();

  // ── Recording retention ──────────────────────────────────────────────
  // Only one shard in the fleet should run this at a time — otherwise
  // every shard would race to delete the same rows.
  //
  // With Redis: acquire a distributed lease; any shard can win, and if
  // the leader dies, the lease TTL expires and another shard takes over.
  // Without Redis: fall back to the previous shard-0 guard, since there's
  // no cross-process coordination available.
  const retentionDays = parseInt(
    process.env.RECORDING_RETENTION_DAYS || "0",
    10,
  );
  if (retentionDays > 0) {
    const retentionWorker = new RecordingRetentionWorker(
      databaseService,
      logger,
      retentionDays,
    );

    if (redisClients) {
      const ownerId = `${process.pid}:shard-${shardId}`;
      new LeaderElection({
        redis: redisClients.primary,
        key: "modus:leader:recording-retention",
        ownerId,
        onAcquired: () => {
          logger.info(
            `Recording retention: leader election won (${ownerId})`,
            undefined,
            "retention",
          );
          retentionWorker.start();
        },
        onLost: () => {
          logger.warn(
            `Recording retention: lost leader lease (${ownerId}) — stopping worker`,
            undefined,
            "retention",
          );
          retentionWorker.stop();
        },
      }).start();
    } else if (typeof shardId !== "number" || shardId === 0) {
      retentionWorker.start();
    }
  }

  // Transcript retention sweep — independent of recordings. Cadence is
  // fixed at 6h; expires_at is frozen at ticket close time.
  const transcriptWorker = new TranscriptRetentionWorker(
    databaseService,
    logger,
  );

  if (redisClients) {
    const ownerId = `${process.pid}:shard-${shardId}`;
    new LeaderElection({
      redis: redisClients.primary,
      key: "modus:leader:transcript-retention",
      ownerId,
      onAcquired: () => {
        logger.info(
          `Transcript retention: leader election won (${ownerId})`,
          undefined,
          "transcripts",
        );
        transcriptWorker.start();
      },
      onLost: () => {
        logger.warn(
          `Transcript retention: lost leader lease (${ownerId}) — stopping worker`,
          undefined,
          "transcripts",
        );
        transcriptWorker.stop();
      },
    }).start();
  } else if (typeof shardId !== "number" || shardId === 0) {
    transcriptWorker.start();
  }

  let botVersion = process.env.npm_package_version || "1.0.0";
  if (!process.env.npm_package_version) {
    try {
      const pkgPath = path.join(__dirname, "package.json");
      botVersion = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
    } catch {
      try {
        const pkgPath = path.join(__dirname, "../package.json");
        botVersion = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
      } catch {}
    }
  }

  const updateHeartbeat = () => {
    databaseService.updateBotHeartbeat(
      `bot-shard-${shardId}`,
      botVersion,
      typeof shardId === "number" ? shardId : 0,
      client.shard?.count ?? 1,
    );
  };

  updateHeartbeat();
  setInterval(updateHeartbeat, 60000); // Pulse every minute
});

// Health Check Server
const basePort = parseInt(process.env.BOT_PORT || "3000");
const shardOffset = client.shard?.ids[0] ?? 0;
const PORT = basePort + (typeof shardOffset === "number" ? shardOffset : 0);

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`OK (Shard ${shardOffset})`);
});

// Handle port-in-use gracefully (common during nodemon restarts)
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    const retryCount = (server as any).__retryCount ?? 0;
    if (retryCount < 5) {
      (server as any).__retryCount = retryCount + 1;
      console.warn(
        `[Bot] Port ${PORT} still in use, retrying in 1.5s... (attempt ${retryCount + 1}/5)`,
      );
      setTimeout(() => server.listen(PORT), 1500);
    } else {
      console.error(`[Bot] Port ${PORT} occupied after 5 retries. Exiting.`);
      process.exit(1);
    }
  } else {
    throw err;
  }
});

server.listen(PORT, () => {
  logger.info(`Health check server running on port ${PORT}`);
  registerMusicAPI(server, client);
  registerWebhookRoutes(server, client, databaseService);
});

client.on("interactionCreate", async (interaction) => {
  await moduleManager.handleInteraction(interaction);
});

client.login(process.env.DISCORD_TOKEN);

// ─── Graceful Shutdown (prevents "port in use" on nodemon restart) ────────
function gracefulShutdown(signal: string) {
  console.log(`[Bot] Received ${signal}, shutting down gracefully...`);

  // Close the HTTP server first to free the port immediately
  server.close(() => {
    console.log("[Bot] HTTP server closed.");
  });

  // Destroy the Discord client connection
  client.destroy();

  // Best-effort Redis quiesce. Matters most for leader election — quitting
  // lets the lease release via Lua CAS (inside LeaderElection.stop); without
  // this, the next leader waits the full TTL before picking up.
  closeRedisClients(redisClients).catch(() => {});

  // Force exit after a short grace period
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Global Error Handlers to prevent bot crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Bot] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Bot] Uncaught Exception thrown:", err);
});
