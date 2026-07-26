/**
 * POST /api/servers/add
 *
 * Registers a new server with the calling user as owner + initial admin.
 * The caller must be a member of the guild with Manage Server (or
 * Administrator) permission — otherwise any logged-in user could claim
 * ownership of an arbitrary guild_id and gain config write access.
 * Returns 409 on duplicate.
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";
import { canManageGuild } from "#shared/discord-permissions";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthedUserId(event);

  const body = await readBody(event);
  const { guild_id } = body || {};

  if (!guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: guild_id.",
    });
  }

  // ── Discord permission check ─────────────────────────────────────────
  // Guild name/icon are taken from Discord's response, not the request
  // body, so a caller can't register a guild with spoofed metadata.
  let targetGuild: any;
  try {
    const guildsResponse = await $fetch("/api/discord/guilds", {
      headers: { cookie: event.headers.get("cookie") || "" },
    });
    const guilds = Array.isArray(guildsResponse) ? guildsResponse : [];
    targetGuild = guilds.find((g: any) => g.id === guild_id);
  } catch (err) {
    console.error(
      "[Add Server API] Failed to validate Discord permissions:",
      err,
    );
    throw createError({
      statusCode: 502,
      statusMessage:
        "Failed to validate Discord permissions. Please try again.",
    });
  }

  if (!targetGuild || !canManageGuild(targetGuild.permissions)) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "You do not have Manage Server permission on this Discord server.",
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
      name: targetGuild.name,
      icon: targetGuild.icon ?? null,
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
