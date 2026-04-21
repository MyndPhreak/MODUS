/**
 * BotStatusRepository — per-shard heartbeat.
 *
 * Document ID is `shard-<n>` for wire-compat with the Appwrite schema so
 * multi-shard fleets never collide on upserts.
 */
import type { Database } from "../client";
import { botStatus, type BotStatus } from "../schema";

export type BotStatusDoc = BotStatus & {
  $id: string;
  bot_id: string;
  last_seen: string;
  shard_id: number;
  total_shards: number;
};

function toDoc(row: BotStatus): BotStatusDoc {
  return {
    ...row,
    $id: row.id,
    bot_id: row.botId,
    last_seen: row.lastSeen.toISOString(),
    shard_id: row.shardId,
    total_shards: row.totalShards,
  };
}

export class BotStatusRepository {
  constructor(private db: Database) {}

  /** Used by the public /api/stats endpoint to count online shards. */
  async listAll(limit = 50): Promise<BotStatusDoc[]> {
    const rows = await this.db.select().from(botStatus).limit(limit);
    return rows.map(toDoc);
  }

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
