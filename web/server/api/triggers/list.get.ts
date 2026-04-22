/** List triggers for a guild. */
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
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
    const documents = await repos.triggers.listByGuild(guildId);
    return { documents, total: documents.length };
  } catch (error: any) {
    console.error(
      `[Triggers API] Postgres list failed for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch triggers.",
    });
  }
});
