/**
 * Create a trigger.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true. The unique index on
 * triggers.secret is enforced by Postgres; duplicate-secret creates
 * surface as 409.
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
import { getRepos } from "../../utils/db";

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

  const input = {
    guild_id: body.guild_id,
    name: body.name,
    secret: body.secret,
    provider: body.provider,
    channel_id: body.channel_id,
    embed_template: body.embed_template || undefined,
    filters: body.filters || undefined,
    created_by: body.created_by || undefined,
  };

  const repos = getRepos();
  if (repos) {
    try {
      const id = await repos.triggers.create(input);
      return { success: true, document: { $id: id, ...input, enabled: true } };
    } catch (error: any) {
      if (error?.code === "23505") {
        throw createError({
          statusCode: 409,
          statusMessage: "A trigger with that secret or name already exists.",
        });
      }
      console.error(
        "[Triggers API] Postgres create failed:",
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to create trigger.",
      });
    }
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
        guild_id: input.guild_id,
        name: input.name,
        secret: input.secret,
        provider: input.provider,
        channel_id: input.channel_id,
        embed_template: input.embed_template ?? null,
        filters: input.filters ?? null,
        created_by: input.created_by ?? null,
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
