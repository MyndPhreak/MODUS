import { Client, Databases } from "node-appwrite";

/**
 * PATCH /api/servers/dashboard-roles
 *
 * Updates the dashboard_role_ids for a server. Only the server owner
 * or an existing admin can change this setting.
 *
 * Body:
 *   - guild_id: The Discord guild ID
 *   - dashboard_role_ids: Array of Discord role IDs to grant dashboard access
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
  const { guild_id, dashboard_role_ids } = body || {};

  if (!guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: guild_id.",
    });
  }

  if (!Array.isArray(dashboard_role_ids)) {
    throw createError({
      statusCode: 400,
      statusMessage: "dashboard_role_ids must be an array.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(projectId)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);
  const DATABASE_ID = "discord_bot";
  const COLLECTION_ID = "servers";

  try {
    // Verify the user is owner or admin of this server
    const serverDoc = await databases.getDocument(
      DATABASE_ID,
      COLLECTION_ID,
      guild_id,
    );

    const isOwner = serverDoc.owner_id === userId;
    const isAdmin =
      Array.isArray(serverDoc.admin_user_ids) &&
      serverDoc.admin_user_ids.includes(userId);

    if (!isOwner && !isAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage:
          "Only the server owner or an admin can update dashboard roles.",
      });
    }

    const updatedDoc = await databases.updateDocument(
      DATABASE_ID,
      COLLECTION_ID,
      guild_id,
      { dashboard_role_ids },
    );

    return {
      $id: updatedDoc.$id,
      dashboard_role_ids: updatedDoc.dashboard_role_ids || [],
    };
  } catch (err: any) {
    if (err.statusCode) throw err; // Re-throw our own errors
    console.error("[Dashboard Roles API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update dashboard roles.",
    });
  }
});
