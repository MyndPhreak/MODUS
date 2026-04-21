/**
 * POST /api/servers/join
 *
 * Allows a Discord admin to join an existing server's admin list.
 * Validates that:
 *   1. The server already exists in the system.
 *   2. The user has ADMINISTRATOR permission on the Discord guild,
 *      OR has one of the server's configured dashboard_role_ids.
 *   3. The user isn't already in admin_user_ids.
 *
 * Access is gated by Discord permission validation. DB routing: Postgres
 * when NUXT_USE_POSTGRES=true, else Appwrite.
 */
import { Client, Databases } from "node-appwrite";
import { getRepos } from "../../utils/db";

const ADMIN_PERMISSION = BigInt(0x8);

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // Auth guard
  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret || !userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: No session found.",
    });
  }

  const body = await readBody(event);
  const { guild_id } = body || {};

  if (!guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: guild_id.",
    });
  }

  // ── Validate Discord ADMINISTRATOR permission ─────────────────────────
  let hasAdminPerm = false;
  try {
    const guildsResponse = await $fetch("/api/discord/guilds", {
      headers: { cookie: event.headers.get("cookie") || "" },
    });
    const guilds = Array.isArray(guildsResponse) ? guildsResponse : [];
    const targetGuild = guilds.find((g: any) => g.id === guild_id);

    if (targetGuild) {
      const permissions = BigInt(targetGuild.permissions);
      hasAdminPerm = (permissions & ADMIN_PERMISSION) === ADMIN_PERMISSION;
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

  // ── Resolve dashboard role fallback check ─────────────────────────────
  // Pulls the server row via whichever backend is active, then (if the
  // user lacks ADMINISTRATOR) consults Discord for their role IDs.
  const repos = getRepos();

  const fetchServer = async (): Promise<{
    admin_user_ids: string[];
    dashboard_role_ids: string[];
    $id: string;
    name: string;
    icon: string | null;
    owner_id: string | null;
  } | null> => {
    if (repos) {
      const row = await repos.servers.getByGuildId(guild_id);
      if (!row) return null;
      return {
        admin_user_ids: row.admin_user_ids,
        dashboard_role_ids: row.dashboard_role_ids,
        $id: row.$id,
        name: row.name,
        icon: row.icon,
        owner_id: row.owner_id,
      };
    }
    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(projectId)
      .setKey(config.appwriteApiKey as string);
    const databases = new Databases(client);
    try {
      const doc: any = await databases.getDocument(
        "discord_bot",
        "servers",
        guild_id,
      );
      return {
        admin_user_ids: Array.isArray(doc.admin_user_ids)
          ? doc.admin_user_ids
          : [],
        dashboard_role_ids: Array.isArray(doc.dashboard_role_ids)
          ? doc.dashboard_role_ids
          : [],
        $id: doc.$id,
        name: doc.name,
        icon: doc.icon ?? null,
        owner_id: doc.owner_id ?? null,
      };
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  };

  const existing = await fetchServer();
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Server not found. It may not be registered yet.",
    });
  }

  if (!hasAdminPerm) {
    let hasDashboardRole = false;
    const dashboardRoles = existing.dashboard_role_ids;

    if (dashboardRoles.length > 0) {
      const discordUid = getCookie(event, `discord_uid_${projectId}`);
      if (discordUid) {
        const botToken = config.discordBotToken as string;
        if (botToken) {
          const member: any = await $fetch(
            `https://discord.com/api/v10/guilds/${guild_id}/members/${discordUid}`,
            { headers: { Authorization: `Bot ${botToken}` } },
          ).catch(() => null);
          if (member?.roles) {
            hasDashboardRole = member.roles.some((r: string) =>
              dashboardRoles.includes(r),
            );
          }
        }
      }
    }

    if (!hasDashboardRole) {
      throw createError({
        statusCode: 403,
        statusMessage:
          "You do not have Administrator permission or a dashboard role on this Discord server.",
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

  if (repos) {
    try {
      const result = await repos.servers.addAdmin(guild_id, userId);
      if (!result) {
        throw createError({
          statusCode: 404,
          statusMessage: "Server not found.",
        });
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
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(projectId)
    .setKey(config.appwriteApiKey as string);
  const databases = new Databases(client);

  try {
    const updatedDoc: any = await databases.updateDocument(
      "discord_bot",
      "servers",
      guild_id,
      { admin_user_ids: [...existing.admin_user_ids, userId] },
    );

    return {
      $id: updatedDoc.$id,
      guild_id: updatedDoc.guild_id,
      name: updatedDoc.name,
      icon: updatedDoc.icon,
      owner_id: updatedDoc.owner_id,
      joined: true,
    };
  } catch (err: any) {
    console.error("[Join Server API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to join server.",
    });
  }
});
