/**
 * PATCH /api/servers/dashboard-roles
 *
 * Updates the dashboard_role_ids for a server. Only the server owner or
 * an existing admin can change this setting.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthedUserId(event);

  const body = await readBody(event);
  const { guild_id, dashboard_role_ids } = body || {};

  if (!guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: guild_id.",
    });
  }
  if (!Array.isArray(dashboard_role_ids)) {
    throw createError({
      statusCode: 400,
      statusMessage: "dashboard_role_ids must be an array.",
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
    const existing = await repos.servers.getByGuildId(guild_id);
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: "Server not found." });
    }

    const isOwner = existing.owner_id === userId;
    const isAdmin = existing.admin_user_ids.includes(userId);
    if (!isOwner && !isAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage:
          "Only the server owner or an admin can update dashboard roles.",
      });
    }

    const updated = await repos.servers.updateDashboardRoles(
      guild_id,
      dashboard_role_ids,
    );
    return {
      $id: updated?.$id ?? existing.$id,
      dashboard_role_ids: updated?.dashboard_role_ids ?? dashboard_role_ids,
    };
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error(
      "[Dashboard Roles API] Postgres error:",
      err?.message || err,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update dashboard roles.",
    });
  }
});
