/**
 * GET /api/module-access/:guild_id/:module
 *
 * The Discord role IDs currently granted access to this module's dashboard
 * config page. Admin-only — module-scoped users can use their module's
 * page but can't see or change who else has access to it.
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

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  const roleIds = await repos.moduleAccess.getRoleIds(guildId, moduleName);
  return { roleIds };
});
