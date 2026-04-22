/**
 * PUT /api/guild-configs/:guild_id/:module
 *
 * Update a single module's settings and/or enabled flag on a guild.
 * Caller must be the server owner or a listed admin (or a bot admin).
 *
 * Body: { enabled?: boolean, settings?: object }
 *   - Either field is optional; omit what you don't want to change.
 *   - Unknown fields are ignored.
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

  await requireGuildManager(event, guildId);

  const body = await readBody<{
    enabled?: boolean;
    settings?: Record<string, any>;
  }>(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    if (body?.settings !== undefined) {
      await repos.guildConfigs.setModuleSettings(
        guildId,
        moduleName,
        body.settings ?? {},
      );
    }
    if (typeof body?.enabled === "boolean") {
      await repos.guildConfigs.setModuleStatus(
        guildId,
        moduleName,
        body.enabled,
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error(
      `[GuildConfigs API] put(${guildId}/${moduleName}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update guild config.",
    });
  }
});
