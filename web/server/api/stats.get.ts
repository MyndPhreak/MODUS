/**
 * GET /api/stats
 *
 * Returns public bot stats for the landing page (server count, version,
 * shard count). Unauthenticated.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true — the server count
 * becomes an indexed COUNT(*) instead of an Appwrite listDocuments call,
 * and the bot_status scan stays bounded at 50 rows.
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRepos } from "../utils/db";

interface StatsResponse {
  serverCount: number;
  version: string;
  shardCount: number;
  totalShards: number;
  online: boolean;
}

const FALLBACK: StatsResponse = {
  serverCount: 0,
  version: "1.0.0",
  shardCount: 0,
  totalShards: 0,
  online: false,
};

const HEARTBEAT_WINDOW_MS = 120_000; // 2 min — matches the existing Appwrite path

export default defineEventHandler(async (): Promise<StatsResponse> => {
  const config = useRuntimeConfig();

  const repos = getRepos();
  if (repos) {
    try {
      const [serverCount, shards] = await Promise.all([
        repos.servers.countAll(),
        repos.botStatus.listAll(25),
      ]);
      const shard0 =
        shards.find((s) => s.bot_id?.includes("Shard 0")) ?? shards[0];
      const now = Date.now();
      const onlineShards = shards.filter(
        (s) =>
          s.last_seen &&
          now - new Date(s.last_seen).getTime() < HEARTBEAT_WINDOW_MS,
      );
      return {
        serverCount,
        version: shard0?.version || "1.0.0",
        shardCount: onlineShards.length,
        totalShards: shard0?.total_shards ?? shards.length,
        online: onlineShards.length > 0,
      };
    } catch (error: any) {
      console.error("[Stats API] Postgres error:", error?.message || error);
      return FALLBACK;
    }
  }

  try {
    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(config.public.appwriteProjectId as string)
      .setKey(config.appwriteApiKey as string);

    const databases = new Databases(client);

    const servers = await databases.listDocuments("discord_bot", "servers", [
      Query.limit(1),
    ]);

    const botStatus = await databases.listDocuments(
      "discord_bot",
      "bot_status",
      [Query.limit(25)],
    );

    const shard0 =
      botStatus.documents.find((d: any) => d.bot_id?.includes("Shard 0")) ||
      botStatus.documents[0];

    const now = Date.now();
    const onlineShards = botStatus.documents.filter((d: any) => {
      if (!d.last_seen) return false;
      return now - new Date(d.last_seen).getTime() < HEARTBEAT_WINDOW_MS;
    });

    return {
      serverCount: servers.total,
      version: shard0?.version || "1.0.0",
      shardCount: onlineShards.length,
      totalShards: shard0?.total_shards ?? botStatus.total,
      online: onlineShards.length > 0,
    };
  } catch (error: any) {
    console.error("[Stats API] Error:", error.message);
    return FALLBACK;
  }
});
