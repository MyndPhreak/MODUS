/**
 * LogRepository — append-only structured log entries.
 *
 * Insert-heavy, read-rare. The (guild_id, timestamp DESC) index covers the
 * dashboard's paginated view; a bare timestamp index supports the admin log.
 */
import { desc, eq, inArray, lt, sql } from "drizzle-orm";
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

export interface LogInput {
  guildId: string;
  message: string;
  level: "info" | "warn" | "error";
  shardId?: number;
  source?: string;
  timestamp?: Date;
}

export class LogRepository {
  constructor(private db: Database) {}

  async log(entry: LogInput): Promise<void> {
    await this.logBatch([entry]);
  }

  /** Insert many entries in a single statement. Callers batch to keep the
   *  insert-heavy log path from producing one round-trip per entry. */
  async logBatch(entries: LogInput[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.insert(logs).values(
      entries.map((entry) => ({
        guildId: entry.guildId,
        message: entry.message,
        level: entry.level,
        shardId: entry.shardId ?? null,
        source: entry.source ?? null,
        timestamp: entry.timestamp ?? new Date(),
      })),
    );
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

  /** Counts each level from `since` and reports the oldest retained log. */
  async countByLevelSince(since: Date): Promise<{
    info: number;
    warn: number;
    error: number;
    oldestTimestamp: Date | null;
  }> {
    const [row] = await this.db
      .select({
        info: sql<number>`count(*) filter (where ${logs.level} = 'info' and ${logs.timestamp} >= ${since})::int`,
        warn: sql<number>`count(*) filter (where ${logs.level} = 'warn' and ${logs.timestamp} >= ${since})::int`,
        error: sql<number>`count(*) filter (where ${logs.level} = 'error' and ${logs.timestamp} >= ${since})::int`,
        oldestTimestamp: sql<Date | null>`min(${logs.timestamp})`,
      })
      .from(logs);

    return {
      info: row?.info ?? 0,
      warn: row?.warn ?? 0,
      error: row?.error ?? 0,
      oldestTimestamp: row?.oldestTimestamp ?? null,
    };
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const deleted = await this.db
      .delete(logs)
      .where(eq(logs.guildId, guildId))
      .returning({ id: logs.id });
    return deleted.length;
  }

  /**
   * Deletes up to `batchLimit` rows older than `cutoff` in a single
   * statement (rows are selected via a LIMIT-capped subquery). Callers
   * loop, calling this repeatedly, until it returns fewer than
   * `batchLimit` — that bounds how many rows any one DELETE transaction
   * touches, which matters here because `logs` is far higher-volume than
   * the other retention-swept tables.
   */
  async deleteOlderThan(cutoff: Date, batchLimit: number): Promise<number> {
    const deleted = await this.db
      .delete(logs)
      .where(
        inArray(
          logs.id,
          this.db
            .select({ id: logs.id })
            .from(logs)
            .where(lt(logs.timestamp, cutoff))
            .limit(batchLimit),
        ),
      )
      .returning({ id: logs.id });
    return deleted.length;
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
