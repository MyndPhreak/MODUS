import { Client, GatewayIntentBits, Events } from "discord.js";
import { Player } from "discord-player";
import { DefaultExtractors } from "@discord-player/extractor";
import { YoutubeiExtractor } from "discord-player-youtubei";
import http from "http";
import dotenv from "dotenv";
import { ModuleManager } from "./ModuleManager";
import { AppwriteService } from "./AppwriteService";
import { ServerStatusService } from "./ServerStatusService";
import { Logger } from "./Logger";
import { createYtDlpStreamFunction } from "./lib/ytdlp-stream";
import { registerWelcomeEvents } from "./modules/welcome";
import { registerMilestoneEvents } from "./modules/milestones";
import { registerMusicAPI } from "./MusicAPI";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// Initialize discord-player
const player = new Player(client);

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
    console.log(
      "[Music] All extractors loaded:",
      player.extractors.store.map((e) => e.identifier).join(", "),
    );
  } catch (err) {
    console.error("[Music] Failed to load extractors:", err);
  }
}
// Expect loadExtractors to be awaited in the init flow or use top-level await if module
// For now, we'll keep it as a promise chain or await it in client.once("ready")

const appwriteService = new AppwriteService();
const shardId = client.shard?.ids[0] ?? 0;
const logger = new Logger(appwriteService, shardId);
const moduleManager = new ModuleManager(client, logger, player);
const serverStatusService = new ServerStatusService(client, appwriteService);

client.once("ready", async () => {
  const shardIdStr = client.shard?.ids[0] ?? "N/A";
  logger.info(`Logged in as ${client.user?.tag}!`);

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
  serverStatusService.start();

  const updateHeartbeat = () => {
    appwriteService.updateBotHeartbeat(
      `bot-shard-${shardId}`,
      process.env.npm_package_version || "1.0.0",
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

server.listen(PORT, () => {
  logger.info(`Health check server running on port ${PORT}`);
  registerMusicAPI(server, client);
});

client.on("interactionCreate", async (interaction) => {
  await moduleManager.handleInteraction(interaction);
});

client.login(process.env.DISCORD_TOKEN);

// Global Error Handlers to prevent bot crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Bot] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Bot] Uncaught Exception thrown:", err);
});
