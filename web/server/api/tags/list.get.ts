/**
 * List tags for a guild.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true; otherwise reads from
 * Appwrite. Response shape is stable across both: `{ documents, total }`.
 *
 * Query params:
 *   - guild_id: The Discord guild ID (required)
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  const repos = getRepos();
  if (repos) {
    try {
      const documents = await repos.tags.listByGuild(guildId);
      return { documents, total: documents.length };
    } catch (error: any) {
      console.error(
        `[Tags API] Postgres list failed for ${guildId}:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch tags.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const response = await databases.listDocuments("discord_bot", "tags", [
      Query.equal("guild_id", guildId),
      Query.limit(100),
    ]);
    return { documents: response.documents, total: response.total };
  } catch (error: any) {
    console.error(
      `[Tags API] Error fetching tags for guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to fetch tags.",
    });
  }
});
