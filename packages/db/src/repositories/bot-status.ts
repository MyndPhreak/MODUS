/**
 * BotStatusRepository — per-shard heartbeat.
 *
 * Document ID is `shard-<n>` for wire-compat with the Appwrite schema so
 * multi-shard fleets never collide on upserts.
 */
import type { Database } from "../client";
import { botStatus } from "../schema";

export class BotStatusRepository {
  constructor(private db: Database) {}

  async updateHeartbeat(
    botId: string,
    version: string,
    shardId: number,
    totalShards: number,
  ): Promise<void> {
    const documentId = `shard-${shardId}`;
    await this.db
      .insert(botStatus)
      .values({
        id: documentId,
        botId,
        lastSeen: new Date(),
        version,
        shardId,
        totalShards,
      })
      .onConflictDoUpdate({
        target: botStatus.id,
        set: {
          botId,
          lastSeen: new Date(),
          version,
          shardId,
          totalShards,
        },
      });
  }

  async upsertMigrated(input: {
    id: string;
    botId: string;
    lastSeen: string | Date;
    version: string | null;
    shardId: number;
    totalShards: number;
  }): Promise<void> {
    await this.db
      .insert(botStatus)
      .values({
        id: input.id,
        botId: input.botId,
        lastSeen:
          input.lastSeen instanceof Date
            ? input.lastSeen
            : new Date(input.lastSeen),
        version: input.version,
        shardId: input.shardId,
        totalShards: input.totalShards,
      })
      .onConflictDoNothing({ target: botStatus.id });
  }
}
