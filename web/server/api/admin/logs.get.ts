/**
 * GET /api/admin/logs
 *
 * Most recent 200 log entries across all guilds. Used by the admin logs
 * page for the initial snapshot before the SSE stream takes over.
 *
 * Auth: requires an authenticated session. The page is gated client-side;
 * tighten here if the policy changes.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

const LIMIT = 200;

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repos.logs.listAll(LIMIT);
  } catch (error: any) {
    console.error(
      "[Admin Logs API] Postgres listAll failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch logs.",
    });
  }
});
