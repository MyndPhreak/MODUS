/**
 * List tags for a guild.
 */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  try {
    await requireModuleAccess(event, guildId, "tags");
  } catch (err: any) {
    if (err?.statusCode !== 403) throw err;
    await requireModuleAccess(event, guildId, "embeds");
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const documents = await repos.tags.listByGuild(guildId);
    return { documents, total: documents.length };
  } catch (error: any) {
    console.error(
      `[Tags API] Postgres list failed for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch tags.",
    });
  }
});
