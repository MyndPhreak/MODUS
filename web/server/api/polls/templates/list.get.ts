/** List poll templates for a guild. */
import { getRepos } from "../../../utils/db";
import { requireModuleAccess } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  await requireModuleAccess(event, guildId, "polls");

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const templates = await repos.pollTemplates.listByGuild(guildId);
    return { templates };
  } catch (error: any) {
    console.error(
      `[Poll Templates API] list failed for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch poll templates.",
    });
  }
});
