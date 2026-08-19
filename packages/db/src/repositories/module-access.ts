/**
 * ModuleAccessRepository — per-(guild, module) dashboard RBAC grants.
 *
 * Mirrors GuildConfigRepository's keying convention: one row per
 * (guildId, moduleName), upserted on write. A module with no row has no
 * non-admin role grant.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { moduleAccess } from "../schema";

export class ModuleAccessRepository {
  constructor(private db: Database) {}

  async getRoleIds(guildId: string, moduleName: string): Promise<string[]> {
    const rows = await this.db
      .select({ roleIds: moduleAccess.roleIds })
      .from(moduleAccess)
      .where(
        and(
          eq(moduleAccess.guildId, guildId),
          eq(moduleAccess.moduleName, moduleName.toLowerCase()),
        ),
      )
      .limit(1);
    return rows[0]?.roleIds ?? [];
  }

  async setRoleIds(
    guildId: string,
    moduleName: string,
    roleIds: string[],
  ): Promise<void> {
    const name = moduleName.toLowerCase();
    await this.db
      .insert(moduleAccess)
      .values({ guildId, moduleName: name, roleIds })
      .onConflictDoUpdate({
        target: [moduleAccess.guildId, moduleAccess.moduleName],
        set: { roleIds, updatedAt: new Date() },
      });
  }

  /**
   * Every module's role grant for a guild, keyed by module name. Modules
   * with no row (never configured) are simply absent from the result.
   */
  async getAllForGuild(guildId: string): Promise<Record<string, string[]>> {
    const rows = await this.db
      .select({
        moduleName: moduleAccess.moduleName,
        roleIds: moduleAccess.roleIds,
      })
      .from(moduleAccess)
      .where(eq(moduleAccess.guildId, guildId));
    const result: Record<string, string[]> = {};
    for (const row of rows) {
      result[row.moduleName] = row.roleIds;
    }
    return result;
  }
}
