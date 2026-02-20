/**
 * Server-side endpoint to list tags for a guild.
 * Uses the Appwrite API key (server-side only).
 *
 * Query params:
 *   - guild_id: The Discord guild ID (required)
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
