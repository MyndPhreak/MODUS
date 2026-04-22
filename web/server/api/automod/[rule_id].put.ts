/**
 * PUT /api/automod/:rule_id
 *
 * Update an automod rule. Caller must manage the rule's guild (resolved
 * from the rule row, not trusted from the body) so a user can't
 * mutate rules in a guild they don't admin by guessing rule IDs.
 *
 * Body: partial { name, enabled, priority, trigger, conditions, actions,
 *                 exempt_roles, exempt_channels, cooldown }
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const ruleId = getRouterParam(event, "rule_id");
  if (!ruleId) {
    throw createError({ statusCode: 400, statusMessage: "Missing rule_id" });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  const existing = await repos.automod.getById(ruleId);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Rule not found" });
  }

  await requireGuildManager(event, existing.guild_id);

  const body = await readBody(event);
  try {
    await repos.automod.update(ruleId, body ?? {});
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Automod API] update(${ruleId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update automod rule.",
    });
  }
});
