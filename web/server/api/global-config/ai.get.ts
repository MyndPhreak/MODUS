/**
 * GET /api/global-config/ai
 *
 * Returns the admin-set global AI fallback config (provider, model,
 * base_url, etc.). Reads the sentinel `guild_configs` row
 * (`guildId = "__global__"`, `moduleName = "ai"`).
 *
 * Any authenticated user may read it, but the shared provider API key
 * lives in this same row (`aiApiKey`) and must never reach the client —
 * it is stripped from the response below and replaced with a boolean flag.
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
    const config = (await repos.guildConfigs.getGlobalAIConfig()) ?? {};
    // Strip the shared provider key — the client only needs the non-secret
    // flags plus a signal for whether a key is configured.
    const { aiApiKey, ...safe } = config as Record<string, any>;
    return { ...safe, hasApiKey: Boolean(aiApiKey) };
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
