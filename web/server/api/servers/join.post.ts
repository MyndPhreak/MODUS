import { Client, Databases } from "node-appwrite";

/**
 * POST /api/servers/join
 *
 * Allows a Discord admin to join an existing server's admin list.
 * Validates that:
 *   1. The server already exists in the system.
 *   2. The user has ADMINISTRATOR permission on the Discord guild.
 *   3. The user isn't already in admin_user_ids.
 *
 * Uses the admin API key so Appwrite collection-level permissions
 * don't interfere — access is gated by Discord permission validation.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // ── Auth guard ─────────────────────────────────────────────────────────
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
  // Fetch the user's guilds from our server-side proxy (which uses the
  // stored provider access token) and confirm they have admin perms.
  const ADMIN_PERMISSION = BigInt(0x8);

  let hasAdminPerm = false;
  try {
    // Use the internal Discord guilds endpoint which reads the user's
    // OAuth token from cookies / Appwrite identity
    const guildsResponse = await $fetch("/api/discord/guilds", {
      headers: {
        cookie: event.headers.get("cookie") || "",
      },
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

  if (!hasAdminPerm) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "You do not have Administrator permission on this Discord server.",
    });
  }

  // ── Update the server document ────────────────────────────────────────
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(projectId)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);
  const DATABASE_ID = "discord_bot";
  const COLLECTION_ID = "servers";

  try {
    // Fetch the existing server document
    const serverDoc = await databases.getDocument(
      DATABASE_ID,
      COLLECTION_ID,
      guild_id,
    );

    // Check if user is already an admin
    const existingAdmins: string[] = Array.isArray(serverDoc.admin_user_ids)
      ? serverDoc.admin_user_ids
      : [];

    if (existingAdmins.includes(userId)) {
      // Already an admin — return success without modifying
      return {
        $id: serverDoc.$id,
        guild_id: serverDoc.guild_id,
        name: serverDoc.name,
        icon: serverDoc.icon,
        owner_id: serverDoc.owner_id,
        already_member: true,
      };
    }

    // Append the user to admin_user_ids
    const updatedAdmins = [...existingAdmins, userId];
    const updatedDoc = await databases.updateDocument(
      DATABASE_ID,
      COLLECTION_ID,
      guild_id,
      { admin_user_ids: updatedAdmins },
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
    if (err.code === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: "Server not found. It may not be registered yet.",
      });
    }
    console.error("[Join Server API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to join server.",
    });
  }
});
