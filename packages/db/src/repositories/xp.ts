/**
 * XpUserRepository — per-member XP tracking, leveling, and leaderboard queries.
 *
 * Rank query uses a single COUNT for O(log n) performance with the
 * (guild_id, xp DESC) index.
 */
import { and, count, desc, eq, gt, ilike, or, sql, sum } from "drizzle-orm";
import { requireReturningRow } from "../client";
import type { Database } from "../client";
import { xpUsers, guildConfigs, servers, type XpUser } from "../schema";

export type XpUserDoc = XpUser & {
  $id: string;
  guild_id: string;
  user_id: string;
  avatar: string | null;
  char_count: number;
  message_count: number;
  last_xp_gain_at: Date | null;
  notification_pref: string;
  opted_in: boolean;
  hidden_from_leaderboard: boolean;
};

export function toXpDoc(row: XpUser): XpUserDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    user_id: row.userId,
    avatar: row.avatar ?? null,
    char_count: row.charCount,
    message_count: row.messageCount,
    last_xp_gain_at: row.lastXpGainAt,
    notification_pref: row.notificationPref,
    opted_in: row.optedIn,
    hidden_from_leaderboard: row.hiddenFromLeaderboard ?? false,
  };
}

export class XpUserRepository {
  constructor(private db: Database) {}

  async getByGuildAndUser(
    guildId: string,
    userId: string,
  ): Promise<XpUserDoc | null> {
    const rows = await this.db
      .select()
      .from(xpUsers)
      .where(
        and(
          eq(xpUsers.guildId, guildId),
          eq(xpUsers.userId, userId),
        ),
      )
      .limit(1);
    return rows[0] ? toXpDoc(rows[0]) : null;
  }

  async create(data: {
    guild_id: string;
    user_id: string;
    username: string;
    avatar?: string | null;
    xp?: number;
    level?: number;
    message_count?: number;
    char_count?: number;
    last_xp_gain_at?: Date | null;
    notification_pref?: string;
    opted_in?: boolean;
    hidden_from_leaderboard?: boolean;
  }): Promise<string> {
    const [row] = await this.db
      .insert(xpUsers)
      .values({
        guildId: data.guild_id,
        userId: data.user_id,
        username: data.username,
        avatar: data.avatar ?? null,
        xp: data.xp ?? 0,
        level: data.level ?? 0,
        messageCount: data.message_count ?? 0,
        charCount: data.char_count ?? 0,
        lastXpGainAt: data.last_xp_gain_at ?? new Date(),
        notificationPref: data.notification_pref ?? "public",
        optedIn: data.opted_in ?? true,
        hiddenFromLeaderboard: data.hidden_from_leaderboard ?? false,
      })
      .returning({ id: xpUsers.id });
    return requireReturningRow(row, "XP user insert").id;
  }

  async update(docId: string, data: Record<string, any>): Promise<void> {
    const patch: Partial<typeof xpUsers.$inferInsert> = {};
    if (data.username !== undefined) patch.username = data.username;
    if (data.avatar !== undefined) patch.avatar = data.avatar;
    if (data.xp !== undefined) patch.xp = data.xp;
    if (data.level !== undefined) patch.level = data.level;
    if (data.message_count !== undefined) patch.messageCount = data.message_count;
    if (data.char_count !== undefined) patch.charCount = data.char_count;
    if (data.last_xp_gain_at !== undefined) patch.lastXpGainAt = data.last_xp_gain_at;
    if (data.notification_pref !== undefined) patch.notificationPref = data.notification_pref;
    if (data.opted_in !== undefined) patch.optedIn = data.opted_in;
    if (data.hidden_from_leaderboard !== undefined) patch.hiddenFromLeaderboard = data.hidden_from_leaderboard;
    if (Object.keys(patch).length === 0) return;
    patch.updatedAt = new Date();
    await this.db
      .update(xpUsers)
      .set(patch)
      .where(eq(xpUsers.id, docId));
  }

  async getLeaderboard(
    guildId: string,
    limit: number,
    offset: number,
    search?: string,
    excludeHidden: boolean = true,
  ): Promise<{ users: XpUserDoc[]; total: number }> {
    const whereConditions = [
      eq(xpUsers.guildId, guildId),
      eq(xpUsers.optedIn, true),
    ];

    if (excludeHidden) {
      whereConditions.push(eq(xpUsers.hiddenFromLeaderboard, false));
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereConditions.push(
        or(ilike(xpUsers.username, q), ilike(xpUsers.userId, q))!,
      );
    }

    const combinedWhere = and(...whereConditions);

    const [rows, totalRow] = await Promise.all([
      this.db
        .select()
        .from(xpUsers)
        .where(combinedWhere)
        .orderBy(desc(xpUsers.xp))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ c: count() })
        .from(xpUsers)
        .where(combinedWhere),
    ]);

    return {
      users: rows.map(toXpDoc),
      total: totalRow[0]?.c ?? 0,
    };
  }

  async getRank(guildId: string, xp: number): Promise<number> {
    const [row] = await this.db
      .select({ c: count() })
      .from(xpUsers)
      .where(
        and(
          eq(xpUsers.guildId, guildId),
          eq(xpUsers.optedIn, true),
          gt(xpUsers.xp, xp),
        ),
      );
    return (row?.c ?? 0) + 1;
  }

  async getTopUsers(guildId: string, limit: number = 3, excludeHidden: boolean = true): Promise<XpUserDoc[]> {
    const whereConditions = [
      eq(xpUsers.guildId, guildId),
      eq(xpUsers.optedIn, true),
    ];
    if (excludeHidden) {
      whereConditions.push(eq(xpUsers.hiddenFromLeaderboard, false));
    }
    const rows = await this.db
      .select()
      .from(xpUsers)
      .where(and(...whereConditions))
      .orderBy(desc(xpUsers.xp))
      .limit(limit);
    return rows.map(toXpDoc);
  }

  async getGuildStats(guildId: string): Promise<{
    totalXp: number;
    totalMessages: number;
    totalUsers: number;
  }> {
    const [statsRow] = await this.db
      .select({
        totalXp: sum(xpUsers.xp),
        totalMessages: sum(xpUsers.messageCount),
        totalUsers: count(),
      })
      .from(xpUsers)
      .where(
        and(
          eq(xpUsers.guildId, guildId),
          eq(xpUsers.optedIn, true),
        ),
      );

    return {
      totalXp: Number(statsRow?.totalXp ?? 0),
      totalMessages: Number(statsRow?.totalMessages ?? 0),
      totalUsers: statsRow?.totalUsers ?? 0,
    };
  }

  async getGlobalLeaderboard(
    limit = 50,
    offset = 0,
    search?: string,
  ): Promise<{
    users: Array<{
      userId: string;
      username: string;
      totalXp: number;
      totalMessages: number;
      serverCount: number;
      lastActive: Date | null;
      rank: number;
      level: number;
      progressPercent: number;
    }>;
    total: number;
  }> {
    const conditions = [
      eq(xpUsers.optedIn, true),
      eq(xpUsers.hiddenFromLeaderboard, false),
    ];
    if (search && search.trim()) {
      conditions.push(ilike(xpUsers.username, `%${search.trim()}%`));
    }

    const rows = await this.db
      .select({
        userId: xpUsers.userId,
        username: sql<string>`MAX(${xpUsers.username})`,
        totalXp: sql<number>`CAST(COALESCE(SUM(${xpUsers.xp}), 0) AS INTEGER)`,
        totalMessages: sql<number>`CAST(COALESCE(SUM(${xpUsers.messageCount}), 0) AS INTEGER)`,
        serverCount: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.guildId}) AS INTEGER)`,
        lastActive: sql<Date | null>`MAX(${xpUsers.updatedAt})`,
      })
      .from(xpUsers)
      .where(and(...conditions))
      .groupBy(xpUsers.userId)
      .orderBy(desc(sql`SUM(${xpUsers.xp})`))
      .limit(limit)
      .offset(offset);

    const totalRow = await this.db
      .select({
        c: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.userId}) AS INTEGER)`,
      })
      .from(xpUsers)
      .where(and(...conditions));

    // Calculate level and progress
    const enriched = rows.map((r, idx) => {
      const xp = Number(r.totalXp || 0);
      let level = 0;
      let accumulated = 0;
      while (true) {
        const nextRequired = 5 * level * level + 50 * level + 100;
        if (accumulated + nextRequired > xp) break;
        accumulated += nextRequired;
        level++;
      }
      const currentLevelBase = accumulated;
      const nextLevelRequired = 5 * level * level + 50 * level + 100;
      const xpInCurrent = Math.max(0, xp - currentLevelBase);
      const progressPercent = Math.min(
        100,
        Math.max(0, Math.round((xpInCurrent / nextLevelRequired) * 100)),
      );

      return {
        userId: r.userId,
        username: r.username || "Unknown",
        totalXp: xp,
        totalMessages: Number(r.totalMessages || 0),
        serverCount: Number(r.serverCount || 1),
        lastActive: r.lastActive,
        rank: offset + idx + 1,
        level,
        progressPercent,
      };
    });

    return {
      users: enriched,
      total: totalRow[0]?.c ?? 0,
    };
  }

  async getGlobalStats(): Promise<{
    totalXp: number;
    totalMessages: number;
    totalUsers: number;
    totalGuilds: number;
  }> {
    const [statsRow] = await this.db
      .select({
        totalXp: sql<number>`CAST(COALESCE(SUM(${xpUsers.xp}), 0) AS BIGINT)`,
        totalMessages: sql<number>`CAST(COALESCE(SUM(${xpUsers.messageCount}), 0) AS BIGINT)`,
        totalUsers: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.userId}) AS INTEGER)`,
        totalGuilds: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.guildId}) AS INTEGER)`,
      })
      .from(xpUsers)
      .where(eq(xpUsers.optedIn, true));

    return {
      totalXp: Number(statsRow?.totalXp ?? 0),
      totalMessages: Number(statsRow?.totalMessages ?? 0),
      totalUsers: Number(statsRow?.totalUsers ?? 0),
      totalGuilds: Number(statsRow?.totalGuilds ?? 0),
    };
  }

  async getActiveGuilds(limit = 12): Promise<
    Array<{
      guildId: string;
      totalXp: number;
      memberCount: number;
      totalMessages: number;
    }>
  > {
    const rows = await this.db
      .select({
        guildId: xpUsers.guildId,
        totalXp: sql<number>`CAST(COALESCE(SUM(${xpUsers.xp}), 0) AS BIGINT)`,
        memberCount: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.userId}) AS INTEGER)`,
        totalMessages: sql<number>`CAST(COALESCE(SUM(${xpUsers.messageCount}), 0) AS BIGINT)`,
      })
      .from(xpUsers)
      .where(eq(xpUsers.optedIn, true))
      .groupBy(xpUsers.guildId)
      .orderBy(desc(sql`SUM(${xpUsers.xp})`))
      .limit(limit);

    return rows.map((r) => ({
      guildId: r.guildId,
      totalXp: Number(r.totalXp ?? 0),
      memberCount: Number(r.memberCount ?? 0),
      totalMessages: Number(r.totalMessages ?? 0),
    }));
  }

  async getPublicServersLeaderboard(
    limit = 25,
    offset = 0,
    search?: string,
  ): Promise<{
    servers: Array<{
      guildId: string;
      name: string;
      icon: string | null;
      totalXp: number;
      totalMessages: number;
      activeMembers: number;
      rank: number;
    }>;
    total: number;
  }> {
    const conditions = [
      eq(xpUsers.optedIn, true),
      eq(guildConfigs.moduleName, "xp"),
      eq(guildConfigs.enabled, true),
      sql`${guildConfigs.settings}->>'leaderboardVisibility' = 'public'`,
    ];

    if (search && search.trim()) {
      conditions.push(ilike(servers.name, `%${search.trim()}%`));
    }

    const rows = await this.db
      .select({
        guildId: xpUsers.guildId,
        name: sql<string>`COALESCE(MAX(${servers.name}), 'Discord Server')`,
        icon: sql<string | null>`MAX(${servers.icon})`,
        totalXp: sql<number>`CAST(COALESCE(SUM(${xpUsers.xp}), 0) AS BIGINT)`,
        totalMessages: sql<number>`CAST(COALESCE(SUM(${xpUsers.messageCount}), 0) AS BIGINT)`,
        activeMembers: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.userId}) AS INTEGER)`,
      })
      .from(xpUsers)
      .innerJoin(guildConfigs, eq(guildConfigs.guildId, xpUsers.guildId))
      .leftJoin(servers, eq(servers.guildId, xpUsers.guildId))
      .where(and(...conditions))
      .groupBy(xpUsers.guildId)
      .orderBy(desc(sql`SUM(${xpUsers.xp})`))
      .limit(limit)
      .offset(offset);

    const totalRow = await this.db
      .select({
        c: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.guildId}) AS INTEGER)`,
      })
      .from(xpUsers)
      .innerJoin(guildConfigs, eq(guildConfigs.guildId, xpUsers.guildId))
      .leftJoin(servers, eq(servers.guildId, xpUsers.guildId))
      .where(and(...conditions));

    return {
      servers: rows.map((r, idx) => ({
        guildId: r.guildId,
        name: r.name || "Discord Server",
        icon: r.icon,
        totalXp: Number(r.totalXp ?? 0),
        totalMessages: Number(r.totalMessages ?? 0),
        activeMembers: Number(r.activeMembers ?? 0),
        rank: offset + idx + 1,
      })),
      total: totalRow[0]?.c ?? 0,
    };
  }

  async getPublicGlobalStats(): Promise<{
    totalXp: number;
    totalMessages: number;
    totalUsers: number;
    totalGuilds: number;
  }> {
    const conditions = [
      eq(xpUsers.optedIn, true),
      eq(guildConfigs.moduleName, "xp"),
      eq(guildConfigs.enabled, true),
      sql`${guildConfigs.settings}->>'leaderboardVisibility' = 'public'`,
    ];

    const [statsRow] = await this.db
      .select({
        totalXp: sql<number>`CAST(COALESCE(SUM(${xpUsers.xp}), 0) AS BIGINT)`,
        totalMessages: sql<number>`CAST(COALESCE(SUM(${xpUsers.messageCount}), 0) AS BIGINT)`,
        totalUsers: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.userId}) AS INTEGER)`,
        totalGuilds: sql<number>`CAST(COUNT(DISTINCT ${xpUsers.guildId}) AS INTEGER)`,
      })
      .from(xpUsers)
      .innerJoin(guildConfigs, eq(guildConfigs.guildId, xpUsers.guildId))
      .where(and(...conditions));

    return {
      totalXp: Number(statsRow?.totalXp ?? 0),
      totalMessages: Number(statsRow?.totalMessages ?? 0),
      totalUsers: Number(statsRow?.totalUsers ?? 0),
      totalGuilds: Number(statsRow?.totalGuilds ?? 0),
    };
  }
}
