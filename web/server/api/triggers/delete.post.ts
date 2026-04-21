/**
 * Delete a trigger.
 *
 * Body (JSON):
 *   - trigger_id: string (required)
 */
import { Client, Databases } from "node-appwrite";
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  if (!body.trigger_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: trigger_id.",
    });
  }

  const repos = getRepos();
  if (repos) {
    try {
      await repos.triggers.delete(body.trigger_id);
      return { success: true };
    } catch (error: any) {
      console.error(
        "[Triggers API] Postgres delete failed:",
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to delete trigger.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    await databases.deleteDocument("discord_bot", "triggers", body.trigger_id);
    return { success: true };
  } catch (error: any) {
    console.error(
      "[Triggers API] Error deleting trigger:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to delete trigger.",
    });
  }
});
