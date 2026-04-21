/**
 * LogRepository — append-only structured log entries.
 *
 * Insert-heavy, read-rare. The (guild_id, timestamp DESC) index covers the
 * dashboard's paginated view; a bare timestamp index supports the admin log.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { logs, type LogEntry } from "../schema";

export type LogDoc = LogEntry & {
  $id: string;
  guildId: string;
  shardId: number | null;
  timestamp: Date;
};

function toDoc(row: LogEntry): LogDoc {
  return { ...row, $id: row.id, guildId: row.guildId, shardId: row.shardId };
}

export class LogRepository {
  constructor(private db: Database) {}

  async log(entry: {
    guildId: string;
    message: string;
    level: "info" | "warn" | "error";
    shardId?: number;
    source?: string;
    timestamp?: Date;
  }): Promise<void> {
    await this.db.insert(logs).values({
      guildId: entry.guildId,
      message: entry.message,
      level: entry.level,
      shardId: entry.shardId ?? null,
      source: entry.source ?? null,
      timestamp: entry.timestamp ?? new Date(),
    });
  }

  async listByGuild(guildId: string, limit = 100): Promise<LogDoc[]> {
    const rows = await this.db
      .select()
      .from(logs)
      .where(eq(logs.guildId, guildId))
      .orderBy(desc(logs.timestamp))
      .limit(limit);
    return rows.map(toDoc);
  }

  async listAll(limit = 200): Promise<LogDoc[]> {
    const rows = await this.db
      .select()
      .from(logs)
      .orderBy(desc(logs.timestamp))
      .limit(limit);
    return rows.map(toDoc);
  }

  async upsertMigrated(input: {
    id: string;
    guildId: string;
    message: string;
    level: string;
    timestamp: string | Date;
    shardId?: number | null;
    source?: string | null;
  }): Promise<void> {
    await this.db
      .insert(logs)
      .values({
        id: input.id,
        guildId: input.guildId,
        message: input.message,
        level: input.level,
        timestamp:
          input.timestamp instanceof Date
            ? input.timestamp
            : new Date(input.timestamp),
        shardId: input.shardId ?? null,
        source: input.source ?? null,
      })
      .onConflictDoNothing({ target: logs.id });
  }
}
