/**
 * MilestoneUserRepository — per-member character-count tracking + leaderboard.
 *
 * Rank query uses a single COUNT instead of fetching every higher-ranked
 * user; this is O(log n) with the (guild_id, char_count) index.
 */
import { and, count, desc, eq, gt } from "drizzle-orm";
import type { Database } from "../client";
import { milestoneUsers, type MilestoneUser } from "../schema";

export type MilestoneUserDoc = MilestoneUser & {
  $id: string;
  guild_id: string;
  user_id: string;
  char_count: number;
  last_milestone: number;
  notification_pref: string;
  opted_in: boolean;
};

function toDoc(row: MilestoneUser): MilestoneUserDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    user_id: row.userId,
    char_count: row.charCount,
    last_milestone: row.lastMilestone,
    notification_pref: row.notificationPref,
    opted_in: row.optedIn,
  };
}

export class MilestoneUserRepository {
  constructor(private db: Database) {}

  async getByGuildAndUser(
    guildId: string,
    userId: string,
  ): Promise<MilestoneUserDoc | null> {
    const rows = await this.db
      .select()
      .from(milestoneUsers)
      .where(
        and(
          eq(milestoneUsers.guildId, guildId),
          eq(milestoneUsers.userId, userId),
        ),
      )
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async create(data: {
    guild_id: string;
    user_id: string;
    username: string;
    char_count: number;
    last_milestone: number;
    notification_pref: string;
    opted_in: boolean;
  }): Promise<string> {
    const [row] = await this.db
      .insert(milestoneUsers)
      .values({
        guildId: data.guild_id,
        userId: data.user_id,
        username: data.username,
        charCount: data.char_count,
        lastMilestone: data.last_milestone,
        notificationPref: data.notification_pref,
        optedIn: data.opted_in,
      })
      .returning({ id: milestoneUsers.id });
    return row.id;
  }

  async update(docId: string, data: Record<string, any>): Promise<void> {
    const patch: Partial<typeof milestoneUsers.$inferInsert> = {};
    if (data.username !== undefined) patch.username = data.username;
    if (data.char_count !== undefined) patch.charCount = data.char_count;
    if (data.last_milestone !== undefined)
      patch.lastMilestone = data.last_milestone;
    if (data.notification_pref !== undefined)
      patch.notificationPref = data.notification_pref;
    if (data.opted_in !== undefined) patch.optedIn = data.opted_in;
    if (Object.keys(patch).length === 0) return;
    patch.updatedAt = new Date();
    await this.db
      .update(milestoneUsers)
      .set(patch)
      .where(eq(milestoneUsers.id, docId));
  }

  async getLeaderboard(
    guildId: string,
    limit: number,
    offset: number,
  ): Promise<{ users: MilestoneUserDoc[]; total: number }> {
    const [rows, totalRow] = await Promise.all([
      this.db
        .select()
        .from(milestoneUsers)
        .where(
          and(
            eq(milestoneUsers.guildId, guildId),
            eq(milestoneUsers.optedIn, true),
          ),
        )
        .orderBy(desc(milestoneUsers.charCount))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ c: count() })
        .from(milestoneUsers)
        .where(
          and(
            eq(milestoneUsers.guildId, guildId),
            eq(milestoneUsers.optedIn, true),
          ),
        ),
    ]);
    return {
      users: rows.map(toDoc),
      total: totalRow[0]?.c ?? 0,
    };
  }

  async getRank(guildId: string, charCount: number): Promise<number> {
    const [row] = await this.db
      .select({ c: count() })
      .from(milestoneUsers)
      .where(
        and(
          eq(milestoneUsers.guildId, guildId),
          eq(milestoneUsers.optedIn, true),
          gt(milestoneUsers.charCount, charCount),
        ),
      );
    return (row?.c ?? 0) + 1;
  }

  async upsertMigrated(input: {
    id: string;
    guild_id: string;
    user_id: string;
    username: string;
    char_count: number;
    last_milestone: number;
    notification_pref: string;
    opted_in: boolean;
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(milestoneUsers)
      .values({
        id: input.id,
        guildId: input.guild_id,
        userId: input.user_id,
        username: input.username,
        charCount: input.char_count,
        lastMilestone: input.last_milestone,
        notificationPref: input.notification_pref,
        optedIn: input.opted_in,
        ...(input.createdAt
          ? {
              updatedAt:
                input.createdAt instanceof Date
                  ? input.createdAt
                  : new Date(input.createdAt),
            }
          : {}),
      })
      .onConflictDoNothing({ target: milestoneUsers.id });
  }
}
