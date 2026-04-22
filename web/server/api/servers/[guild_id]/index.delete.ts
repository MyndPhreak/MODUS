/**
 * DELETE /api/servers/:guild_id
 *
 * Un-registers a server. Wipes the servers row and every guild_configs
 * row for the guild. Caller must be the owner or a listed admin (or a
 * bot admin).
 *
 * Note: does NOT delete automod_rules, logs, recordings, etc. Those are
 * guild-partitioned but may be referenced outside the dashboard (e.g.
 * the bot keeps writing logs even for un-registered guilds until it
 * leaves). Run a manual cleanup if you want a full purge.
 */
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id" });
  }

  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    await repos.guildConfigs.deleteAllForGuild(guildId);
    await repos.servers.deleteByGuildId(guildId);
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Servers API] remove(${guildId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to remove server.",
    });
  }
});
