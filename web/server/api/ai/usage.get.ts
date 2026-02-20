/**
 * Server-side endpoint to list AI usage logs for a guild.
 * Uses the Appwrite API key (server-side only) to bypass client permissions,
 * since ai_usage_log is written by the bot with no user-level read access.
 *
 * Query params:
 *   - guild_id: The Discord guild ID to scope results to (required)
 *   - limit: Max number of results to return (optional, default 100)
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

  const limit = Math.min(Number(query.limit) || 100, 250);

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const response = await databases.listDocuments(
      "discord_bot",
      "ai_usage_log",
      [
        Query.equal("guildId", guildId),
        Query.orderDesc("timestamp"),
        Query.limit(limit),
      ],
    );
    return { documents: response.documents, total: response.total };
  } catch (error: any) {
    console.error(
      `[AI Usage API] Error fetching usage for guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to fetch AI usage logs.",
    });
  }
});
