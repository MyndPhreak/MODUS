/**
 * GET /api/guild-configs?guild_id=...
 *
 * Returns every guild_config row for a single guild (all modules). Used
 * by useServerSettings to populate the sidebar with per-module enabled
 * state and rehydrate settings editors.
 */
import { getRepos } from "../../utils/db";
import { getAccessibleModules } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  // Module settings can carry secrets (e.g. the AI module's aiApiKey), so a
  // module-scoped caller must only see rows for modules they're actually
  // granted — not the full guild dump a manager gets.
  const accessibleModules = await getAccessibleModules(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const rows = await repos.guildConfigs.listByGuild(guildId);
    if (accessibleModules === "all") return rows;
    return rows.filter((r) => accessibleModules.includes(r.moduleName));
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
