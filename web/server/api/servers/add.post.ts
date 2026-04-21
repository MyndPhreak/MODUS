/**
 * POST /api/servers/add
 *
 * Registers a new server with the calling user as owner + initial admin.
 * Returns 409 on duplicate.
 */
import { Client, Databases } from "node-appwrite";
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

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
  if (repos) {
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
