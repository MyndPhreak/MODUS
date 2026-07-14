/**
 * GET /api/admin/servers
 *
 * Admin-only. Paginated server rows for the admin servers page.
 * Query params: page (>=1, default 1), limit (1-100, default 25),
 * status (online|offline|all, default all), premium (true to narrow).
 * Returns { rows, total, page, limit }.
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

  const q = getQuery(event);
  const page = Math.max(1, Number.parseInt(String(q.page ?? ""), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(q.limit ?? ""), 10) || 25),
  );
  const status =
    q.status === "online" || q.status === "offline" ? q.status : undefined;
  const premium = q.premium === "true" ? true : undefined;

  try {
    const { rows, total } = await repos.servers.listPage({
      status,
      premium,
      offset: (page - 1) * limit,
      limit,
    });
    return { rows, total, page, limit };
  } catch (error: any) {
    console.error(
      "[Admin Servers API] listPage failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch servers.",
    });
  }
});
