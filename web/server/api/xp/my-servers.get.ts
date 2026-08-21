/**
 * GET /api/xp/my-servers?guildIds=1,2,3
 *
 * Servers (from the caller-supplied guild ID list, sourced client-side from
 * their already-hydrated Discord session) that have MODUS installed and XP
 * tracking enabled. Used by the /xp directory page to give a direct way
 * back into "my" leaderboards without hunting for the link in Discord.
 *
 * Deliberately does NOT re-fetch the guild list from Discord: /api/discord/me
 * already does that on every session hydration, and Discord's
 * /users/@me/guilds endpoint is tightly rate-limited — a second concurrent
 * call here reliably 429s. guildIds are only used to filter which MODUS
 * servers to look up; the caller's own XP/level is always read from the
 * authenticated session's userId, never from client input.
 */
import { getRepos } from "../../utils/db";
import { getXpProgress } from "@modus/db/rank-cards";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthedUserId(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  }

  const query = getQuery(event);
  const guildIds = String(query.guildIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
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

      return {
        guildId: server.guild_id,
        name: server.name || "Discord Server",
        icon: server.icon ?? null,
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
