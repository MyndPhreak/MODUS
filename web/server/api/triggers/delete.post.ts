/**
 * Server-side endpoint to delete a trigger.
 *
 * Body (JSON):
 *   - trigger_id: string (required — Appwrite document $id)
 */
import { Client, Databases } from "node-appwrite";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  if (!body.trigger_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required field: trigger_id.",
    });
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
