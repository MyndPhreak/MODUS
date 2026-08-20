/**
 * PUT /api/module-access/:guild_id/:module
 *
 * Replace the Discord role IDs granted access to this module's dashboard
 * config page. Admin-only.
 *
 * Body: { roleIds: string[] }
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

  const body = await readBody<{ roleIds?: string[] }>(event);
  if (
    !Array.isArray(body?.roleIds) ||
    !body.roleIds.every((r: unknown) => typeof r === "string")
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: roleIds (array).",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  await repos.moduleAccess.setRoleIds(guildId, moduleName, body.roleIds);
  return { success: true };
});
