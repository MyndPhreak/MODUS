/**
 * POST /api/automod
 *
 * Create a new automod rule. Caller must manage the target guild.
 *
 * Body mirrors the repo's createAutoModRule input: guild_id, name,
 * trigger, conditions, actions, enabled, priority, exempt_roles,
 * exempt_channels, cooldown, created_by.
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body?.guild_id || !body?.name || !body?.trigger) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, name, trigger.",
    });
  }

  const { userId } = await requireGuildManager(event, body.guild_id);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const id = await repos.automod.create({
      guild_id: body.guild_id,
      name: body.name,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 0,
      trigger: body.trigger,
      conditions: body.conditions ?? "{}",
      actions: body.actions ?? "[]",
      exempt_roles: body.exempt_roles,
      exempt_channels: body.exempt_channels,
      cooldown: body.cooldown,
      created_by: body.created_by ?? userId,
    });
    return { success: true, id };
  } catch (error: any) {
    console.error(
      "[Automod API] create failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create automod rule.",
    });
  }
});
