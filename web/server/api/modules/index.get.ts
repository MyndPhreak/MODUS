/**
 * GET /api/modules
 *
 * List every registered module (static registry, not per-guild enabled
 * state). Used by the admin modules page and by useServerSettings to
 * render module toggles.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

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
    return await repos.modules.listAll();
  } catch (error: any) {
    console.error("[Modules API] list failed:", error?.message || error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch modules.",
    });
  }
});
