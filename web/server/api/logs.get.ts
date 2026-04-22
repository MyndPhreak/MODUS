/**
 * GET /api/logs?guild_id=...&limit=...
 *
 * Per-guild log tail. The admin dashboard has its own /api/admin/logs
 * for cross-guild scope; this one is scoped so guild-level pages can
 * read without seeing other guilds' logs.
 */
import { getRepos } from "../utils/db";
import { requireAuthedUserId } from "../utils/session";

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const query = getQuery(event);
  const guildId = query.guild_id as string;
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  const limit = Math.min(Number(query.limit) || 200, 500);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repos.logs.listByGuild(guildId, limit);
  } catch (error: any) {
    console.error(
      `[Logs API] listByGuild(${guildId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch logs.",
    });
  }
});
