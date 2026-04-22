/**
 * PATCH /api/admin/servers/:guild_id/premium
 *
 * Admin-only. Toggles the `premium` flag on a server. This is the only
 * `servers` column the admin dashboard mutates today, so a scoped
 * endpoint is clearer than a generic PATCH.
 *
 * Body: { premium: boolean }
 */
import { getRepos } from "../../../../utils/db";
import { requireBotAdmin } from "../../../../utils/session";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);

  const guildId = getRouterParam(event, "guild_id");
  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id" });
  }

  const body = await readBody(event);
  if (typeof body?.premium !== "boolean") {
    throw createError({
      statusCode: 400,
      statusMessage: "Body must include { premium: boolean }.",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    await repos.servers.setPremium(guildId, body.premium);
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Admin Servers API] setPremium(${guildId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update premium flag.",
    });
  }
});
