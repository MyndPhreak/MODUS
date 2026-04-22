/**
 * GET /api/stats
 * Public bot stats for the landing page. Unauthenticated.
 */
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

const HEARTBEAT_WINDOW_MS = 120_000; // 2 min

export default defineEventHandler(async (): Promise<StatsResponse> => {
  const repos = getRepos();
  if (!repos) return FALLBACK;

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
});
