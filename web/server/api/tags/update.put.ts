/**
 * Server-side endpoint to update a tag.
 *
 * PUT body:
 *   - tag_id: string (document ID)
 *   - guild_id: string
 *   - name?: string
 *   - content?: string
 *   - embed_data?: object | string
 *   - allowed_roles?: string[]
 */
import { Client, Databases } from "node-appwrite";

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

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const data: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      data.name = String(body.name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 128);
    }
    if (body.content !== undefined) {
      data.content = body.content ? String(body.content).slice(0, 4096) : "";
    }
    if (body.embed_data !== undefined) {
      if (body.embed_data === null || body.embed_data === "") {
        data.embed_data = "";
      } else {
        data.embed_data =
          typeof body.embed_data === "string"
            ? body.embed_data.slice(0, 16384)
            : JSON.stringify(body.embed_data).slice(0, 16384);
      }
    }
    if (body.allowed_roles !== undefined) {
      data.allowed_roles = Array.isArray(body.allowed_roles)
        ? JSON.stringify(body.allowed_roles)
        : String(body.allowed_roles || "").slice(0, 2048);
    }

    const doc = await databases.updateDocument(
      "discord_bot",
      "tags",
      tag_id,
      data,
    );

    return { success: true, tag: doc };
  } catch (error: any) {
    console.error(`[Tags API] Error updating tag:`, error?.message || error);
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to update tag.",
    });
  }
});
