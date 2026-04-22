/**
 * TranscriptRepository — read/write persistence for closed ticket snapshots.
 *
 * Transcripts are write-once at ticket close. Reads happen from the web
 * dashboard and from the retention worker. No updates.
 */
import { and, asc, desc, eq, lt, isNotNull } from "drizzle-orm";
import type { Database } from "../client";
import {
  ticketTranscripts,
  ticketMessages,
  type TicketTranscript,
  type TicketMessage,
  type NewTicketTranscript,
  type NewTicketMessage,
} from "../schema";

export interface TranscriptWithMessages {
  transcript: TicketTranscript;
  messages: TicketMessage[];
}

export class TranscriptRepository {
  constructor(private db: Database) {}

  async getByThreadId(threadId: string): Promise<TicketTranscript | null> {
    const rows = await this.db
      .select()
      .from(ticketTranscripts)
      .where(eq(ticketTranscripts.threadId, threadId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getById(id: string): Promise<TicketTranscript | null> {
    const rows = await this.db
      .select()
      .from(ticketTranscripts)
      .where(eq(ticketTranscripts.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async getWithMessages(id: string): Promise<TranscriptWithMessages | null> {
    const transcript = await this.getById(id);
    if (!transcript) return null;
    const messages = await this.db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.transcriptId, id))
      .orderBy(asc(ticketMessages.createdAt));
    return { transcript, messages };
  }

  async listByGuild(
    guildId: string,
    limit = 25,
  ): Promise<TicketTranscript[]> {
    return this.db
      .select()
      .from(ticketTranscripts)
      .where(eq(ticketTranscripts.guildId, guildId))
      .orderBy(desc(ticketTranscripts.closedAt))
      .limit(limit);
  }

  async getExpired(
    now: Date,
    limit: number,
  ): Promise<Pick<TicketTranscript, "id">[]> {
    return this.db
      .select({ id: ticketTranscripts.id })
      .from(ticketTranscripts)
      .where(
        and(
          isNotNull(ticketTranscripts.expiresAt),
          lt(ticketTranscripts.expiresAt, now),
        ),
      )
      .limit(limit);
  }

  async deleteById(id: string): Promise<void> {
    // ticket_messages cascades via FK
    await this.db
      .delete(ticketTranscripts)
      .where(eq(ticketTranscripts.id, id));
  }

  /**
   * Atomic snapshot insert: transcript row + all message rows in one
   * transaction. Re-using an existing `threadId` is a caller-side concern —
   * this method will raise a unique-violation if the slot is taken.
   */
  async insertSnapshot(
    transcript: NewTicketTranscript,
    messages: NewTicketMessage[],
  ): Promise<TicketTranscript> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(ticketTranscripts)
        .values(transcript)
        .returning();

      if (messages.length > 0) {
        // Chunk to avoid overflowing Postgres parameter limit (~65k).
        const CHUNK = 500;
        for (let i = 0; i < messages.length; i += CHUNK) {
          await tx
            .insert(ticketMessages)
            .values(messages.slice(i, i + CHUNK));
        }
      }

      return inserted;
    });
  }
}
