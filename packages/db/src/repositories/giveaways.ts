/**
 * GiveawayRepository / GiveawayEntryRepository — giveaway rows and their
 * entrant rows. See schema.ts's `giveaways` table comment for the id/status
 * lifecycle.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import { requireReturningRow } from "../client";
import type { Database } from "../client";
import {
  giveaways,
  giveawayEntries,
  type Giveaway,
  type NewGiveaway,
} from "../schema";

export class GiveawayRepository {
  constructor(private db: Database) {}

  async create(data: NewGiveaway): Promise<Giveaway> {
    const [row] = await this.db.insert(giveaways).values(data).returning();
    return requireReturningRow(row, "Giveaway insert");
  }

  async getById(id: string): Promise<Giveaway | null> {
    const [row] = await this.db
      .select()
      .from(giveaways)
      .where(eq(giveaways.id, id));
    return row ?? null;
  }

  async getByMessageId(messageId: string): Promise<Giveaway | null> {
    const [row] = await this.db
      .select()
      .from(giveaways)
      .where(eq(giveaways.messageId, messageId));
    return row ?? null;
  }

  async listByGuild(guildId: string): Promise<Giveaway[]> {
    return await this.db
      .select()
      .from(giveaways)
      .where(eq(giveaways.guildId, guildId))
      .orderBy(giveaways.createdAt);
  }

  /** Draw worker's sweep query: active giveaways whose endsAt has passed. */
  async listExpiredActive(now: Date = new Date(), limit = 25): Promise<Giveaway[]> {
    return await this.db
      .select()
      .from(giveaways)
      .where(and(eq(giveaways.status, "active"), lte(giveaways.endsAt, now)))
      .limit(limit);
  }

  async update(id: string, data: Partial<NewGiveaway>): Promise<void> {
    await this.db.update(giveaways).set(data).where(eq(giveaways.id, id));
  }

  async setEnded(id: string, winnerIds: string[]): Promise<void> {
    await this.db
      .update(giveaways)
      .set({ status: "ended", winnerIds })
      .where(eq(giveaways.id, id));
  }

  async setCancelled(id: string): Promise<void> {
    await this.db
      .update(giveaways)
      .set({ status: "cancelled" })
      .where(eq(giveaways.id, id));
  }
}

export class GiveawayEntryRepository {
  constructor(private db: Database) {}

  /** Upserts an entry. Returns added: false if the user already entered. */
  async addEntry(giveawayId: string, userId: string): Promise<{ added: boolean }> {
    const existing = await this.db
      .select({ id: giveawayEntries.id })
      .from(giveawayEntries)
      .where(
        and(
          eq(giveawayEntries.giveawayId, giveawayId),
          eq(giveawayEntries.userId, userId),
        ),
      );
    if (existing.length > 0) return { added: false };

    await this.db.insert(giveawayEntries).values({ giveawayId, userId });
    return { added: true };
  }

  async listEntrantIds(giveawayId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: giveawayEntries.userId })
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, giveawayId));
    return rows.map((r) => r.userId);
  }

  async countEntries(giveawayId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, giveawayId));
    return row?.count ?? 0;
  }
}
