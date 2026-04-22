/**
 * GET /api/servers/by-guild-ids?ids=123,456,789
 *
 * Returns server documents that match the given guild IDs. Used by the
 * Discover page to check which of the user's Discord guilds are already
 * registered.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const query = getQuery(event);
  const idsParam = (query.ids as string) || "";
  const guildIds = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (guildIds.length === 0) return [];

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const rows = await repos.servers.listByGuildIds(guildIds);
    return rows.map((doc) => ({
      $id: doc.$id,
      guild_id: doc.guild_id,
      name: doc.name,
      icon: doc.icon,
      owner_id: doc.owner_id,
      admin_user_ids: doc.admin_user_ids,
      dashboard_role_ids: doc.dashboard_role_ids,
    }));
  } catch (error: any) {
    console.error(
      "[By Guild IDs API] Postgres error:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to check servers.",
    });
  }
});
