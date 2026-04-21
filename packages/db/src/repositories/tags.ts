/**
 * TagRepository.
 *
 * `name` is stored lowercased so lookups are case-insensitive without an
 * expression index. `embed_data` moves from JSON-string to JSONB; the doc
 * shape keeps the string form for wire-compat.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { tags, type Tag } from "../schema";

export type TagDoc = Tag & {
  $id: string;
  guild_id: string;
  embed_data: string | null;
  allowed_roles: string;
  created_by: string | null;
};

function toDoc(row: Tag): TagDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    embed_data: row.embedData == null ? null : JSON.stringify(row.embedData),
    allowed_roles: JSON.stringify(row.allowedRoles ?? []),
    created_by: row.createdBy,
  };
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    if (value.length === 0) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export class TagRepository {
  constructor(private db: Database) {}

  async listByGuild(guildId: string): Promise<TagDoc[]> {
    const rows = await this.db
      .select()
      .from(tags)
      .where(eq(tags.guildId, guildId));
    return rows.map(toDoc);
  }

  async getByName(guildId: string, name: string): Promise<TagDoc | null> {
    const rows = await this.db
      .select()
      .from(tags)
      .where(and(eq(tags.guildId, guildId), eq(tags.name, name.toLowerCase())))
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async create(data: {
    guild_id: string;
    name: string;
    content?: string;
    embed_data?: string;
    allowed_roles?: string;
    created_by?: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(tags)
      .values({
        guildId: data.guild_id,
        name: data.name.toLowerCase(),
        content: data.content ?? null,
        embedData: parseJson(data.embed_data),
        allowedRoles: parseStringArray(data.allowed_roles),
        createdBy: data.created_by ?? null,
      })
      .returning({ id: tags.id });
    return row.id;
  }

  async update(tagId: string, data: Record<string, any>): Promise<void> {
    const patch: Partial<typeof tags.$inferInsert> = { updatedAt: new Date() };
    if (data.name !== undefined) patch.name = String(data.name).toLowerCase();
    if (data.content !== undefined) patch.content = data.content;
    if (data.embed_data !== undefined)
      patch.embedData = parseJson(data.embed_data);
    if (data.allowed_roles !== undefined)
      patch.allowedRoles = parseStringArray(data.allowed_roles);
    await this.db.update(tags).set(patch).where(eq(tags.id, tagId));
  }

  async delete(tagId: string): Promise<void> {
    await this.db.delete(tags).where(eq(tags.id, tagId));
  }

  async upsertMigrated(input: {
    id: string;
    guild_id: string;
    name: string;
    content: string | null;
    embed_data: string | null;
    allowed_roles: string | string[];
    created_by: string | null;
    updated_at?: string | null;
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(tags)
      .values({
        id: input.id,
        guildId: input.guild_id,
        name: input.name.toLowerCase(),
        content: input.content,
        embedData: parseJson(input.embed_data),
        allowedRoles: parseStringArray(input.allowed_roles),
        createdBy: input.created_by,
        updatedAt: input.updated_at ? new Date(input.updated_at) : new Date(),
        ...(input.createdAt
          ? {
              createdAt:
                input.createdAt instanceof Date
                  ? input.createdAt
                  : new Date(input.createdAt),
            }
          : {}),
      })
      .onConflictDoNothing({ target: tags.id });
  }
}
