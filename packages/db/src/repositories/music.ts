import {
  and,
  asc,
  eq,
  gt,
  gte,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { requireReturningRow } from "../client";
import type { Database } from "../client";
import {
  musicOperations,
  musicQueueEntries,
  musicSessions,
  type MusicCanonicalTrackData,
  type MusicQueueEntryRow,
} from "../schema";

export type MusicRepeatModeData = "off" | "track" | "queue";
export type MusicQueueEntryStatusData = "pending" | "ready" | "playing" | "failed";

export interface MusicQueueEntryData {
  id: string;
  track: MusicCanonicalTrackData;
  requesterId: string;
  position: number;
  status: MusicQueueEntryStatusData;
  matchSource: string | null;
  matchConfidence: number | null;
}

export interface DurableMusicQueueSnapshot {
  guildId: string;
  revision: number;
  entries: MusicQueueEntryData[];
  currentEntryId: string | null;
  checkpointPositionMs: number;
  checkpointedAt: Date | null;
  repeatMode: MusicRepeatModeData;
  volume: number;
  filters: Record<string, unknown>;
  assignedNodeId: string | null;
}

interface MusicMutationBase {
  guildId: string;
  operationId: string;
  expectedRevision: number;
}

export type MusicApplyMutationInput = MusicMutationBase & {
  mutation:
    | {
        type: "insert";
        entry: Omit<MusicQueueEntryData, "position">;
        position: number;
      }
    | { type: "remove"; entryId: string }
    | { type: "move"; entryId: string; position: number }
    | { type: "clear" }
    | { type: "reorder"; entryIds: string[] }
    | {
        type: "setStatus";
        entryId: string;
        status: MusicQueueEntryStatusData;
      };
};

export interface MusicMutationResult {
  revision: number;
  replayed: boolean;
}

export interface MusicCheckpointInput {
  guildId: string;
  currentEntryId: string | null;
  positionMs: number;
  checkpointedAt?: Date;
  volume?: number;
  repeatMode?: MusicRepeatModeData;
  filters?: Record<string, unknown>;
}

export interface MusicNodeAssignmentInput {
  guildId: string;
  nodeId: string | null;
}

export class MusicRevisionConflictError extends Error {
  constructor(
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
  ) {
    super(
      `Music queue revision conflict: expected ${expectedRevision}, actual ${actualRevision}.`,
    );
    this.name = "MusicRevisionConflictError";
  }
}

export class MusicQueueMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicQueueMutationError";
  }
}

export class MusicRepository {
  constructor(private db: Database) {}

  async readSnapshot(guildId: string): Promise<DurableMusicQueueSnapshot> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(musicSessions)
        .where(eq(musicSessions.guildId, guildId))
        .for("share");

      if (!session) return emptySnapshot(guildId);

      const entries = await tx
        .select()
        .from(musicQueueEntries)
        .where(eq(musicQueueEntries.guildId, guildId))
        .orderBy(asc(musicQueueEntries.position));

      return {
        guildId,
        revision: session.revision,
        entries: entries.map(toQueueEntry),
        currentEntryId: session.currentEntryId,
        checkpointPositionMs: session.checkpointPositionMs,
        checkpointedAt: session.checkpointedAt,
        repeatMode: session.repeatMode as MusicRepeatModeData,
        volume: session.volume,
        filters: session.filters,
        assignedNodeId: session.assignedNodeId,
      };
    });
  }

  async applyMutation(
    input: MusicApplyMutationInput,
  ): Promise<MusicMutationResult> {
    return this.db.transaction(async (tx) => {
      await tx
        .insert(musicSessions)
        .values({ guildId: input.guildId })
        .onConflictDoNothing({ target: musicSessions.guildId });

      const [sessionRow] = await tx
        .select()
        .from(musicSessions)
        .where(eq(musicSessions.guildId, input.guildId))
        .for("update");
      const session = requireReturningRow(sessionRow, "Music session lock");

      const [existingOperation] = await tx
        .select({ resultingRevision: musicOperations.resultingRevision })
        .from(musicOperations)
        .where(and(
          eq(musicOperations.guildId, input.guildId),
          eq(musicOperations.operationId, input.operationId),
        ))
        .limit(1);

      if (existingOperation) {
        return {
          revision: existingOperation.resultingRevision,
          replayed: true,
        };
      }

      if (input.expectedRevision !== session.revision) {
        throw new MusicRevisionConflictError(
          input.expectedRevision,
          session.revision,
        );
      }

      const sessionPatch: Partial<typeof musicSessions.$inferInsert> = {
        updatedAt: new Date(),
      };
      const mutation = input.mutation;

      switch (mutation.type) {
        case "insert": {
          const [{ count }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(musicQueueEntries)
            .where(eq(musicQueueEntries.guildId, input.guildId));
          const position = clampPosition(mutation.position, count ?? 0);

          await tx
            .update(musicQueueEntries)
            .set({
              position: sql`${musicQueueEntries.position} + 1`,
              updatedAt: new Date(),
            })
            .where(and(
              eq(musicQueueEntries.guildId, input.guildId),
              gte(musicQueueEntries.position, position),
            ));
          await tx.insert(musicQueueEntries).values({
            id: mutation.entry.id,
            guildId: input.guildId,
            canonicalMetadata: mutation.entry.track,
            requesterId: mutation.entry.requesterId,
            position,
            status: mutation.entry.status,
            matchSource: mutation.entry.matchSource,
            matchConfidence: mutation.entry.matchConfidence,
          });
          break;
        }

        case "remove": {
          const [removed] = await tx
            .delete(musicQueueEntries)
            .where(and(
              eq(musicQueueEntries.guildId, input.guildId),
              eq(musicQueueEntries.id, mutation.entryId),
            ))
            .returning({ position: musicQueueEntries.position });

          if (removed) {
            await tx
              .update(musicQueueEntries)
              .set({
                position: sql`${musicQueueEntries.position} - 1`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(musicQueueEntries.guildId, input.guildId),
                gt(musicQueueEntries.position, removed.position),
              ));
          }
          if (session.currentEntryId === mutation.entryId) {
            sessionPatch.currentEntryId = null;
            sessionPatch.checkpointPositionMs = 0;
          }
          break;
        }

        case "move": {
          const [entry] = await tx
            .select({ position: musicQueueEntries.position })
            .from(musicQueueEntries)
            .where(and(
              eq(musicQueueEntries.guildId, input.guildId),
              eq(musicQueueEntries.id, mutation.entryId),
            ))
            .limit(1);
          if (!entry) {
            throw new MusicQueueMutationError(
              `Music queue entry ${mutation.entryId} does not exist.`,
            );
          }

          const [{ count }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(musicQueueEntries)
            .where(eq(musicQueueEntries.guildId, input.guildId));
          const position = clampPosition(
            mutation.position,
            Math.max(0, (count ?? 1) - 1),
          );

          if (position < entry.position) {
            await tx
              .update(musicQueueEntries)
              .set({
                position: sql`${musicQueueEntries.position} + 1`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(musicQueueEntries.guildId, input.guildId),
                gte(musicQueueEntries.position, position),
                lt(musicQueueEntries.position, entry.position),
              ));
          } else if (position > entry.position) {
            await tx
              .update(musicQueueEntries)
              .set({
                position: sql`${musicQueueEntries.position} - 1`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(musicQueueEntries.guildId, input.guildId),
                gt(musicQueueEntries.position, entry.position),
                lte(musicQueueEntries.position, position),
              ));
          }

          await tx
            .update(musicQueueEntries)
            .set({ position, updatedAt: new Date() })
            .where(and(
              eq(musicQueueEntries.guildId, input.guildId),
              eq(musicQueueEntries.id, mutation.entryId),
            ));
          break;
        }

        case "clear":
          await tx
            .delete(musicQueueEntries)
            .where(eq(musicQueueEntries.guildId, input.guildId));
          sessionPatch.currentEntryId = null;
          sessionPatch.checkpointPositionMs = 0;
          break;

        case "reorder": {
          const rows = await tx
            .select({ id: musicQueueEntries.id })
            .from(musicQueueEntries)
            .where(eq(musicQueueEntries.guildId, input.guildId));
          const existingIds = new Set(rows.map(({ id }) => id));
          const requestedIds = new Set(mutation.entryIds);
          if (
            existingIds.size !== requestedIds.size ||
            mutation.entryIds.length !== requestedIds.size ||
            mutation.entryIds.some((id) => !existingIds.has(id))
          ) {
            throw new MusicQueueMutationError(
              "A queue reorder must contain every entry exactly once.",
            );
          }

          for (const [position, entryId] of mutation.entryIds.entries()) {
            await tx
              .update(musicQueueEntries)
              .set({ position, updatedAt: new Date() })
              .where(and(
                eq(musicQueueEntries.guildId, input.guildId),
                eq(musicQueueEntries.id, entryId),
              ));
          }
          break;
        }

        case "setStatus":
          await tx
            .update(musicQueueEntries)
            .set({ status: mutation.status, updatedAt: new Date() })
            .where(and(
              eq(musicQueueEntries.guildId, input.guildId),
              eq(musicQueueEntries.id, mutation.entryId),
            ));
          break;
      }

      const revision = session.revision + 1;
      await tx
        .update(musicSessions)
        .set({ ...sessionPatch, revision })
        .where(eq(musicSessions.guildId, input.guildId));
      await tx.insert(musicOperations).values({
        guildId: input.guildId,
        operationId: input.operationId,
        resultingRevision: revision,
      });

      return { revision, replayed: false };
    });
  }

  async checkpoint(input: MusicCheckpointInput): Promise<void> {
    const now = new Date();
    const checkpointedAt = input.checkpointedAt ?? now;
    const patch: Partial<typeof musicSessions.$inferInsert> = {
      currentEntryId: input.currentEntryId,
      checkpointPositionMs: Math.max(0, Math.trunc(input.positionMs)),
      checkpointedAt,
      updatedAt: now,
    };
    if (input.volume !== undefined) patch.volume = input.volume;
    if (input.repeatMode !== undefined) patch.repeatMode = input.repeatMode;
    if (input.filters !== undefined) patch.filters = input.filters;

    await this.db
      .insert(musicSessions)
      .values({
        guildId: input.guildId,
        currentEntryId: input.currentEntryId,
        checkpointPositionMs: Math.max(0, Math.trunc(input.positionMs)),
        checkpointedAt,
        volume: input.volume ?? 100,
        repeatMode: input.repeatMode ?? "off",
        filters: input.filters ?? {},
      })
      .onConflictDoUpdate({
        target: musicSessions.guildId,
        set: patch,
      });
  }

  async recordNodeAssignment(input: MusicNodeAssignmentInput): Promise<void> {
    await this.db
      .insert(musicSessions)
      .values({
        guildId: input.guildId,
        assignedNodeId: input.nodeId,
      })
      .onConflictDoUpdate({
        target: musicSessions.guildId,
        set: { assignedNodeId: input.nodeId, updatedAt: new Date() },
      });
  }
}

function toQueueEntry(row: MusicQueueEntryRow): MusicQueueEntryData {
  return {
    id: row.id,
    track: row.canonicalMetadata,
    requesterId: row.requesterId,
    position: row.position,
    status: row.status as MusicQueueEntryStatusData,
    matchSource: row.matchSource,
    matchConfidence: row.matchConfidence,
  };
}

function emptySnapshot(guildId: string): DurableMusicQueueSnapshot {
  return {
    guildId,
    revision: 0,
    entries: [],
    currentEntryId: null,
    checkpointPositionMs: 0,
    checkpointedAt: null,
    repeatMode: "off",
    volume: 100,
    filters: {},
    assignedNodeId: null,
  };
}

function clampPosition(position: number, maximum: number): number {
  if (!Number.isFinite(position)) return maximum;
  return Math.max(0, Math.min(Math.trunc(position), maximum));
}
