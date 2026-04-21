/**
 * ServerRepository — guild metadata + premium flag + admin/dashboard ACLs.
 *
 * `updateServerStatus` keys on the document id (caller passes it); the
 * premium helpers key on `guild_id` because the ID isn't always known.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { servers, type Server } from "../schema";

export type ServerDoc = Server & {
  $id: string;
  guild_id: string;
  member_count: number | null;
  shard_id: number | null;
  last_checked: string | null;
  is_public: boolean;
  invite_link: string | null;
  owner_id: string | null;
  admin_user_ids: string[];
  dashboard_role_ids: string[];
};

function toDoc(row: Server): ServerDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    member_count: row.memberCount,
    shard_id: row.shardId,
    last_checked: row.lastChecked ? row.lastChecked.toISOString() : null,
    is_public: row.isPublic,
    invite_link: row.inviteLink,
    owner_id: row.ownerId,
    admin_user_ids: row.adminUserIds ?? [],
    dashboard_role_ids: row.dashboardRoleIds ?? [],
  };
}

export class ServerRepository {
  constructor(private db: Database) {}

  async listAll(): Promise<ServerDoc[]> {
    const rows = await this.db.select().from(servers);
    return rows.map(toDoc);
  }

  async getByGuildId(guildId: string): Promise<ServerDoc | null> {
    const rows = await this.db
      .select()
      .from(servers)
      .where(eq(servers.guildId, guildId))
      .limit(1);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async updateStatus(
    serverId: string,
    guildId: string,
    status: boolean,
    memberCount: number,
    icon: string | null,
    name: string,
    shardId: number,
  ): Promise<void> {
    // Upsert by id so a fresh guild can be tracked without a prior row.
    await this.db
      .insert(servers)
      .values({
        id: serverId,
        guildId,
        name,
        icon,
        memberCount,
        status,
        shardId,
        lastChecked: new Date(),
      })
      .onConflictDoUpdate({
        target: servers.id,
        set: {
          guildId,
          status,
          memberCount,
          icon,
          name,
          shardId,
          lastChecked: new Date(),
        },
      });
  }

  async isPremium(guildId: string): Promise<boolean> {
    const row = await this.getByGuildId(guildId);
    return row?.premium === true;
  }

  async setPremium(guildId: string, premium: boolean): Promise<void> {
    await this.db
      .update(servers)
      .set({ premium })
      .where(eq(servers.guildId, guildId));
  }

  async upsertMigrated(input: {
    id: string;
    guild_id: string;
    name: string;
    icon?: string | null;
    owner_id?: string | null;
    member_count?: number | null;
    status?: boolean;
    ping?: number | null;
    shard_id?: number | null;
    last_checked?: string | null;
    is_public?: boolean;
    description?: string | null;
    invite_link?: string | null;
    premium?: boolean;
    admin_user_ids?: string[];
    dashboard_role_ids?: string[];
    createdAt?: string | Date;
  }): Promise<void> {
    await this.db
      .insert(servers)
      .values({
        id: input.id,
        guildId: input.guild_id,
        name: input.name,
        icon: input.icon ?? null,
        ownerId: input.owner_id ?? null,
        memberCount: input.member_count ?? null,
        status: input.status ?? false,
        ping: input.ping ?? null,
        shardId: input.shard_id ?? null,
        lastChecked: input.last_checked ? new Date(input.last_checked) : null,
        isPublic: input.is_public ?? false,
        description: input.description ?? null,
        inviteLink: input.invite_link ?? null,
        premium: input.premium ?? false,
        adminUserIds: input.admin_user_ids ?? [],
        dashboardRoleIds: input.dashboard_role_ids ?? [],
        ...(input.createdAt
          ? {
              createdAt:
                input.createdAt instanceof Date
                  ? input.createdAt
                  : new Date(input.createdAt),
            }
          : {}),
      })
      .onConflictDoNothing({ target: servers.id });
  }
}
