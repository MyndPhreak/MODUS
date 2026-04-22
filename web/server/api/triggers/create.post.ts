/**
 * Create a trigger. 409 on duplicate secret or (guild_id, name).
 *
 * Body (JSON):
 *   - guild_id, name, secret, provider, channel_id (required)
 *   - embed_template?, filters?, created_by? (optional)
 */
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (
    !body.guild_id ||
    !body.name ||
    !body.secret ||
    !body.provider ||
    !body.channel_id
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Missing required fields: guild_id, name, secret, provider, channel_id.",
    });
  }

  const input = {
    guild_id: body.guild_id,
    name: body.name,
    secret: body.secret,
    provider: body.provider,
    channel_id: body.channel_id,
    embed_template: body.embed_template || undefined,
    filters: body.filters || undefined,
    created_by: body.created_by || undefined,
  };

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const id = await repos.triggers.create(input);
    return { success: true, document: { $id: id, ...input, enabled: true } };
  } catch (error: any) {
    if (error?.code === "23505") {
      throw createError({
        statusCode: 409,
        statusMessage: "A trigger with that secret or name already exists.",
      });
    }
    console.error(
      "[Triggers API] Postgres create failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create trigger.",
    });
  }
});
