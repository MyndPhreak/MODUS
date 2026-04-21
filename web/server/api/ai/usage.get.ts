/**
 * List AI usage logs for a guild.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true; otherwise reads from
 * Appwrite. The bot-side `logAIUsage` already writes to whichever
 * backend is active, so list results stay consistent.
 *
 * Query params:
 *   - guild_id: The Discord guild ID to scope results to (required)
 *   - limit: Max number of results to return (optional, default 100, cap 250)
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

  const limit = Math.min(Number(query.limit) || 100, 250);

  const repos = getRepos();
  if (repos) {
    try {
      const documents = await repos.aiUsage.listByGuild(guildId, limit);
      return { documents, total: documents.length };
    } catch (error: any) {
      console.error(
        `[AI Usage API] Postgres list failed for ${guildId}:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch AI usage logs.",
      });
    }
  }

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
