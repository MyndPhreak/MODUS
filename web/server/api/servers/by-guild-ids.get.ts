/**
 * GET /api/servers/by-guild-ids?ids=123,456,789
 *
 * Returns server documents that match the given guild IDs. Used by the
 * Discover page to check which of the user's Discord guilds are already
 * registered.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true.
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  await requireAuthedUserId(event);

  const query = getQuery(event);
  const idsParam = (query.ids as string) || "";
  const guildIds = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (guildIds.length === 0) {
    return [];
  }

  const repos = getRepos();
  if (repos) {
    try {
      const rows = await repos.servers.listByGuildIds(guildIds);
      return rows.map((doc) => ({
        $id: doc.$id,
        guild_id: doc.guild_id,
        name: doc.name,
        icon: doc.icon,
        owner_id: doc.owner_id,
        admin_user_ids: doc.admin_user_ids,
        dashboard_role_ids: doc.dashboard_role_ids,
      }));
    } catch (error: any) {
      console.error(
        "[By Guild IDs API] Postgres error:",
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to check servers.",
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
    const MAX_CHUNK = 100;
    let allDocs: any[] = [];

    for (let i = 0; i < guildIds.length; i += MAX_CHUNK) {
      const chunk = guildIds.slice(i, i + MAX_CHUNK);
      const result = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal("guild_id", chunk),
        Query.limit(MAX_CHUNK),
      ]);
      allDocs = allDocs.concat(result.documents);
    }

    return allDocs.map((doc: any) => ({
      $id: doc.$id,
      guild_id: doc.guild_id,
      name: doc.name,
      icon: doc.icon,
      owner_id: doc.owner_id,
      admin_user_ids: doc.admin_user_ids || [],
      dashboard_role_ids: doc.dashboard_role_ids || [],
    }));
  } catch (err: any) {
    console.error("[By Guild IDs API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to check servers.",
    });
  }
});
