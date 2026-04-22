/**
 * PUT /api/global-config/ai
 *
 * Admin-only. Writes the sentinel `guild_configs` row for global AI
 * defaults. Body is the full settings object; an empty object effectively
 * clears the override.
 */
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);

  const body = await readBody<Record<string, any>>(event);
  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      statusMessage: "Body must be a JSON object with the global AI config.",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    await repos.guildConfigs.setGlobalAIConfig(body);
    return { success: true };
  } catch (error: any) {
    console.error("[Global AI Config] write failed:", error?.message || error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to save global AI config.",
    });
  }
});
