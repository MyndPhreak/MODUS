import { Client, Databases } from "node-appwrite";

/**
 * POST /api/servers/add
 *
 * Creates a new server document in Appwrite.
 * Uses the admin API key so we don't need broad client write permissions.
 * Sets the calling user as owner and initial admin.
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
  const { guild_id, name, icon } = body || {};

  if (!guild_id || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, name.",
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
    const doc = await databases.createDocument(
      DATABASE_ID,
      COLLECTION_ID,
      guild_id,
      {
        guild_id,
        name,
        status: false,
        owner_id: userId,
        admin_user_ids: [userId],
        last_checked: new Date().toISOString(),
        icon: icon || null,
      },
    );

    return {
      $id: doc.$id,
      guild_id: doc.guild_id,
      name: doc.name,
      icon: doc.icon,
      owner_id: doc.owner_id,
    };
  } catch (err: any) {
    // Duplicate key — server already exists
    if (err.code === 409) {
      throw createError({
        statusCode: 409,
        statusMessage: "This server is already registered.",
      });
    }
    console.error("[Add Server API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: err.message || "Failed to add server.",
    });
  }
});
