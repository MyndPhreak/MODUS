import { Client } from "discord.js";
import { AppwriteService } from "./AppwriteService";

export class ServerStatusService {
  private appwriteService: AppwriteService;
  private client: Client;
  private checkInterval = 5 * 60 * 1000; // 5 minutes

  constructor(client: Client, appwriteService: AppwriteService) {
    this.client = client;
    this.appwriteService = appwriteService;
  }

  public start() {
    console.log("[ServerStatusService] Starting periodic server checks...");
    this.checkServers();
    setInterval(() => this.checkServers(), this.checkInterval);
  }

  private async checkServers() {
    const allServers = await this.appwriteService.getServers();

    // Filter servers that belong to this shard's guilds
    const servers = allServers.filter((server) =>
      this.client.guilds.cache.has(server.$id),
    );

    if (servers.length === 0) return;

    console.log(
      `[ServerStatusService] [Shard ${this.client.shard?.ids[0] ?? 0}] Checking ${servers.length} relevant servers (out of ${allServers.length} total)...`,
    );

    for (const server of servers) {
      try {
        const guild = this.client.guilds.cache.get(server.$id);
        const isOnline = !!guild;
        const memberCount = guild?.memberCount ?? 0;
        const icon = guild?.icon ?? null;
        const name = guild?.name ?? server.name;

        const shardId = this.client.shard?.ids[0] ?? 0;
        await this.appwriteService.updateServerStatus(
          server.$id,
          server.guild_id,
          isOnline,
          memberCount,
          icon,
          name,
          shardId,
        );
      } catch (error) {
        console.error(
          `[ServerStatusService] Error checking server ${server.name}:`,
          error,
        );
      }
    }
  }
}
