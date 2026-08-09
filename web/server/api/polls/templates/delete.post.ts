/** Delete a poll template. Body: { template_id } */
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.template_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: template_id.",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  const existing = await repos.pollTemplates.getById(body.template_id);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Template not found." });
  }
  await requireGuildManager(event, existing.guildId);

  try {
    await repos.pollTemplates.delete(body.template_id);
    return { success: true };
  } catch (error: any) {
    console.error(
      "[Poll Templates API] delete failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete poll template.",
    });
  }
});
