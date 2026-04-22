/**
 * Update a trigger.
 *
 * Body: { trigger_id, data: { ... } }
 */
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.trigger_id || !body.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: trigger_id, data.",
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
    await repos.triggers.update(body.trigger_id, body.data);
    return { success: true };
  } catch (error: any) {
    console.error(
      "[Triggers API] Postgres update failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update trigger.",
    });
  }
});
