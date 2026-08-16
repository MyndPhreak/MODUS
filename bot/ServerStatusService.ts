import { Client } from "discord.js";
import { DatabaseService } from "./DatabaseService";
import type { Logger } from "./Logger";
import type { MusicMetrics } from "./music/MusicMetrics";

export interface ServerStatusServiceOptions {
  /**
   * Where subsystem status is reported. The dashboard already streams the
   * `logs` table in realtime, so this is the channel operators watch.
   */
  logger?: Logger;
  /** Null when no Lavalink node is configured for this deployment. */
  musicMetrics?: MusicMetrics | null;
}

export class ServerStatusService {
  private databaseService: DatabaseService;
  private client: Client;
  private logger: Logger | null;
  private musicMetrics: MusicMetrics | null;
  private checkInterval = 5 * 60 * 1000; // 5 minutes

  constructor(
    client: Client,
    databaseService: DatabaseService,
    options: ServerStatusServiceOptions = {},
  ) {
    this.client = client;
    this.databaseService = databaseService;
    this.logger = options.logger ?? null;
    this.musicMetrics = options.musicMetrics ?? null;
  }

  public start() {
    console.log("[ServerStatusService] Starting periodic server checks...");
    this.checkServers();
    setInterval(() => this.checkServers(), this.checkInterval);
  }

  /**
   * Reports the music control plane rollup alongside the guild sweep. Music
   * health is subsystem status, not bot liveness — a degraded or unavailable
   * fleet is logged, never escalated into a failed health check.
   */
  private reportMusicHealth() {
    if (!this.musicMetrics || !this.logger) return;

    try {
      const health = this.musicMetrics.health();
      const line = `[MusicHealth] ${this.musicMetrics.statusLine()}`;
      if (health === "healthy") {
        this.logger.info(line, undefined, "music");
      } else if (health === "degraded") {
        this.logger.warn(line, undefined, "music");
      } else {
        this.logger.warn(
          `${line} — music commands report playback unavailable; other modules are unaffected.`,
          undefined,
          "music",
        );
      }
    } catch (error) {
      console.error("[ServerStatusService] Music health report failed:", error);
    }
  }

  private async checkServers() {
    this.reportMusicHealth();

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
