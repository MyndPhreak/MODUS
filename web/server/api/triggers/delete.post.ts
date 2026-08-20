/**
 * Delete a trigger.
 *
 * Body: { trigger_id }
 */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

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

  // Resolve the trigger's owning guild and authorize against it before delete.
  const existing = await repos.triggers.getById(body.trigger_id);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Trigger not found." });
  }
  await requireModuleAccess(event, existing.guild_id, "triggers");

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
