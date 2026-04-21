/**
 * List recordings for a guild.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES_RECORDINGS=true, otherwise reads
 * from Appwrite. The returned shape is identical either way (snake_case +
 * `$id` fields) so the dashboard doesn't branch on backend.
 *
 * Query params:
 *   - guild_id: The Discord guild ID to filter by (required)
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRecordingRepo } from "../../utils/db";

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

  const repo = getRecordingRepo();
  if (repo) {
    try {
      return await repo.listByGuild(guildId, 100);
    } catch (error: any) {
      console.error(
        `[Recordings API] Postgres list failed for guild ${guildId}:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch recordings.",
      });
    }
  }

  // Appwrite fallback.
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const response = await databases.listDocuments(
      "discord_bot",
      "recordings",
      [
        Query.equal("guild_id", guildId),
        Query.orderDesc("started_at"),
        Query.limit(100),
      ],
    );
    return response.documents;
  } catch (error: any) {
    console.error(
      `[Recordings API] Error listing recordings for guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to fetch recordings.",
    });
  }
});
