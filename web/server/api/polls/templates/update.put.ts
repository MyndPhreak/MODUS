/** Update a poll template. Body: { template_id, data: {...partial fields} } */
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.template_id || !body.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: template_id, data.",
    });
  }
  if (body.data.options !== undefined) {
    if (
      !Array.isArray(body.data.options) ||
      body.data.options.length < 2 ||
      body.data.options.length > 10
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "options must have between 2 and 10 entries.",
      });
    }
  }
  if (body.data.duration_hours !== undefined) {
    const d = Number(body.data.duration_hours);
    if (!Number.isInteger(d) || d < 1 || d > 168) {
      throw createError({
        statusCode: 400,
        statusMessage: "duration_hours must be an integer between 1 and 168.",
      });
    }
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
    const template = await repos.pollTemplates.update(body.template_id, {
      name: body.data.name,
      question: body.data.question,
      options: body.data.options,
      durationHours: body.data.duration_hours,
      allowMultiselect: body.data.allow_multiselect,
    });
    return { template };
  } catch (error: any) {
    console.error(
      "[Poll Templates API] update failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update poll template.",
    });
  }
});
