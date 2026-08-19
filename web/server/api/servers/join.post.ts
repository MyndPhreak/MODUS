/**
 * POST /api/servers/join
 *
 * Allows a Discord admin to join an existing server's admin list.
 * Validates:
 *   1. The server exists in our DB
 *   2. The user has Discord ADMINISTRATOR on the guild OR one of the
 *      server's configured dashboard_role_ids
 *   3. The user isn't already in admin_user_ids
 */
import { getRepos } from "../../utils/db";
import {
  getResolvedDiscordId,
  requireAuthedUserId,
} from "../../utils/session";
import { fetchGuildMemberRoleIds } from "../../utils/discord";
import { canManageGuild } from "#shared/discord-permissions";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { userId } = await requireAuthedUserId(event);

  const body = await readBody(event);
  const { guild_id } = body || {};

  if (!guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: guild_id.",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  // ── Discord ADMINISTRATOR / MANAGE_GUILD check ───────────────────────
  let hasAdminPerm = false;
  try {
    const guildsResponse = await $fetch("/api/discord/guilds", {
      headers: { cookie: event.headers.get("cookie") || "" },
    });
    const guilds = Array.isArray(guildsResponse) ? guildsResponse : [];
    const targetGuild = guilds.find((g: any) => g.id === guild_id);

    if (targetGuild) {
      hasAdminPerm = canManageGuild(targetGuild.permissions);
    }
  } catch (err) {
    console.error(
      "[Join Server API] Failed to validate Discord permissions:",
      err,
    );
    throw createError({
      statusCode: 502,
      statusMessage:
        "Failed to validate Discord permissions. Please try again.",
    });
  }

  const existing = await repos.servers.getByGuildId(guild_id);
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Server not found. It may not be registered yet.",
    });
  }

  // ── dashboard_role_ids fallback for non-admin Discord users ──────────
  if (!hasAdminPerm) {
    let hasDashboardRole = false;
    const dashboardRoles = existing.dashboard_role_ids;

    if (dashboardRoles.length > 0) {
      const discordUid = await getResolvedDiscordId(event);
      if (discordUid) {
        const memberRoleIds = await fetchGuildMemberRoleIds(guild_id, discordUid);
        hasDashboardRole = memberRoleIds.some((r) => dashboardRoles.includes(r));
      }
    }

    if (!hasDashboardRole) {
      throw createError({
        statusCode: 403,
        statusMessage:
          "You do not have Manage Server permission or a dashboard role on this Discord server.",
      });
    }
  }

  // Already admin → idempotent success
  if (existing.admin_user_ids.includes(userId)) {
    return {
      $id: existing.$id,
      guild_id,
      name: existing.name,
      icon: existing.icon,
      owner_id: existing.owner_id,
      already_member: true,
    };
  }

  try {
    const result = await repos.servers.addAdmin(guild_id, userId);
    if (!result) {
      throw createError({ statusCode: 404, statusMessage: "Server not found." });
    }
    return {
      $id: result.server.$id,
      guild_id,
      name: result.server.name,
      icon: result.server.icon,
      owner_id: result.server.owner_id,
      joined: !result.wasAlreadyAdmin,
      already_member: result.wasAlreadyAdmin,
    };
  } catch (error: any) {
    if (error?.statusCode) throw error;
    console.error("[Join Server API] Postgres error:", error?.message || error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to join server.",
    });
  }
});
