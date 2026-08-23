/**
 * SystemFlagsRepository — generic fleet-wide boolean switches keyed by name.
 * First consumer is the Lavalink health check ("music" key).
 */
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { systemFlags, type SystemFlagRow } from "../schema";

export interface SystemFlagDoc {
  key: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: Date;
}

function toDoc(row: SystemFlagRow): SystemFlagDoc {
  return {
    key: row.key,
    enabled: row.enabled,
    reason: row.reason,
    updatedAt: row.updatedAt,
  };
}

export class SystemFlagsRepository {
  constructor(private db: Database) {}

  async getFlag(key: string): Promise<SystemFlagDoc | null> {
    const rows = await this.db
      .select()
      .from(systemFlags)
      .where(eq(systemFlags.key, key))
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  /** Upserts the flag. `reason` is freeform — e.g. "manual" or "lavalink-health-check". */
  async setFlag(
    key: string,
    enabled: boolean,
    reason: string | null,
  ): Promise<void> {
    await this.db
      .insert(systemFlags)
      .values({ key, enabled, reason })
      .onConflictDoUpdate({
        target: systemFlags.key,
        set: { enabled, reason, updatedAt: new Date() },
      });
  }
}
