/**
 * Server-side endpoint to update a trigger.
 *
 * Body (JSON):
 *   - trigger_id: string (required — Appwrite document $id)
 *   - data: object with fields to update (enabled, embed_template, filters, etc.)
 */
import { Client, Databases } from "node-appwrite";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  if (!body.trigger_id || !body.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: trigger_id, data.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const doc = await databases.updateDocument(
      "discord_bot",
      "triggers",
      body.trigger_id,
      body.data,
    );
    return { success: true, document: doc };
  } catch (error: any) {
    console.error(
      "[Triggers API] Error updating trigger:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to update trigger.",
    });
  }
});
