/**
 * DELETE /api/automod/:rule_id
 *
 * Delete an automod rule. Caller must manage the rule's guild.
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

  try {
    await repos.automod.delete(ruleId);
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Automod API] delete(${ruleId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete automod rule.",
    });
  }
});
