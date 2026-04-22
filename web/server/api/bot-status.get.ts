/**
 * GET /api/bot-status
 *
 * Returns every shard's heartbeat row. Used by the main dashboard page
 * to render per-shard status and decide whether individual guilds are
 * "online" (i.e. their shard's heartbeat is recent).
 */
import { getRepos } from "../utils/db";
import { requireAuthedUserId } from "../utils/session";

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
    return await repos.botStatus.listAll(50);
  } catch (error: any) {
    console.error(
      "[Bot Status API] listAll failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch bot status.",
    });
  }
});
