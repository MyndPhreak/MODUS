import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function memBar(used: number, total: number, length: number = 10): string {
  const ratio = Math.min(used / total, 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const percent = (ratio * 100).toFixed(0);
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${percent}%`;
}

const shardInfoModule: BotModule = {
  name: "shard-info",
  description: "Shows shard diagnostics and performance metrics",
  data: new SlashCommandBuilder()
    .setName("shard-info")
    .setDescription("Shows shard diagnostics and performance metrics")
    .toJSON(),
  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const client = interaction.client;
    const currentShardId = client.shard?.ids[0] ?? 0;
    const totalShards = client.shard?.count ?? 1;

    // ─── Gather stats from ALL shards via broadcastEval ───────────────
    interface ShardStats {
      id: number;
      guilds: number;
      users: number;
      channels: number;
      ping: number;
      uptime: number;
      memUsed: number;
      memTotal: number;
      memRss: number;
    }

    let allShardStats: ShardStats[] = [];

    try {
      if (client.shard) {
        // Multi-shard: broadcast across all shards
        const results = (await client.shard.broadcastEval((c) => {
          const mem = process.memoryUsage();
          return {
            id: c.shard?.ids[0] ?? 0,
            guilds: c.guilds.cache.size,
            users: c.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
            channels: c.channels.cache.size,
            ping: c.ws.ping,
            uptime: c.uptime ?? 0,
            memUsed: mem.heapUsed,
            memTotal: mem.heapTotal,
            memRss: mem.rss,
          };
        })) as ShardStats[];
        allShardStats = results;
      } else {
        // Single process (no sharding manager)
        const mem = process.memoryUsage();
        allShardStats = [
          {
            id: 0,
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce(
              (acc, g) => acc + g.memberCount,
              0,
            ),
            channels: client.channels.cache.size,
            ping: client.ws.ping,
            uptime: client.uptime ?? 0,
            memUsed: mem.heapUsed,
            memTotal: mem.heapTotal,
            memRss: mem.rss,
          },
        ];
      }
    } catch (err) {
      console.error("[shard-info] broadcastEval failed:", err);
      // Fallback to local stats only
      const mem = process.memoryUsage();
      allShardStats = [
        {
          id: currentShardId,
          guilds: client.guilds.cache.size,
          users: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
          channels: client.channels.cache.size,
          ping: client.ws.ping,
          uptime: client.uptime ?? 0,
          memUsed: mem.heapUsed,
          memTotal: mem.heapTotal,
          memRss: mem.rss,
        },
      ];
    }

    // ─── Aggregate totals ─────────────────────────────────────────────
    const totals = allShardStats.reduce(
      (acc, s) => ({
        guilds: acc.guilds + s.guilds,
        users: acc.users + s.users,
        channels: acc.channels + s.channels,
        memUsed: acc.memUsed + s.memUsed,
        memRss: acc.memRss + s.memRss,
      }),
      { guilds: 0, users: 0, channels: 0, memUsed: 0, memRss: 0 },
    );

    // ─── Build embed ──────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setTitle("🔧 Shard Diagnostics")
      .setColor(0x5865f2)
      .setTimestamp();

    // Cluster overview
    embed.addFields({
      name: "📊 Cluster Overview",
      value: [
        `**Shards:** ${totalShards}`,
        `**Total Guilds:** ${totals.guilds.toLocaleString()}`,
        `**Total Users:** ${totals.users.toLocaleString()}`,
        `**Total Channels:** ${totals.channels.toLocaleString()}`,
        `**Total Memory (RSS):** ${formatBytes(totals.memRss)}`,
      ].join("\n"),
      inline: false,
    });

    // Per-shard breakdown
    for (const shard of allShardStats) {
      const isCurrent = shard.id === currentShardId;
      const label = isCurrent
        ? `⭐ Shard ${shard.id} (this guild)`
        : `Shard ${shard.id}`;
      const pingColor =
        shard.ping < 100 ? "🟢" : shard.ping < 200 ? "🟡" : "🔴";

      embed.addFields({
        name: label,
        value: [
          `${pingColor} **Ping:** ${shard.ping}ms`,
          `📡 **Guilds:** ${shard.guilds.toLocaleString()}`,
          `⏱️ **Uptime:** ${formatUptime(shard.uptime)}`,
          `💾 **Heap:** ${memBar(shard.memUsed, shard.memTotal)} (${formatBytes(shard.memUsed)} / ${formatBytes(shard.memTotal)})`,
          `📦 **RSS:** ${formatBytes(shard.memRss)}`,
        ].join("\n"),
        inline: allShardStats.length <= 6, // side-by-side for ≤6 shards
      });
    }

    // Footer with node version
    embed.setFooter({
      text: `Node.js ${process.version} • discord.js v${require("discord.js").version}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default shardInfoModule;
