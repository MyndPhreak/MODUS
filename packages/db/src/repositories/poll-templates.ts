/**
 * PollTemplateRepository — reusable, on-demand poll presets.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import {
  pollTemplates,
  type PollTemplate,
  type NewPollTemplate,
} from "../schema";

export class PollTemplateRepository {
  constructor(private db: Database) {}

  async create(data: NewPollTemplate): Promise<PollTemplate> {
    const [row] = await this.db.insert(pollTemplates).values(data).returning();
    return row;
  }

  async listByGuild(guildId: string): Promise<PollTemplate[]> {
    return await this.db
      .select()
      .from(pollTemplates)
      .where(eq(pollTemplates.guildId, guildId))
      .orderBy(pollTemplates.createdAt);
  }

  async getById(id: string): Promise<PollTemplate | null> {
    const [row] = await this.db
      .select()
      .from(pollTemplates)
      .where(eq(pollTemplates.id, id))
      .limit(1);
    return row ?? null;
  }

  async update(
    id: string,
    patch: Partial<NewPollTemplate>,
  ): Promise<PollTemplate | null> {
    const [updated] = await this.db
      .update(pollTemplates)
      .set(patch)
      .where(eq(pollTemplates.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(pollTemplates)
      .where(eq(pollTemplates.id, id))
      .returning({ id: pollTemplates.id });
    return !!deleted;
  }
}
