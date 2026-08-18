/**
 * GET /api/xp/[guild_id]/leaderboard
 *
 * Public endpoint to fetch paginated leaderboard data, server metadata,
 * top podium members, and server-wide XP stats.
 */
import { getRepos } from "../../../utils/db";
import { getXpProgress } from "@modus/db/rank-cards";
import { getResolvedDiscordId } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id parameter" });
  }

  const query = getQuery(event);
  const page = Math.max(1, parseInt((query.page as string) || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || "25", 10)));
  const search = typeof query.search === "string" ? query.search.trim() : undefined;
  const offset = (page - 1) * limit;

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  }

  try {
    // 1. Fetch server info & module config
    const [server, isEnabled, xpSettings, callerId] = await Promise.all([
      repos.servers.getByGuildId(guildId),
      repos.guildConfigs.isModuleEnabled(guildId, "xp"),
      repos.guildConfigs.getModuleSettings(guildId, "xp"),
      getResolvedDiscordId(event),
    ]);

    const visibility = (xpSettings?.leaderboardVisibility as "private" | "unlisted" | "public") || "private";

    let isAuthorizedMember = false;
    if (callerId) {
      if (server?.owner_id === callerId || server?.admin_user_ids?.includes(callerId)) {
        isAuthorizedMember = true;
      } else {
        const userDoc = await repos.xp.getByGuildAndUser(guildId, callerId);
        if (userDoc) {
          isAuthorizedMember = true;
        }
      }
    }

    // Privacy Guard: If private and caller is not a verified server member, return gated private status
    if (visibility === "private" && !isAuthorizedMember) {
      return {
        guild: {
          id: guildId,
          name: server?.name || "Discord Server",
          icon: server?.icon || null,
          memberCount: server?.memberCount || 0,
          enabled: isEnabled,
        },
        visibility: "private" as const,
        isPrivate: true,
        requiresAuth: !callerId,
        notMember: Boolean(callerId),
        stats: {
          totalTrackedMembers: 0,
          totalXp: 0,
          totalMessages: 0,
        },
        page,
        limit,
        total: 0,
        totalPages: 1,
        top3: [],
        users: [],
        settings: {
          announcementChannel: null,
        },
      };
    }

    // 2. Fetch leaderboard and stats with strict hidden member filtering
    const [leaderboardResult, top3, stats] = await Promise.all([
      repos.xp.getLeaderboard(guildId, limit, offset, search, true),
      offset === 0 && !search ? repos.xp.getTopUsers(guildId, 3, true) : Promise.resolve([]),
      repos.xp.getGuildStats(guildId),
    ]);

    // 3. Resolve missing member avatars via Discord API on-demand and asynchronously backfill DB
    const config = useRuntimeConfig();
    const botToken = (config.discordBotToken || process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN) as string;
    const avatarMap = new Map<string, string>();
    const usersNeedingAvatars = [...leaderboardResult.users, ...top3].filter((u) => !u.avatar);

    if (botToken && usersNeedingAvatars.length > 0) {
      const uniqueUids = Array.from(new Set(usersNeedingAvatars.map((u) => u.user_id)));
      await Promise.allSettled(
        uniqueUids.map(async (uid) => {
          try {
            // First try guild member endpoint for server-specific avatar
            const member: any = await $fetch(
              `https://discord.com/api/v10/guilds/${guildId}/members/${uid}`,
              { headers: { Authorization: `Bot ${botToken}` } },
            );
            if (member?.avatar) {
              const ext = member.avatar.startsWith("a_") ? "gif" : "webp";
              const avatarUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${uid}/avatars/${member.avatar}.${ext}?size=128`;
              avatarMap.set(uid, avatarUrl);
            } else if (member?.user?.avatar) {
              const ext = member.user.avatar.startsWith("a_") ? "gif" : "webp";
              const avatarUrl = `https://cdn.discordapp.com/avatars/${uid}/${member.user.avatar}.${ext}?size=128`;
              avatarMap.set(uid, avatarUrl);
            }
          } catch {
            // Fallback to user endpoint
            try {
              const user: any = await $fetch(
                `https://discord.com/api/v10/users/${uid}`,
                { headers: { Authorization: `Bot ${botToken}` } },
              );
              if (user?.avatar) {
                const ext = user.avatar.startsWith("a_") ? "gif" : "webp";
                const avatarUrl = `https://cdn.discordapp.com/avatars/${uid}/${user.avatar}.${ext}?size=128`;
                avatarMap.set(uid, avatarUrl);
              }
            } catch {}
          }

          const resolved = avatarMap.get(uid);
          if (resolved) {
            const matched = usersNeedingAvatars.filter((u) => u.user_id === uid);
            for (const mu of matched) {
              repos.xp.update(mu.id, { avatar: resolved }).catch(() => {});
            }
          }
        }),
      );
    }

    const formattedUsers = leaderboardResult.users.map((user, idx) => {
      const rank = offset + idx + 1;
      const progress = getXpProgress(user.xp);
      return {
        id: user.id,
        userId: user.user_id,
        username: user.username,
        avatar: user.avatar || avatarMap.get(user.user_id) || null,
        xp: user.xp,
        level: progress.level,
        rank,
        messageCount: user.message_count,
        progressPercent: progress.progressPercent,
        currentLevelBaseXp: progress.currentLevelBaseXp,
        nextLevelBaseXp: progress.nextLevelBaseXp,
        xpInCurrentLevel: progress.xpInCurrentLevel,
        xpNeededForNextLevel: progress.xpNeededForNextLevel,
      };
    });

    const formattedTop3 = top3.map((user, idx) => {
      const progress = getXpProgress(user.xp);
      return {
        id: user.id,
        userId: user.user_id,
        username: user.username,
        avatar: user.avatar || avatarMap.get(user.user_id) || null,
        xp: user.xp,
        level: progress.level,
        rank: idx + 1,
        messageCount: user.message_count,
        progressPercent: progress.progressPercent,
        currentLevelBaseXp: progress.currentLevelBaseXp,
        nextLevelBaseXp: progress.nextLevelBaseXp,
        xpInCurrentLevel: progress.xpInCurrentLevel,
        xpNeededForNextLevel: progress.xpNeededForNextLevel,
      };
    });

    return {
      guild: {
        id: guildId,
        name: server?.name || "Discord Server",
        icon: server?.icon || null,
        memberCount: server?.memberCount || stats.totalUsers,
        enabled: isEnabled,
      },
      visibility,
      isPrivate: false,
      stats: {
        totalTrackedMembers: stats.totalUsers,
        totalXp: stats.totalXp,
        totalMessages: stats.totalMessages,
      },
      page,
      limit,
      total: leaderboardResult.total,
      totalPages: Math.ceil(leaderboardResult.total / limit) || 1,
      top3: formattedTop3,
      users: formattedUsers,
      settings: {
        announcementChannel: xpSettings?.announcementChannel || null,
      },
    };
  } catch (err: any) {
    console.error(`[XP Leaderboard] Failed to fetch leaderboard for ${guildId}:`, err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to retrieve leaderboard data",
    });
  }
});
