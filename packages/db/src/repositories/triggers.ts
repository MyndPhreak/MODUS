/**
 * TriggerRepository — webhook-triggered actions.
 *
 * `embed_template` and `filters` move from 4 KB / 2 KB JSON strings to JSONB.
 * Doc shape preserves strings for existing callers.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { triggers, type TriggerRow } from "../schema";

export type TriggerDoc = TriggerRow & {
  $id: string;
  guild_id: string;
  channel_id: string;
  embed_template: string | null;
  filters: string | null;
  created_by: string | null;
};

function toDoc(row: TriggerRow): TriggerDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    channel_id: row.channelId,
    embed_template:
      row.embedTemplate == null ? null : JSON.stringify(row.embedTemplate),
    filters: row.filters == null ? null : JSON.stringify(row.filters),
    created_by: row.createdBy,
  };
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

export class TriggerRepository {
  constructor(private db: Database) {}

  async create(data: {
    guild_id: string;
    name: string;
    secret: string;
    provider: "webhook" | "github" | "twitch";
    channel_id: string;
    embed_template?: string;
    filters?: string;
    created_by?: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(triggers)
      .values({
        guildId: data.guild_id,
        name: data.name,
        secret: data.secret,
        provider: data.provider,
        channelId: data.channel_id,
        embedTemplate: parseJson(data.embed_template),
        filters: parseJson(data.filters),
        createdBy: data.created_by ?? null,
        enabled: true,
      })
      .returning({ id: triggers.id });
    return row.id;
  }

  async listByGuild(guildId: string): Promise<TriggerDoc[]> {
    const rows = await this.db
      .select()
      .from(triggers)
      .where(eq(triggers.guildId, guildId));
    return rows.map(toDoc);
  }

  async getBySecret(secret: string): Promise<TriggerDoc | null> {
    const rows = await this.db
      .select()
      .from(triggers)
      .where(eq(triggers.secret, secret))
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async delete(triggerId: string): Promise<void> {
    await this.db.delete(triggers).where(eq(triggers.id, triggerId));
  }

  async update(triggerId: string, data: Record<string, any>): Promise<void> {
    const patch: Partial<typeof triggers.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.secret !== undefined) patch.secret = data.secret;
    if (data.provider !== undefined) patch.provider = data.provider;
    if (data.channel_id !== undefined) patch.channelId = data.channel_id;
    if (data.embed_template !== undefined)
      patch.embedTemplate = parseJson(data.embed_template);
    if (data.filters !== undefined) patch.filters = parseJson(data.filters);
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (Object.keys(patch).length === 0) return;
    await this.db.update(triggers).set(patch).where(eq(triggers.id, triggerId));
  }

  async upsertMigrated(input: {
    id: string;
    guild_id: string;
    name: string;
    secret: string;
    provider: string;
    channel_id: string;
    embed_template: string | null;
    filters: string | null;
    created_by: string | null;
    enabled: boolean;
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(triggers)
      .values({
        id: input.id,
        guildId: input.guild_id,
        name: input.name,
        secret: input.secret,
        provider: input.provider,
        channelId: input.channel_id,
        embedTemplate: parseJson(input.embed_template),
        filters: parseJson(input.filters),
        createdBy: input.created_by,
        enabled: input.enabled,
        ...(input.createdAt
          ? {
              createdAt:
                input.createdAt instanceof Date
                  ? input.createdAt
                  : new Date(input.createdAt),
            }
          : {}),
      })
      .onConflictDoNothing({ target: triggers.id });
  }
}
