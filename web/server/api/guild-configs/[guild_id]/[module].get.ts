/**
 * GET /api/guild-configs/:guild_id/:module
 *
 * Returns `{ enabled, settings }` for a single module on a single guild.
 * Convenience endpoint for dashboard pages editing a specific module.
 */
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  const moduleName = getRouterParam(event, "module");
  if (!guildId || !moduleName) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id or module route param.",
    });
  }

  // Module settings can contain secrets (e.g. the AI provider API key), so
  // this must be restricted to managers of the specific guild rather than any
  // authenticated user.
  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const [enabled, settings] = await Promise.all([
      repos.guildConfigs.isModuleEnabled(guildId, moduleName),
      repos.guildConfigs.getModuleSettings(guildId, moduleName),
    ]);
    return { enabled, settings };
  } catch (error: any) {
    console.error(
      `[GuildConfigs API] get(${guildId}/${moduleName}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch guild config.",
    });
  }
});
