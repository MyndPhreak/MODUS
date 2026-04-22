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

function toDoc(row: Module): ModuleDoc {
  return { ...row, $id: row.id };
}

export class ModuleRepository {
  constructor(private db: Database) {}

  async listEnabled(): Promise<string[]> {
    const rows = await this.db
      .select({ name: modules.name })
      .from(modules)
      .where(eq(modules.enabled, true));
    return rows.map((r) => r.name);
  }

  async ensureRegistered(name: string, description: string): Promise<void> {
    await this.db
      .insert(modules)
      .values({ name, description, enabled: true })
      .onConflictDoNothing({ target: modules.name });
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
