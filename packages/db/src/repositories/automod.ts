/**
 * AutomodRuleRepository.
 *
 * `conditions` / `actions` / `exempt_*` were JSON strings in Appwrite; they're
 * JSONB here. The docs returned expose stringified versions under the original
 * keys for wire-compat, but new code should read the parsed structure from
 * the respective `_parsed` fields.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { automodRules, type AutomodRule } from "../schema";

export type AutomodRuleDoc = AutomodRule & {
  $id: string;
  guild_id: string;
  // Appwrite-shape: callers expect strings.
  conditions: string;
  actions: string;
  exempt_roles: string;
  exempt_channels: string;
};

function toDoc(row: AutomodRule): AutomodRuleDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    conditions: JSON.stringify(row.conditions ?? {}),
    actions: JSON.stringify(row.actions ?? []),
    exempt_roles: JSON.stringify(row.exemptRoles ?? []),
    exempt_channels: JSON.stringify(row.exemptChannels ?? []),
  };
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonField<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

export class AutomodRuleRepository {
  constructor(private db: Database) {}

  async listByGuild(
    guildId: string,
    trigger?: string,
  ): Promise<AutomodRuleDoc[]> {
    const where = trigger
      ? and(eq(automodRules.guildId, guildId), eq(automodRules.trigger, trigger))
      : eq(automodRules.guildId, guildId);
    const rows = await this.db.select().from(automodRules).where(where);
    return rows.map(toDoc);
  }

  async getById(ruleId: string): Promise<AutomodRuleDoc | null> {
    const rows = await this.db
      .select()
      .from(automodRules)
      .where(eq(automodRules.id, ruleId))
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async listEnabledByTrigger(
    guildId: string,
    trigger: string,
  ): Promise<AutomodRuleDoc[]> {
    const rows = await this.db
      .select()
      .from(automodRules)
      .where(
        and(
          eq(automodRules.guildId, guildId),
          eq(automodRules.enabled, true),
          eq(automodRules.trigger, trigger),
        ),
      );
    return rows.map(toDoc);
  }

  async create(data: {
    guild_id: string;
    name: string;
    enabled: boolean;
    priority?: number;
    trigger: string;
    conditions: string;
    actions: string;
    exempt_roles?: string;
    exempt_channels?: string;
    cooldown?: number;
    created_by?: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(automodRules)
      .values({
        guildId: data.guild_id,
        name: data.name,
        enabled: data.enabled,
        priority: data.priority ?? 0,
        trigger: data.trigger,
        conditions: parseJsonField(data.conditions, {}),
        actions: parseJsonField(data.actions, []),
        exemptRoles: parseStringArray(data.exempt_roles),
        exemptChannels: parseStringArray(data.exempt_channels),
        cooldown: data.cooldown ?? null,
        createdBy: data.created_by ?? null,
      })
      .returning({ id: automodRules.id });
    return row.id;
  }

  async update(ruleId: string, data: Record<string, any>): Promise<void> {
    const patch: Partial<typeof automodRules.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.trigger !== undefined) patch.trigger = data.trigger;
    if (data.conditions !== undefined)
      patch.conditions = parseJsonField(data.conditions, {});
    if (data.actions !== undefined)
      patch.actions = parseJsonField(data.actions, []);
    if (data.exempt_roles !== undefined)
      patch.exemptRoles = parseStringArray(data.exempt_roles);
    if (data.exempt_channels !== undefined)
      patch.exemptChannels = parseStringArray(data.exempt_channels);
    if (data.cooldown !== undefined) patch.cooldown = data.cooldown;
    await this.db
      .update(automodRules)
      .set(patch)
      .where(eq(automodRules.id, ruleId));
  }

  async delete(ruleId: string): Promise<void> {
    await this.db.delete(automodRules).where(eq(automodRules.id, ruleId));
  }

  async upsertMigrated(input: {
    id: string;
    guild_id: string;
    name: string;
    enabled: boolean;
    priority: number;
    trigger: string;
    conditions: string | Record<string, any>;
    actions: string | any[];
    exempt_roles: string | string[];
    exempt_channels: string | string[];
    cooldown: number | null;
    created_by: string | null;
    updated_at?: string | null;
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(automodRules)
      .values({
        id: input.id,
        guildId: input.guild_id,
        name: input.name,
        enabled: input.enabled,
        priority: input.priority,
        trigger: input.trigger,
        conditions: parseJsonField(input.conditions, {}),
        actions: parseJsonField(input.actions, []),
        exemptRoles: parseStringArray(input.exempt_roles),
        exemptChannels: parseStringArray(input.exempt_channels),
        cooldown: input.cooldown,
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
      .onConflictDoNothing({ target: automodRules.id });
  }
}
