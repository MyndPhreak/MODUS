/**
 * Delete a trigger.
 *
 * Body: { trigger_id }
 */
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.trigger_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: trigger_id.",
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
    await repos.triggers.delete(body.trigger_id);
    return { success: true };
  } catch (error: any) {
    console.error(
      "[Triggers API] Postgres delete failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete trigger.",
    });
  }
});
