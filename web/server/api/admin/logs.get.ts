/**
 * GET /api/admin/logs
 *
 * Searchable retained log history across all guilds. Live updates continue
 * over the bounded Redis SSE stream.
 *
 * Auth: bot admins only — this returns log entries across every guild, so it
 * must not be readable by ordinary authenticated users.
 */
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";
import { mapAdminLogSearchPage } from "../../utils/admin-logs/api-response";
import {
  AdminLogQueryError,
  parseAdminLogQuery,
} from "../../utils/admin-logs/query";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  let query;
  try {
    query = parseAdminLogQuery(getQuery(event));
  } catch (error) {
    if (error instanceof AdminLogQueryError) {
      throw createError({
        statusCode: 400,
        statusMessage: error.message,
      });
    }
    throw error;
  }

  try {
    const page = await repos.logs.searchPage(query);
    return mapAdminLogSearchPage(page);
  } catch (error: any) {
    console.error(
      "[Admin Logs API] Postgres searchPage failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch logs.",
    });
  }
});
