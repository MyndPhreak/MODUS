import { Client, Databases, Query } from "node-appwrite";

/**
 * GET /api/servers/by-guild-ids?ids=123,456,789
 *
 * Returns server documents that match the given guild IDs.
 * Used by the Discover page to check which of the user's Discord
 * guilds are already registered in the system — without exposing
 * the full servers collection to the client SDK.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // ── Auth guard ─────────────────────────────────────────────────────────
  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  if (!sessionSecret) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: No session found.",
    });
  }

  const query = getQuery(event);
  const idsParam = (query.ids as string) || "";
  const guildIds = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (guildIds.length === 0) {
    return [];
  }

  // ── Query with admin key ───────────────────────────────────────────────
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

    // Only return the fields the client needs (don't leak admin_user_ids etc.)
    return allDocs.map((doc: any) => ({
      $id: doc.$id,
      guild_id: doc.guild_id,
      name: doc.name,
      icon: doc.icon,
      owner_id: doc.owner_id,
    }));
  } catch (err: any) {
    console.error("[By Guild IDs API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to check servers.",
    });
  }
});
