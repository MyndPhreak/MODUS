/**
 * PATCH /api/modules/:name
 *
 * Admin-only. Toggles a module's global `enabled` flag. This is the
 * fleet-wide kill switch — per-guild enabling lives in guild_configs.
 *
 * Body: { enabled: boolean }
 */
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);

  const name = getRouterParam(event, "name");
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "Missing module name" });
  }

  const body = await readBody(event);
  if (typeof body?.enabled !== "boolean") {
    throw createError({
      statusCode: 400,
      statusMessage: "Body must include { enabled: boolean }.",
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
    await repos.modules.setEnabled(name, body.enabled);
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Modules API] setEnabled(${name}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update module.",
    });
  }
});
