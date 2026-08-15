/**
 * PollRepository — sent poll instances. Vote tallies are never stored here;
 * this only tracks a poll's existence/metadata (see schema.ts comment).
 */
import { and, eq, gt } from "drizzle-orm";
import { requireReturningRow } from "../client";
import type { Database } from "../client";
import { polls, type Poll, type NewPoll } from "../schema";

export class PollRepository {
  constructor(private db: Database) {}

  async create(data: NewPoll): Promise<Poll> {
    const [row] = await this.db.insert(polls).values(data).returning();
    return requireReturningRow(row, "Poll insert");
  }

  async listActiveByGuild(
    guildId: string,
    now: Date = new Date(),
  ): Promise<Poll[]> {
    return await this.db
      .select()
      .from(polls)
      .where(
        and(
          eq(polls.guildId, guildId),
          eq(polls.finalized, false),
          gt(polls.expiresAt, now),
        ),
      )
      .orderBy(polls.expiresAt);
  }

  async finalizeByMessageId(messageId: string): Promise<void> {
    await this.db
      .update(polls)
      .set({ finalized: true })
      .where(eq(polls.messageId, messageId));
  }
}
