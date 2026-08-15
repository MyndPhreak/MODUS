/**
 * EventAnnouncementRepository — tracks which channel message announces a
 * given Discord scheduled event, so it can be kept in sync (interested
 * count, "now live" status) after it's posted.
 */
import { and, eq } from "drizzle-orm";
import { requireReturningRow } from "../client";
import type { Database } from "../client";
import {
  eventAnnouncements,
  type EventAnnouncement,
  type NewEventAnnouncement,
} from "../schema";

export class EventAnnouncementRepository {
  constructor(private db: Database) {}

  async create(data: NewEventAnnouncement): Promise<EventAnnouncement> {
    const [row] = await this.db
      .insert(eventAnnouncements)
      .values(data)
      .returning();
    return requireReturningRow(row, "Event announcement insert");
  }

  async getByEvent(
    guildId: string,
    eventId: string,
  ): Promise<EventAnnouncement | null> {
    const [row] = await this.db
      .select()
      .from(eventAnnouncements)
      .where(
        and(
          eq(eventAnnouncements.guildId, guildId),
          eq(eventAnnouncements.eventId, eventId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
