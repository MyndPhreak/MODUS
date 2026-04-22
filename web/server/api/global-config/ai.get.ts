/**
 * GET /api/global-config/ai
 *
 * Returns the admin-set global AI fallback config (provider, model,
 * base_url, etc.). Reads the sentinel `guild_configs` row
 * (`guildId = "__global__"`, `moduleName = "ai"`).
 *
 * Any authenticated user may read it (the fields are non-sensitive
 * flags, and the API key itself is not stored here).
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
    return (await repos.guildConfigs.getGlobalAIConfig()) ?? {};
  } catch (error: any) {
    console.error(
      "[Global AI Config] read failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch global AI config.",
    });
  }
});
