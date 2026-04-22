/**
 * GET /api/servers/my-servers
 *
 * Returns servers the current user owns or is listed as an admin on.
 * Requires Postgres — the dashboard can't operate without it.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthedUserId(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repos.servers.listOwnedOrAdminBy(userId);
  } catch (error: any) {
    console.error(
      `[My Servers API] Postgres error for ${userId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch servers.",
    });
  }
});
