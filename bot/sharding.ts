import { ShardingManager } from "discord.js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

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

manager.spawn().catch((err) => {
  console.error("[Sharding] Error spawning shards:", err);
});
