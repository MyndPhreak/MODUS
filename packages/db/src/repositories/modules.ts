/**
 * ModuleRepository — static per-module registry.
 * `ensureRegistered` is the only write; mirrors AppwriteService's idempotent
 * upsert-on-name pattern.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { modules, type Module } from "../schema";

export type ModuleDoc = Module & {
  $id: string;
};

/** Structural executor type so audited mutations can pass a transaction. */
export type ModuleExecutor = Pick<Database, "select" | "insert" | "update">;

export interface ModuleRegistrationMeta {
  description: string;
  displayName?: string | null;
  category?: string | null;
  icon?: string | null;
  color?: string | null;
  tags?: string[];
}

function toDoc(row: Module): ModuleDoc {
  return { ...row, $id: row.id };
}

export class ModuleRepository {
  constructor(private db: ModuleExecutor) {}

  async listEnabled(): Promise<string[]> {
    const rows = await this.db
      .select({ name: modules.name })
      .from(modules)
      .where(eq(modules.enabled, true));
    return rows.map((r) => r.name);
  }

  async getByName(name: string): Promise<ModuleDoc | null> {
    const rows = await this.db
      .select()
      .from(modules)
      .where(eq(modules.name, name))
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async ensureRegistered(
    name: string,
    meta: ModuleRegistrationMeta,
  ): Promise<void> {
    const displayName = meta.displayName ?? null;
    const category = meta.category ?? null;
    const icon = meta.icon ?? null;
    const color = meta.color ?? null;
    const tags = meta.tags ?? [];

    await this.db
      .insert(modules)
      .values({
        name,
        description: meta.description,
        displayName,
        category,
        icon,
        color,
        tags,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: modules.name,
        // Deliberately excludes `enabled` — that's the admin-controlled
        // runtime kill switch (see admin/modules.vue), not code-driven.
        set: {
          description: meta.description,
          displayName,
          category,
          icon,
          color,
          tags,
        },
      });
  }

  /** Toggle a module's global enabled flag. Used by admin/modules.vue. */
  async setEnabled(name: string, enabled: boolean): Promise<void> {
    await this.db
      .update(modules)
      .set({ enabled })
      .where(eq(modules.name, name));
  }

  async listAll(): Promise<ModuleDoc[]> {
    const rows = await this.db.select().from(modules);
    return rows.map(toDoc);
  }

  async upsertMigrated(input: {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(modules)
      .values({
        id: input.id,
        name: input.name,
        description: input.description,
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
      .onConflictDoNothing({ target: modules.id });
  }
}
