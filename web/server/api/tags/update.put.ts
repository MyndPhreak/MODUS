/**
 * Update a tag.
 *
 * PUT body:
 *   - tag_id, guild_id, name?, content?, embed_data?, allowed_roles?
 */
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
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
  if (body.is_template !== undefined) {
    normalized.is_template = Boolean(body.is_template);
  }
  if (body.description !== undefined) {
    normalized.description = body.description
      ? String(body.description).slice(0, 500)
      : "";
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

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
});
