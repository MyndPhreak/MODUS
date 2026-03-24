import { Client, Databases, Query } from "node-appwrite";

/**
 * GET /api/stats
 * Returns public bot stats for the landing page (server count, version, shard count).
 * This is a lightweight, unauthenticated endpoint.
 */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig();

  try {
    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(config.public.appwriteProjectId as string)
      .setKey(config.appwriteApiKey as string);

    const databases = new Databases(client);

    // Count registered servers
    const servers = await databases.listDocuments("discord_bot", "servers", [
      Query.limit(1), // We only need the total count
    ]);

    // Get bot status / shard info
    const botStatus = await databases.listDocuments(
      "discord_bot",
      "bot_status",
      [Query.limit(25)]
    );

    // Find latest version from shard 0 (or first available)
    const shard0 =
      botStatus.documents.find((d: any) => d.bot_id?.includes("Shard 0")) ||
      botStatus.documents[0];

    // Count online shards (last_seen within 2 minutes)
    const now = Date.now();
    const onlineShards = botStatus.documents.filter((d: any) => {
      if (!d.last_seen) return false;
      return now - new Date(d.last_seen).getTime() < 120_000;
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
    return {
      serverCount: 0,
      version: "1.0.0",
      shardCount: 0,
      totalShards: 0,
      online: false,
    };
  }
});
