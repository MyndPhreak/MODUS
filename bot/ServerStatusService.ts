import { Client } from "discord.js";
import { DatabaseService } from "./DatabaseService";

export class ServerStatusService {
  private databaseService: DatabaseService;
  private client: Client;
  private checkInterval = 5 * 60 * 1000; // 5 minutes

  constructor(client: Client, databaseService: DatabaseService) {
    this.client = client;
    this.databaseService = databaseService;
  }

  public start() {
    console.log("[ServerStatusService] Starting periodic server checks...");
    this.checkServers();
    setInterval(() => this.checkServers(), this.checkInterval);
  }

  private async checkServers() {
    const shardId = this.client.shard?.ids[0] ?? 0;
    const cachedGuilds = Array.from(this.client.guilds.cache.values());

    console.log(
      `[ServerStatusService] [Shard ${shardId}] Reconciling ${cachedGuilds.length} guild(s) in cache...`,
    );

    // Upsert every guild this shard sees — backfills any rows that were
    // never registered via the dashboard.
    for (const guild of cachedGuilds) {
      try {
        await this.databaseService.upsertGuildPresence({
          guildId: guild.id,
          name: guild.name,
          icon: guild.icon ?? null,
          memberCount: guild.memberCount ?? 0,
          status: true,
          shardId,
          ownerId: guild.ownerId ?? null,
        });
      } catch (error) {
        console.error(
          `[ServerStatusService] upsert failed for ${guild.name} (${guild.id}):`,
          error,
        );
      }
    }

    // Mark offline any rows previously owned by this shard whose guild
    // is no longer in cache (bot was removed while the shard was down,
    // so the guildDelete event never fired).
    try {
      const allServers = await this.databaseService.getServers();
      const cachedIds = new Set(cachedGuilds.map((g) => g.id));
      const stale = allServers.filter(
        (s) =>
          s.shard_id === shardId && s.status && !cachedIds.has(s.guild_id),
      );
      for (const server of stale) {
        await this.databaseService.markGuildOffline(server.guild_id);
        console.log(
          `[ServerStatusService] Marked offline (no longer in shard ${shardId} cache): ${server.name} (${server.guild_id})`,
        );
      }
    } catch (error) {
      console.error(
        "[ServerStatusService] Stale-row sweep failed:",
        error,
      );
    }
  }
}
