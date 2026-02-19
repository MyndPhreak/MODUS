/**
 * Server-side endpoint to list recordings for a guild.
 * Uses the Appwrite API key (server-side only) to bypass document-level
 * permissions, since recordings are created by the bot with no client permissions.
 *
 * Query params:
 *   - guild_id: The Discord guild ID to filter by (required)
 */
import { Client, Databases, Query } from "node-appwrite";

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
