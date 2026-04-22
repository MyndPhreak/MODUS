/**
 * GET /api/admin/servers
 *
 * Admin-only. Returns every registered server row for the admin servers
 * page. Unbounded list — at MODUS's scale the server count is low
 * enough that this is fine; add pagination if it ever isn't.
 */
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repos.servers.listAll();
  } catch (error: any) {
    console.error(
      "[Admin Servers API] listAll failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch servers.",
    });
  }
});
