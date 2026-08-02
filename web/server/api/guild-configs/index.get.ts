/**
 * GET /api/guild-configs?guild_id=...
 *
 * Returns every guild_config row for a single guild (all modules). Used
 * by useServerSettings to populate the sidebar with per-module enabled
 * state and rehydrate settings editors.
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

  // Module settings can carry secrets (e.g. the AI module's aiApiKey), so
  // this must be scoped to managers of the guild — not any logged-in user.
  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repos.guildConfigs.listByGuild(guildId);
  } catch (error: any) {
    console.error(
      `[GuildConfigs API] list failed for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch guild configs.",
    });
  }
});
