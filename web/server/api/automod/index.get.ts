/**
 * GET /api/automod?guild_id=...
 *
 * List all automod rules for a guild. Scoped to managers of the guild,
 * matching the POST/PUT/DELETE endpoints — rule config would otherwise
 * leak cross-tenant to any authenticated user.
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

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
