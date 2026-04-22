/**
 * Delete a tag.
 *
 * POST body: { tag_id, guild_id }
 */
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { tag_id, guild_id } = body || {};

  if (!tag_id || !guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: tag_id, guild_id.",
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
    await repos.tags.delete(tag_id);
    return { success: true };
  } catch (error: any) {
    console.error("[Tags API] Postgres delete failed:", error?.message || error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete tag.",
    });
  }
});
