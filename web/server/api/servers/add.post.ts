/**
 * POST /api/servers/add
 *
 * Registers a new server with the calling user as owner + initial admin.
 * Returns 409 on duplicate.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthedUserId(event);

  const body = await readBody(event);
  const { guild_id, name, icon } = body || {};

  if (!guild_id || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, name.",
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
    const doc = await repos.servers.createForGuild({
      guild_id,
      name,
      icon: icon ?? null,
      owner_id: userId,
    });
    return {
      $id: doc.$id,
      guild_id: doc.guild_id,
      name: doc.name,
      icon: doc.icon,
      owner_id: doc.owner_id,
    };
  } catch (error: any) {
    if (error?.code === "DUPLICATE_SERVER") {
      throw createError({
        statusCode: 409,
        statusMessage: "This server is already registered.",
      });
    }
    console.error("[Add Server API] Postgres error:", error?.message || error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to add server.",
    });
  }
});
