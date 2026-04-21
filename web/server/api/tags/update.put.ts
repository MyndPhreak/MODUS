/**
 * Update a tag.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES=true; otherwise updates the
 * Appwrite document. Body payload is identical across both backends —
 * the repository's `update` handles lowercasing the name and parsing
 * the JSON-shaped inputs.
 *
 * PUT body:
 *   - tag_id: string
 *   - guild_id: string
 *   - name?: string
 *   - content?: string
 *   - embed_data?: object | string
 *   - allowed_roles?: string[]
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

  const normalized: Record<string, any> = { guild_id };
  if (body.name !== undefined) {
    normalized.name = String(body.name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 128);
  }
  if (body.content !== undefined) {
    normalized.content = body.content ? String(body.content).slice(0, 4096) : "";
  }
  if (body.embed_data !== undefined) {
    if (body.embed_data === null || body.embed_data === "") {
      normalized.embed_data = "";
    } else {
      normalized.embed_data =
        typeof body.embed_data === "string"
          ? body.embed_data.slice(0, 16384)
          : JSON.stringify(body.embed_data).slice(0, 16384);
    }
  }
  if (body.allowed_roles !== undefined) {
    normalized.allowed_roles = Array.isArray(body.allowed_roles)
      ? JSON.stringify(body.allowed_roles)
      : String(body.allowed_roles || "").slice(0, 2048);
  }

  const repos = getRepos();
  if (repos) {
    try {
      await repos.tags.update(tag_id, normalized);
      return { success: true };
    } catch (error: any) {
      console.error("[Tags API] Postgres update failed:", error?.message || error);
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to update tag.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const data: Record<string, any> = { updated_at: new Date().toISOString() };
    if (normalized.name !== undefined) data.name = normalized.name;
    if (normalized.content !== undefined) data.content = normalized.content;
    if (normalized.embed_data !== undefined)
      data.embed_data = normalized.embed_data;
    if (normalized.allowed_roles !== undefined)
      data.allowed_roles = normalized.allowed_roles;

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
