/**
 * Repository for recording sessions + per-user tracks.
 *
 * Designed to match the public surface of AppwriteService's recording methods
 * so callers can swap backends via a feature flag without rewriting call
 * sites. Returns shapes include the Appwrite-compatible `$id` alias alongside
 * `id` so the dashboard's existing document-oriented code keeps working
 * during the transition.
 */
import { and, eq, lt, desc, asc } from "drizzle-orm";
import type { Database } from "../client";
import {
  recordings,
  recordingTracks,
  type Recording,
  type RecordingTrack,
} from "../schema";

// Shape matching AppwriteService so the bot/web don't care which backend is
// active. `$id` mirrors `id` because the web dashboard reads `.$id` directly.
export type RecordingDoc = Recording & {
  $id: string;
  guild_id: string;
  channel_name: string;
  recorded_by: string;
  mixed_file_id: string | null;
  started_at: string;
  ended_at: string | null;
  // `participants` serialized as a JSON string for wire-compatibility with
  // the existing Appwrite-shaped API consumers.
  participants_json: string;
};

export type RecordingTrackDoc = RecordingTrack & {
  $id: string;
  recording_id: string;
  guild_id: string;
  user_id: string;
  file_id: string;
  file_size: number | null;
  start_offset: number;
  segments_json: string;
};

function toRecordingDoc(row: Recording): RecordingDoc {
  return {
    ...row,
    $id: row.id,
    guild_id: row.guildId,
    channel_name: row.channelName,
    recorded_by: row.recordedBy,
    mixed_file_id: row.mixedFileId,
    started_at: row.startedAt.toISOString(),
    ended_at: row.endedAt ? row.endedAt.toISOString() : null,
    participants_json: JSON.stringify(row.participants ?? []),
  };
}

function toTrackDoc(row: RecordingTrack): RecordingTrackDoc {
  return {
    ...row,
    $id: row.id,
    recording_id: row.recordingId,
    guild_id: row.guildId,
    user_id: row.userId,
    file_id: row.fileId,
    file_size: row.fileSize,
    start_offset: row.startOffset,
    segments_json: JSON.stringify(row.segments ?? []),
  };
}

export interface CreateRecordingInput {
  // When migrating from Appwrite, pass the original $id so existing
  // in-memory references (session.recordingDocId) keep pointing at the row.
  id?: string;
  guild_id: string;
  channel_name: string;
  recorded_by: string;
  title?: string | null;
  mixed_file_id?: string | null;
  duration?: number | null;
  bitrate?: number | null;
  multitrack?: boolean;
  /** JSON string or array. */
  participants?: string | string[];
  started_at: string | Date;
  ended_at?: string | Date | null;
}

export interface UpdateRecordingInput {
  title?: string | null;
  mixed_file_id?: string | null;
  duration?: number | null;
  bitrate?: number | null;
  multitrack?: boolean;
  participants?: string | string[];
  ended_at?: string | Date | null;
}

export interface CreateRecordingTrackInput {
  id?: string;
  recording_id: string;
  guild_id: string;
  user_id: string;
  username: string;
  file_id: string;
  file_size?: number | null;
  start_offset?: number;
  /** JSON string or structured array. */
  segments?: string | Array<{ t: number; d: number }>;
}

function parseParticipants(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseSegments(value: unknown): Array<{ t: number; d: number }> {
  if (Array.isArray(value)) {
    return value.filter(
      (s): s is { t: number; d: number } =>
        s && typeof s === "object" && "t" in s && "d" in s,
    );
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export class RecordingRepository {
  constructor(private db: Database) {}

  async create(input: CreateRecordingInput): Promise<string> {
    const [row] = await this.db
      .insert(recordings)
      .values({
        ...(input.id ? { id: input.id } : {}),
        guildId: input.guild_id,
        channelName: input.channel_name,
        recordedBy: input.recorded_by,
        title: input.title ?? null,
        mixedFileId: input.mixed_file_id ?? null,
        duration: input.duration ?? null,
        bitrate: input.bitrate ?? null,
        multitrack: input.multitrack ?? false,
        participants: parseParticipants(input.participants),
        startedAt: toDate(input.started_at),
        endedAt: input.ended_at ? toDate(input.ended_at) : null,
      })
      .returning({ id: recordings.id });
    return row.id;
  }

  async update(id: string, input: UpdateRecordingInput): Promise<void> {
    const patch: Partial<typeof recordings.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.mixed_file_id !== undefined)
      patch.mixedFileId = input.mixed_file_id;
    if (input.duration !== undefined) patch.duration = input.duration;
    if (input.bitrate !== undefined) patch.bitrate = input.bitrate;
    if (input.multitrack !== undefined) patch.multitrack = input.multitrack;
    if (input.participants !== undefined)
      patch.participants = parseParticipants(input.participants);
    if (input.ended_at !== undefined)
      patch.endedAt = input.ended_at ? toDate(input.ended_at) : null;

    if (Object.keys(patch).length === 0) return;
    await this.db.update(recordings).set(patch).where(eq(recordings.id, id));
  }

  async getById(id: string): Promise<RecordingDoc | null> {
    const rows = await this.db
      .select()
      .from(recordings)
      .where(eq(recordings.id, id))
      .limit(1);
    return rows[0] ? toRecordingDoc(rows[0]) : null;
  }

  async listByGuild(
    guildId: string,
    limit = 50,
  ): Promise<RecordingDoc[]> {
    const rows = await this.db
      .select()
      .from(recordings)
      .where(eq(recordings.guildId, guildId))
      .orderBy(desc(recordings.startedAt))
      .limit(limit);
    return rows.map(toRecordingDoc);
  }

  async listOlderThan(
    cutoff: string | Date,
    limit = 100,
  ): Promise<RecordingDoc[]> {
    const rows = await this.db
      .select()
      .from(recordings)
      .where(lt(recordings.startedAt, toDate(cutoff)))
      .orderBy(asc(recordings.startedAt))
      .limit(limit);
    return rows.map(toRecordingDoc);
  }

  /**
   * Delete a recording and its tracks inside a single transaction. Returns
   * the rows that were removed so the caller can clean up the corresponding
   * files from object storage.
   */
  async deleteWithTracks(id: string): Promise<{
    recording: RecordingDoc | null;
    tracks: RecordingTrackDoc[];
  }> {
    return this.db.transaction(async (tx) => {
      const recordingRows = await tx
        .select()
        .from(recordings)
        .where(eq(recordings.id, id))
        .limit(1);
      const recording = recordingRows[0] ?? null;

      const trackRows = await tx
        .select()
        .from(recordingTracks)
        .where(eq(recordingTracks.recordingId, id));

      // FK cascade removes the tracks, but we snapshot them first so the
      // caller can delete the referenced files from R2 / Appwrite.
      await tx.delete(recordings).where(eq(recordings.id, id));

      return {
        recording: recording ? toRecordingDoc(recording) : null,
        tracks: trackRows.map(toTrackDoc),
      };
    });
  }

  async createTrack(input: CreateRecordingTrackInput): Promise<string> {
    const [row] = await this.db
      .insert(recordingTracks)
      .values({
        ...(input.id ? { id: input.id } : {}),
        recordingId: input.recording_id,
        guildId: input.guild_id,
        userId: input.user_id,
        username: input.username,
        fileId: input.file_id,
        fileSize: input.file_size ?? null,
        startOffset: input.start_offset ?? 0,
        segments: parseSegments(input.segments),
      })
      .returning({ id: recordingTracks.id });
    return row.id;
  }

  async listTracks(recordingId: string): Promise<RecordingTrackDoc[]> {
    const rows = await this.db
      .select()
      .from(recordingTracks)
      .where(eq(recordingTracks.recordingId, recordingId));
    return rows.map(toTrackDoc);
  }

  /** Used by the Appwrite → Postgres migration script. */
  async upsertMigratedRecording(
    input: CreateRecordingInput & { id: string },
    createdAt?: string | Date,
  ): Promise<void> {
    await this.db
      .insert(recordings)
      .values({
        id: input.id,
        guildId: input.guild_id,
        channelName: input.channel_name,
        recordedBy: input.recorded_by,
        title: input.title ?? null,
        mixedFileId: input.mixed_file_id ?? null,
        duration: input.duration ?? null,
        bitrate: input.bitrate ?? null,
        multitrack: input.multitrack ?? false,
        participants: parseParticipants(input.participants),
        startedAt: toDate(input.started_at),
        endedAt: input.ended_at ? toDate(input.ended_at) : null,
        ...(createdAt ? { createdAt: toDate(createdAt) } : {}),
      })
      .onConflictDoNothing({ target: recordings.id });
  }

  async upsertMigratedTrack(
    input: CreateRecordingTrackInput & { id: string },
    createdAt?: string | Date,
  ): Promise<void> {
    await this.db
      .insert(recordingTracks)
      .values({
        id: input.id,
        recordingId: input.recording_id,
        guildId: input.guild_id,
        userId: input.user_id,
        username: input.username,
        fileId: input.file_id,
        fileSize: input.file_size ?? null,
        startOffset: input.start_offset ?? 0,
        segments: parseSegments(input.segments),
        ...(createdAt ? { createdAt: toDate(createdAt) } : {}),
      })
      .onConflictDoNothing({ target: recordingTracks.id });
  }
}
