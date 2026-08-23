/** Delete a non-active giveaway record from the dashboard. The Discord message remains untouched. */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const guildId = body?.guild_id;
  const id = String(body?.id || "").trim();

  if (!guildId || !id) {
    throw createError({ statusCode: 400, statusMessage: "Missing required fields: guild_id, id." });
  }

  await requireModuleAccess(event, guildId, "giveaways");

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable (NUXT_DATABASE_URL not set)." });
  }

  const giveaway = await repos.giveaways.getById(id);
  if (!giveaway || giveaway.guildId !== guildId) {
    throw createError({ statusCode: 404, statusMessage: "Giveaway not found for this server." });
  }
  if (giveaway.status === "active") {
    throw createError({ statusCode: 400, statusMessage: "Active giveaways cannot be deleted." });
  }

  await repos.giveaways.deleteById(id);
  return { success: true };
});
