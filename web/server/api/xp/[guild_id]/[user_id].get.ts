/**
 * GET /api/xp/[guild_id]/[user_id]
 *
 * Fetch individual member's XP stats, ranking, server info, and visual rank card data.
 */
import { getRepos } from "../../../utils/db";
import { getXpProgress } from "@modus/db/rank-cards";
import { getResolvedDiscordId } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  const userId = getRouterParam(event, "user_id");

  if (!guildId || !userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id or user_id" });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  }

  try {
    const [server, xpSettings, user, callerId, stats] = await Promise.all([
      repos.servers.getByGuildId(guildId),
      repos.guildConfigs.getModuleSettings(guildId, "xp"),
      repos.xp.getByGuildAndUser(guildId, userId),
      getResolvedDiscordId(event),
      repos.xp.getGuildStats(guildId),
    ]);

    if (!user) {
      throw createError({ statusCode: 404, statusMessage: "User has no XP records in this server" });
    }

    const isSelfOrAdmin =
      callerId === userId ||
      callerId === server?.owner_id ||
      server?.admin_user_ids?.includes(callerId || "");

    if (user.hidden_from_leaderboard && !isSelfOrAdmin) {
      throw createError({ statusCode: 403, statusMessage: "This member has chosen to keep their XP profile private." });
    }

    // Resolve avatar if missing
    let avatarUrl = user.avatar;
    if (!avatarUrl) {
      const config = useRuntimeConfig();
      const botToken = (config.discordBotToken || process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN) as string;
      if (botToken) {
        try {
          const member: any = await $fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
            { headers: { Authorization: `Bot ${botToken}` } },
          );
          if (member?.avatar) {
            const ext = member.avatar.startsWith("a_") ? "gif" : "webp";
            avatarUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${member.avatar}.${ext}?size=128`;
          } else if (member?.user?.avatar) {
            const ext = member.user.avatar.startsWith("a_") ? "gif" : "webp";
            avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${member.user.avatar}.${ext}?size=128`;
          }
        } catch {
          try {
            const u: any = await $fetch(
              `https://discord.com/api/v10/users/${userId}`,
              { headers: { Authorization: `Bot ${botToken}` } },
            );
            if (u?.avatar) {
              const ext = u.avatar.startsWith("a_") ? "gif" : "webp";
              avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.${ext}?size=128`;
            }
          } catch {}
        }
        if (avatarUrl) {
          repos.xp.update(user.id, { avatar: avatarUrl }).catch(() => {});
        }
      }
    }

    const rank = await repos.xp.getRank(guildId, user.xp);
    const progress = getXpProgress(user.xp);

    return {
      guild: {
        id: guildId,
        name: server?.name || "Discord Server",
        icon: server?.icon || null,
        memberCount: server?.memberCount || stats.totalUsers,
      },
      user: {
        userId: user.user_id,
        guildId: user.guild_id,
        username: user.username,
        avatar: avatarUrl || null,
        xp: user.xp,
        level: progress.level,
        rank,
        messageCount: user.message_count,
        charCount: user.char_count,
        lastXpGainAt: user.last_xp_gain_at,
        notificationPref: user.notification_pref,
        optedIn: user.opted_in,
        hiddenFromLeaderboard: user.hidden_from_leaderboard,
        progressPercent: progress.progressPercent,
        currentLevelBaseXp: progress.currentLevelBaseXp,
        nextLevelBaseXp: progress.nextLevelBaseXp,
        xpInCurrentLevel: progress.xpInCurrentLevel,
        xpNeededForNextLevel: progress.xpNeededForNextLevel,
      },
      totalTrackedMembers: stats.totalUsers,
    };
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error(`[XP User] Error fetching user ${userId} in ${guildId}:`, err);
    throw createError({ statusCode: 500, statusMessage: "Failed to fetch user XP stats" });
  }
});
