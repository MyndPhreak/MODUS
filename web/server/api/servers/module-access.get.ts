/**
 * GET /api/servers/module-access?guild_id=...
 *
 * The current caller's accessible-module set for this guild, when they are
 * NOT a full manager (the dashboard's checkPermissions flow only calls this
 * after the admin_user_ids / dashboard_role_ids checks have already
 * failed). Backs the module-scoped dashboard access branch.
 */
import { requireAuthedUserId, getAccessibleModules } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const query = getQuery(event);
  const guildId = query.guild_id as string;
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  const result = await getAccessibleModules(event, guildId);
  // "all" means the caller is actually a manager — shouldn't happen from
  // this call site, but if a role changes mid-session, report no
  // module-scoped grants rather than fabricating a full module list; the
  // client's earlier admin/join checks are the correct path for that case.
  return { modules: result === "all" ? [] : result };
});
