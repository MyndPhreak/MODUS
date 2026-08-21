/**
 * GET /api/xp/my-servers
 *
 * Servers the logged-in user is a member of (per their own Discord OAuth
 * guild list) that have MODUS installed and XP tracking enabled. Used by
 * the /xp directory page to give a direct way back into "my" leaderboards
 * without hunting for the link in Discord.
 */
import { getRepos } from "../../utils/db";
import { getXpProgress } from "@modus/db/rank-cards";
import {
  fetchUserDiscordGuilds,
  requireAuthedUserId,
} from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthedUserId(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  }

  const discordGuilds = await fetchUserDiscordGuilds(event);
  const guildIds = discordGuilds.map((g) => g.id);
  if (guildIds.length === 0) return [];

  const registeredServers = await repos.servers.listByGuildIds(guildIds);
  if (registeredServers.length === 0) return [];

  const results = await Promise.all(
    registeredServers.map(async (server) => {
      const isEnabled = await repos.guildConfigs.isModuleEnabled(
        server.guild_id,
        "xp",
      );
      if (!isEnabled) return null;

      const [xpSettings, xpDoc] = await Promise.all([
        repos.guildConfigs.getModuleSettings(server.guild_id, "xp"),
        repos.xp.getByGuildAndUser(server.guild_id, userId),
      ]);
      const visibility =
        (xpSettings?.leaderboardVisibility as "private" | "unlisted" | "public") ||
        "private";
      const progress = getXpProgress(xpDoc?.xp || 0);
      const discordGuild = discordGuilds.find((g) => g.id === server.guild_id);

      return {
        guildId: server.guild_id,
        name: server.name || discordGuild?.name || "Discord Server",
        icon: server.icon ?? discordGuild?.icon ?? null,
        visibility,
        xp: xpDoc?.xp || 0,
        level: progress.level,
        rankedYet: Boolean(xpDoc),
      };
    }),
  );

  return results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.xp - a.xp);
});
