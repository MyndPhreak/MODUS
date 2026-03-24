import { ShardingManager } from "discord.js";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { AppwriteService } from "./AppwriteService";
import { AlertsWorker } from "./AlertsWorker";

dotenv.config();

// Auto-generate a stable EventSub secret if not provided (logged so it can be set in .env)
if (!process.env.TWITCH_EVENTSUB_SECRET) {
  process.env.TWITCH_EVENTSUB_SECRET = crypto.randomBytes(24).toString("hex");
  console.warn(
    "[Sharding] TWITCH_EVENTSUB_SECRET not set — generated ephemeral secret:",
    process.env.TWITCH_EVENTSUB_SECRET,
    "\nAdd this to .env as TWITCH_EVENTSUB_SECRET to keep Twitch subscriptions stable across restarts.",
  );
}

const entryFile = process.env.TS_NODE_DEV === "true" ? "index.ts" : "index.js";

const manager = new ShardingManager(path.join(__dirname, entryFile), {
  token: process.env.DISCORD_TOKEN,
  totalShards: "auto",
  execArgv:
    process.env.TS_NODE_DEV === "true" ? ["-r", "ts-node/register"] : [],
});

manager.on("shardCreate", (shard) => {
  console.log(`[Sharding] Launched shard ${shard.id}`);

  shard.on("ready", () => {
    console.log(`[Shard ${shard.id}] ✅ Ready and serving guilds`);
  });

  shard.on("disconnect", () => {
    console.warn(`[Shard ${shard.id}] ⚠️ Disconnected from gateway`);
  });

  shard.on("reconnecting", () => {
    console.log(`[Shard ${shard.id}] 🔄 Reconnecting...`);
  });

  shard.on("death", (process) => {
    console.error(
      `[Shard ${shard.id}] 💀 Process died (exit code: ${(process as any).exitCode ?? "unknown"})`,
    );
  });

  shard.on("error", (error) => {
    console.error(`[Shard ${shard.id}] ❌ Error:`, error);
  });
});

console.log(`[Sharding] Starting with totalShards: ${manager.totalShards}`);

manager.spawn().then(() => {
  // Start AlertsWorker in the manager process (once, not per shard)
  const appwrite = new AppwriteService();
  const alertsWorker = new AlertsWorker(appwrite, 10); // 10-minute polling interval
  alertsWorker.start();

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[Sharding] ${signal} received — stopping alerts worker`);
    alertsWorker.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}).catch((err) => {
  console.error("[Sharding] Error spawning shards:", err);
});

