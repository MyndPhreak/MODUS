/**
 * GuildConfigRepository — per-(guild, module) settings + alerts state.
 *
 * Preserves the Appwrite document shape on reads (`$id`, `guildId`,
 * `moduleName`, `settings` as a JSON string) so existing call sites that
 * parse `JSON.parse(doc.settings)` keep working unchanged. Internally we
 * store JSONB for future query power.
 *
 * Two sentinel-key lookups kept from Appwrite:
 *   - (__global__, ai)          → global AI fallback config
 *   - (<guildId>, alerts_state) → per-guild alerts cursor state
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { guildConfigs, type GuildConfig } from "../schema";

export type GuildConfigDoc = GuildConfig & {
  $id: string;
  guildId: string;
  moduleName: string;
  /** Serialized JSON, for wire-compat with Appwrite callers. */
  settings: string;
};

function toDoc(row: GuildConfig): GuildConfigDoc {
  return {
    ...row,
    $id: row.id,
    guildId: row.guildId,
    moduleName: row.moduleName,
    settings: JSON.stringify(row.settings ?? {}),
  };
}

export class GuildConfigRepository {
  constructor(private db: Database) {}

  private async findOne(
    guildId: string,
    moduleName: string,
  ): Promise<GuildConfig | null> {
    const rows = await this.db
      .select()
      .from(guildConfigs)
      .where(
        and(
          eq(guildConfigs.guildId, guildId),
          eq(guildConfigs.moduleName, moduleName),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listByGuild(guildId: string): Promise<GuildConfigDoc[]> {
    const rows = await this.db
      .select()
      .from(guildConfigs)
      .where(eq(guildConfigs.guildId, guildId));
    return rows.map(toDoc);
  }

  /** Delete every guild_configs row for a guild. Used when un-registering. */
  async deleteAllForGuild(guildId: string): Promise<void> {
    await this.db
      .delete(guildConfigs)
      .where(eq(guildConfigs.guildId, guildId));
  }

  async isModuleEnabled(
    guildId: string,
    moduleName: string,
  ): Promise<boolean> {
    const row = await this.findOne(guildId, moduleName.toLowerCase());
    // Preserves the Appwrite default: absent row → enabled.
    return row ? row.enabled : true;
  }

  async setModuleStatus(
    guildId: string,
    moduleName: string,
    enabled: boolean,
  ): Promise<void> {
    const name = moduleName.toLowerCase();
    await this.db
      .insert(guildConfigs)
      .values({ guildId, moduleName: name, enabled, settings: {} })
      .onConflictDoUpdate({
        target: [guildConfigs.guildId, guildConfigs.moduleName],
        set: { enabled, updatedAt: new Date() },
      });
  }

  async getModuleSettings(
    guildId: string,
    moduleName: string,
  ): Promise<Record<string, any>> {
    const row = await this.findOne(guildId, moduleName.toLowerCase());
    return row ? ((row.settings as Record<string, any>) ?? {}) : {};
  }

  async setModuleSettings(
    guildId: string,
    moduleName: string,
    settings: Record<string, any>,
  ): Promise<void> {
    const name = moduleName.toLowerCase();
    await this.db
      .insert(guildConfigs)
      .values({ guildId, moduleName: name, enabled: true, settings })
      .onConflictDoUpdate({
        target: [guildConfigs.guildId, guildConfigs.moduleName],
        set: { settings, updatedAt: new Date() },
      });
  }

  async getGlobalAIConfig(): Promise<Record<string, any> | null> {
    const row = await this.findOne("__global__", "ai");
    return row ? ((row.settings as Record<string, any>) ?? null) : null;
  }

  async setGlobalAIConfig(config: Record<string, any>): Promise<void> {
    await this.setModuleSettings("__global__", "ai", config);
  }

  /**
   * Scan every guild_config with moduleName=alerts & enabled=true, returning
   * a flattened (guildId, alerts[]) list. Replaces the paginated Appwrite
   * query in `getAllAlertsConfigs`.
   */
  async getAllAlertsConfigs(): Promise<
    Array<{ guildId: string; alerts: any[] }>
  > {
    const rows = await this.db
      .select()
      .from(guildConfigs)
      .where(
        and(
          eq(guildConfigs.moduleName, "alerts"),
          eq(guildConfigs.enabled, true),
        ),
      );

    const results: Array<{ guildId: string; alerts: any[] }> = [];
    for (const row of rows) {
      const settings = (row.settings as Record<string, any>) ?? {};
      const alerts = Array.isArray(settings.alerts) ? settings.alerts : [];
      if (alerts.length > 0) {
        results.push({ guildId: row.guildId, alerts });
      }
    }
    return results;
  }

  async getAlertsState(
    guildId: string,
  ): Promise<Record<string, string>> {
    const row = await this.findOne(guildId, "alerts_state");
    return row ? ((row.settings as Record<string, string>) ?? {}) : {};
  }

  async setAlertsState(
    guildId: string,
    state: Record<string, string>,
  ): Promise<void> {
    await this.db
      .insert(guildConfigs)
      .values({
        guildId,
        moduleName: "alerts_state",
        enabled: true,
        settings: state,
      })
      .onConflictDoUpdate({
        target: [guildConfigs.guildId, guildConfigs.moduleName],
        set: { settings: state, updatedAt: new Date() },
      });
  }

  async upsertMigrated(
    input: {
      id: string;
      guildId: string;
      moduleName: string;
      enabled: boolean;
      settings: Record<string, any>;
      createdAt?: string | Date;
    },
  ): Promise<void> {
    await this.db
      .insert(guildConfigs)
      .values({
        id: input.id,
        guildId: input.guildId,
        moduleName: input.moduleName,
        enabled: input.enabled,
        settings: input.settings,
        ...(input.createdAt
          ? {
              createdAt:
                input.createdAt instanceof Date
                  ? input.createdAt
                  : new Date(input.createdAt),
            }
          : {}),
      })
      .onConflictDoNothing({ target: guildConfigs.id });
  }
}
