/** Update a poll template. Body: { template_id, data: {...partial fields} } */
import { getRepos } from "../../../utils/db";
import { requireModuleAccess } from "../../../utils/session";

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
    // Discord caps each answer's text at 55 chars — validate at save time
    // too (matching send.post.ts) so a template can't be saved with
    // content that will always fail to send.
    const invalidOption = body.data.options.find(
      (opt: unknown) =>
        typeof opt !== "string" || opt.trim().length === 0 || opt.length > 55,
    );
    if (invalidOption !== undefined) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Each option must be a non-empty string of 55 characters or fewer.",
      });
    }
  }
  if (body.data.question !== undefined) {
    // Discord caps poll question text at 300 chars.
    if (typeof body.data.question !== "string" || body.data.question.length > 300) {
      throw createError({
        statusCode: 400,
        statusMessage: "question must be a string of 300 characters or fewer.",
      });
    }
  }
  let durationHours: number | undefined;
  if (body.data.duration_hours !== undefined) {
    durationHours = Number(body.data.duration_hours);
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 168) {
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
  await requireModuleAccess(event, existing.guildId, "polls");

  try {
    const template = await repos.pollTemplates.update(body.template_id, {
      name: body.data.name,
      question: body.data.question,
      options: body.data.options,
      durationHours,
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
