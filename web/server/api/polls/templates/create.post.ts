/**
 * Create a poll template.
 *
 * Body: { guild_id, name, question, options: string[], duration_hours,
 *         allow_multiselect, created_by? }
 */
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.guild_id || !body.name || !body.question || !Array.isArray(body.options)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Missing required fields: guild_id, name, question, options.",
    });
  }
  if (body.options.length < 2 || body.options.length > 10) {
    throw createError({
      statusCode: 400,
      statusMessage: "options must have between 2 and 10 entries.",
    });
  }
  // Discord caps poll question text at 300 chars and each answer's text at
  // 55 chars — validate at save time too (matching send.post.ts) so a
  // template can't be saved with content that will always fail to send.
  if (typeof body.question !== "string" || body.question.length > 300) {
    throw createError({
      statusCode: 400,
      statusMessage: "question must be a string of 300 characters or fewer.",
    });
  }
  const invalidOption = body.options.find(
    (opt: unknown) => typeof opt !== "string" || opt.trim().length === 0 || opt.length > 55,
  );
  if (invalidOption !== undefined) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Each option must be a non-empty string of 55 characters or fewer.",
    });
  }
  const durationHours = Number(body.duration_hours);
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 168) {
    throw createError({
      statusCode: 400,
      statusMessage: "duration_hours must be an integer between 1 and 168.",
    });
  }

  const identity = await requireGuildManager(event, body.guild_id);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const template = await repos.pollTemplates.create({
      guildId: body.guild_id,
      name: body.name,
      question: body.question,
      options: body.options,
      durationHours,
      allowMultiselect: !!body.allow_multiselect,
      createdBy: body.created_by || identity.userId,
    });
    return { template };
  } catch (error: any) {
    console.error(
      "[Poll Templates API] create failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create poll template.",
    });
  }
});
