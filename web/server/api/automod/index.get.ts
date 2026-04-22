/**
 * GET /api/automod?guild_id=...
 *
 * List all automod rules for a guild. Read-access is open to any
 * authenticated user; writes are gated by requireGuildManager on the
 * POST/PUT/DELETE endpoints.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

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

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const documents = await repos.automod.listByGuild(guildId);
    return { documents, total: documents.length };
  } catch (error: any) {
    console.error(
      `[Automod API] list failed for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch automod rules.",
    });
  }
});
