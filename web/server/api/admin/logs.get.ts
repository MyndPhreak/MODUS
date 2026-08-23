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
import { createAdminLogRouteHandler } from "../../utils/admin-logs/api-response";

const handler = createAdminLogRouteHandler({
  authorize: requireBotAdmin,
  getQuery,
  getRepositories: getRepos,
  createHttpError: (statusCode, statusMessage) => createError({
    statusCode,
    statusMessage,
  }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[Admin Logs API] Postgres searchPage failed (${errorName}).`);
  },
});

export default defineEventHandler(handler);
