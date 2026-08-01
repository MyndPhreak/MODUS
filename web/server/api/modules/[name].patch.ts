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
import { CHANNEL_MODULES, publish } from "../../utils/eventbus";

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
    // Notify the running bot fleet so every shard re-reads the modules table
    // and refreshes its in-memory enabled set. Without this the toggle only
    // takes effect on the next bot restart. No-op when Redis is unconfigured.
    await publish(CHANNEL_MODULES, { kind: "changed" });
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
