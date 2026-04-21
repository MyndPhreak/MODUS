/**
 * Delete a tag.
 *
 * POST body:
 *   - tag_id: string
 *   - guild_id: string
 */
import { Client, Databases } from "node-appwrite";
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const { tag_id, guild_id } = body || {};

  if (!tag_id || !guild_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: tag_id, guild_id.",
    });
  }

  const repos = getRepos();
  if (repos) {
    try {
      await repos.tags.delete(tag_id);
      return { success: true };
    } catch (error: any) {
      console.error("[Tags API] Postgres delete failed:", error?.message || error);
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to delete tag.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    await databases.deleteDocument("discord_bot", "tags", tag_id);
    return { success: true };
  } catch (error: any) {
    console.error(`[Tags API] Error deleting tag:`, error?.message || error);
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to delete tag.",
    });
  }
});
