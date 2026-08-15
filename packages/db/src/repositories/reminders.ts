/**
 * RemindersRepository.
 *
 * Repository for managing user reminders in Postgres.
 */
import { and, eq, lte, desc } from "drizzle-orm";
import { requireReturningRow } from "../client";
import type { Database } from "../client";
import { reminders, type Reminder, type NewReminder } from "../schema";

export class RemindersRepository {
  constructor(private db: Database) {}

  async create(data: NewReminder): Promise<Reminder> {
    const [row] = await this.db
      .insert(reminders)
      .values(data)
      .returning();
    return requireReturningRow(row, "Reminder insert");
  }

  async findById(id: string): Promise<Reminder | null> {
    const [row] = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.id, id))
      .limit(1);
    return row ?? null;
  }

  async listByUser(userId: string, limit = 50): Promise<Reminder[]> {
    return await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.status, "pending"),
        ),
      )
      .orderBy(reminders.remindAt)
      .limit(limit);
  }

  async getDueReminders(
    now: Date = new Date(),
    limit = 100,
  ): Promise<Reminder[]> {
    return await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.status, "pending"),
          lte(reminders.remindAt, now),
        ),
      )
      .orderBy(reminders.remindAt)
      .limit(limit);
  }

  async markCompleted(id: string): Promise<void> {
    await this.db
      .update(reminders)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(reminders.id, id));
  }

  async update(
    id: string,
    patch: Partial<NewReminder>,
  ): Promise<Reminder | null> {
    const [updated] = await this.db
      .update(reminders)
      .set(patch)
      .where(eq(reminders.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(reminders)
      .where(eq(reminders.id, id))
      .returning({ id: reminders.id });
    return !!deleted;
  }
}
