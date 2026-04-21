/**
 * Create a tag.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true; otherwise writes to
 * Appwrite. 409 on duplicate (guild_id, name) is preserved across both
 * paths — Postgres surfaces a unique-constraint violation which we map
 * to a 409 to keep the dashboard's error handling unchanged.
 *
 * POST body:
 *   - guild_id: string
 *   - name: string
 *   - content?: string
 *   - embed_data?: object (will be JSON-stringified for Appwrite)
 *   - allowed_roles?: string[]
 *   - created_by?: string
 */
import { Client, Databases, ID, Query } from "node-appwrite";
import { getRepos } from "../../utils/db";

function slugify(name: string): string {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

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

  const slug = slugify(name);
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: "Invalid tag name." });
  }
  if (!content && !embed_data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Tag must have either content or embed_data.",
    });
  }

  const embedDataSerialized =
    embed_data === undefined
      ? undefined
      : typeof embed_data === "string"
        ? embed_data.slice(0, 16384)
        : JSON.stringify(embed_data).slice(0, 16384);

  const allowedRolesSerialized =
    allowed_roles === undefined
      ? undefined
      : Array.isArray(allowed_roles)
        ? JSON.stringify(allowed_roles)
        : String(allowed_roles).slice(0, 2048);

  const repos = getRepos();
  if (repos) {
    // Pre-check duplicates so the error message matches the Appwrite path
    // instead of surfacing Postgres's constraint violation text.
    const existing = await repos.tags.getByName(guild_id, slug);
    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: `Tag "${slug}" already exists.`,
      });
    }
    try {
      const id = await repos.tags.create({
        guild_id,
        name: slug,
        content: content ? String(content).slice(0, 4096) : undefined,
        embed_data: embedDataSerialized,
        allowed_roles: allowedRolesSerialized,
        created_by: created_by ? String(created_by).slice(0, 64) : undefined,
      });
      const tag = await repos.tags.getByName(guild_id, slug);
      return { success: true, tag: tag ?? { $id: id } };
    } catch (error: any) {
      if (error?.code === "23505") {
        throw createError({
          statusCode: 409,
          statusMessage: `Tag "${slug}" already exists.`,
        });
      }
      console.error("[Tags API] Postgres create failed:", error?.message || error);
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to create tag.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

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
  }

  try {
    const data: Record<string, any> = {
      guild_id,
      name: slug,
      updated_at: new Date().toISOString(),
    };
    if (content) data.content = String(content).slice(0, 4096);
    if (embedDataSerialized !== undefined) data.embed_data = embedDataSerialized;
    if (allowedRolesSerialized !== undefined)
      data.allowed_roles = allowedRolesSerialized;
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
