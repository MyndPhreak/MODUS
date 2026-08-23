/**
 * GET /api/admin/audit-events
 *
 * Admin-only, read-only. Cursor-paginated history of bot-admin mutations
 * (module/music toggles, AI config, premium changes) recorded by
 * server/utils/admin-audit. Before/after state is already sanitized at
 * write time — no further redaction happens on read.
 */
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";
import { createAdminAuditRouteHandler } from "../../utils/admin-audit/query";

const handler = createAdminAuditRouteHandler({
  authorize: requireBotAdmin,
  getQuery,
  getRepositories: getRepos,
  createHttpError: (statusCode, statusMessage) => createError({
    statusCode,
    statusMessage,
  }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[Admin Audit Events API] Postgres searchPage failed (${errorName}).`);
  },
});

export default defineEventHandler(handler);
