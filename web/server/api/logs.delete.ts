/**
 * DELETE /api/logs?guild_id=...
 *
 * Purges all log entries for the specified guild.
 * Requires the user to have guild management permissions.
 */
import { getRepos } from "../utils/db";
import { requireGuildManager } from "../utils/session";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
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
    const deletedCount = await repos.logs.deleteByGuild(guildId);
    return { success: true, count: deletedCount };
  } catch (error: any) {
    console.error(
      `[Logs API] deleteByGuild(${guildId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete logs.",
    });
  }
});
