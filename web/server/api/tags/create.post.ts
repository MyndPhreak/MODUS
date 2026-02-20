/**
 * Server-side endpoint to create a tag.
 *
 * POST body:
 *   - guild_id: string
 *   - name: string
 *   - content?: string
 *   - embed_data?: object (will be JSON-stringified)
 *   - allowed_roles?: string[] (will be JSON-stringified)
 *   - created_by?: string
 */
import { Client, Databases, ID, Query } from "node-appwrite";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const { guild_id, name, content, embed_data, allowed_roles, created_by } =
    body || {};

  if (!guild_id || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, name.",
    });
  }

  const slug = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid tag name.",
    });
  }

  if (!content && !embed_data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Tag must have either content or embed_data.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  // Check for duplicates
  try {
    const existing = await databases.listDocuments("discord_bot", "tags", [
      Query.equal("guild_id", guild_id),
      Query.equal("name", slug),
      Query.limit(1),
    ]);
    if (existing.total > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `Tag "${slug}" already exists.`,
      });
    }
  } catch (error: any) {
    if (error.statusCode === 409) throw error;
    // Ignore other errors and proceed
  }

  try {
    const data: Record<string, any> = {
      guild_id,
      name: slug,
      updated_at: new Date().toISOString(),
    };

    if (content) data.content = String(content).slice(0, 4096);
    if (embed_data) {
      data.embed_data =
        typeof embed_data === "string"
          ? embed_data.slice(0, 16384)
          : JSON.stringify(embed_data).slice(0, 16384);
    }
    if (allowed_roles) {
      data.allowed_roles = Array.isArray(allowed_roles)
        ? JSON.stringify(allowed_roles)
        : String(allowed_roles).slice(0, 2048);
    }
    if (created_by) data.created_by = String(created_by).slice(0, 64);

    const doc = await databases.createDocument(
      "discord_bot",
      "tags",
      ID.unique(),
      data,
    );

    return { success: true, tag: doc };
  } catch (error: any) {
    console.error(`[Tags API] Error creating tag:`, error?.message || error);
    throw createError({
      statusCode: error?.statusCode || error?.code || 500,
      statusMessage: error?.message || "Failed to create tag.",
    });
  }
});
