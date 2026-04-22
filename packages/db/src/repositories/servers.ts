/**
 * ServerRepository — guild metadata + premium flag + admin/dashboard ACLs.
 *
 * `updateServerStatus` keys on the document id (caller passes it); the
 * premium helpers key on `guild_id` because the ID isn't always known.
 */
import { count, eq, inArray, or, sql } from "drizzle-orm";
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

  /** Total count of registered servers — used for the public stats page. */
  async countAll(): Promise<number> {
    const [row] = await this.db.select({ c: count() }).from(servers);
    return row?.c ?? 0;
  }

  /**
   * Servers where the user is the owner or appears in `admin_user_ids`.
   * Backs GET /api/servers/my-servers.
   */
  async listOwnedOrAdminBy(userId: string): Promise<ServerDoc[]> {
    const rows = await this.db
      .select()
      .from(servers)
      .where(
        or(
          eq(servers.ownerId, userId),
          sql`${userId} = ANY(${servers.adminUserIds})`,
        ),
      )
      .limit(400);
    return rows.map(toDoc);
  }

  /**
   * Batch lookup by guild_id. Preserves the Appwrite-era response shape
   * used by the Discover page (trims to a small public projection).
   */
  async listByGuildIds(guildIds: string[]): Promise<ServerDoc[]> {
    if (guildIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(servers)
      .where(inArray(servers.guildId, guildIds));
    return rows.map(toDoc);
  }

  /**
   * Register a new server with the caller as owner + initial admin.
   * Throws a tagged error on duplicate guild_id so the endpoint can
   * return 409 without sniffing Postgres error codes.
   */
  async createForGuild(data: {
    guild_id: string;
    name: string;
    icon?: string | null;
    owner_id: string;
    admin_user_ids?: string[];
  }): Promise<ServerDoc> {
    // Pre-check keeps the happy path readable; the unique index is still
    // the source of truth if two creates race.
    const existing = await this.getByGuildId(data.guild_id);
    if (existing) {
      const err = new Error(
        `Server for guild ${data.guild_id} already exists.`,
      ) as Error & { code: "DUPLICATE_SERVER" };
      err.code = "DUPLICATE_SERVER";
      throw err;
    }

    try {
      const [row] = await this.db
        .insert(servers)
        .values({
          guildId: data.guild_id,
          name: data.name,
          icon: data.icon ?? null,
          ownerId: data.owner_id,
          adminUserIds: data.admin_user_ids ?? [data.owner_id],
          status: false,
          lastChecked: new Date(),
        })
        .returning();
      return toDoc(row);
    } catch (err: any) {
      // Unique index on guild_id — race between the pre-check and insert.
      if (err?.code === "23505") {
        const e = new Error(
          `Server for guild ${data.guild_id} already exists.`,
        ) as Error & { code: "DUPLICATE_SERVER" };
        e.code = "DUPLICATE_SERVER";
        throw e;
      }
      throw err;
    }
  }

  /**
   * Atomically append `userId` to `admin_user_ids` iff not already present.
   * Returns the updated row, or null when no server exists for the guild.
   */
  async addAdmin(
    guildId: string,
    userId: string,
  ): Promise<{ server: ServerDoc; wasAlreadyAdmin: boolean } | null> {
    const existing = await this.getByGuildId(guildId);
    if (!existing) return null;
    if (existing.admin_user_ids.includes(userId)) {
      return { server: existing, wasAlreadyAdmin: true };
    }
    const [row] = await this.db
      .update(servers)
      .set({
        adminUserIds: sql`array_append(${servers.adminUserIds}, ${userId})`,
      })
      .where(eq(servers.guildId, guildId))
      .returning();
    return { server: toDoc(row), wasAlreadyAdmin: false };
  }

  /**
   * Replace the dashboard_role_ids array on a server. Caller is
   * responsible for ACL validation.
   */
  async updateDashboardRoles(
    guildId: string,
    roleIds: string[],
  ): Promise<ServerDoc | null> {
    const [row] = await this.db
      .update(servers)
      .set({ dashboardRoleIds: roleIds })
      .where(eq(servers.guildId, guildId))
      .returning();
    return row ? toDoc(row) : null;
  }

  /** Delete a server row by guild_id. */
  async deleteByGuildId(guildId: string): Promise<void> {
    await this.db.delete(servers).where(eq(servers.guildId, guildId));
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
