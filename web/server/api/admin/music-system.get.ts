/**
 * GET /api/admin/music-system
 *
 * Admin-only. Current state of the fleet-wide music playback switch.
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

  const flag = await repos.systemFlags.getFlag("music");
  return {
    enabled: flag?.enabled ?? true,
    reason: flag?.reason ?? null,
    updatedAt: flag?.updatedAt?.toISOString() ?? null,
  };
});
