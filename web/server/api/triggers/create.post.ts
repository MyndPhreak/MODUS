/**
 * Server-side endpoint to create a trigger.
 *
 * Body (JSON):
 *   - guild_id: string (required)
 *   - name: string (required)
 *   - secret: string (required — UUID v4 generated client-side)
 *   - provider: "webhook" | "github" | "twitch" (required)
 *   - channel_id: string (required)
 *   - embed_template?: string
 *   - filters?: string
 *   - created_by?: string
 */
import { Client, Databases, ID } from "node-appwrite";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  if (
    !body.guild_id ||
    !body.name ||
    !body.secret ||
    !body.provider ||
    !body.channel_id
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Missing required fields: guild_id, name, secret, provider, channel_id.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const doc = await databases.createDocument(
      "discord_bot",
      "triggers",
      ID.unique(),
      {
        guild_id: body.guild_id,
        name: body.name,
        secret: body.secret,
        provider: body.provider,
        channel_id: body.channel_id,
        embed_template: body.embed_template || null,
        filters: body.filters || null,
        created_by: body.created_by || null,
        created_at: new Date().toISOString(),
        enabled: true,
      },
    );
    return { success: true, document: doc };
  } catch (error: any) {
    console.error(
      "[Triggers API] Error creating trigger:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to create trigger.",
    });
  }
});
