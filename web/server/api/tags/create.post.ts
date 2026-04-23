/**
 * Create a tag. 409 on duplicate (guild_id, name).
 *
 * POST body:
 *   - guild_id, name, content?, embed_data?, allowed_roles?, created_by?
 */
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
  const body = await readBody(event);

  const {
    guild_id,
    name,
    content,
    embed_data,
    allowed_roles,
    created_by,
    is_template,
    description,
  } = body || {};

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
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  // Pre-check duplicates so the error message is friendly instead of a raw
  // Postgres unique-constraint violation.
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
      is_template: Boolean(is_template),
      description:
        description === undefined
          ? undefined
          : description
            ? String(description).slice(0, 500)
            : "",
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
});
