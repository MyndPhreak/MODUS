/**
 * Drizzle schema for MODUS.
 *
 * Phase 1 scope: `recordings` + `recording_tracks`. Other collections from
 * Appwrite migrate in later slices.
 *
 * Conventions:
 *  - Primary keys are TEXT so migrated Appwrite `$id` values survive the move
 *    without rewriting in-memory references. New rows get UUIDs via default.
 *  - Timestamps are `timestamptz`. We standardize on UTC and let the client
 *    localize.
 *  - Every per-guild table indexes guild_id (+ an ordered column) so the
 *    dashboard's "recent first" queries don't table-scan.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── recordings ────────────────────────────────────────────────────────────

export const recordings = pgTable(
  "recordings",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    channelName: text("channel_name").notNull(),
    recordedBy: text("recorded_by").notNull(),
    title: text("title"),
    mixedFileId: text("mixed_file_id"),
    duration: integer("duration"),
    bitrate: integer("bitrate"),
    multitrack: boolean("multitrack").notNull().default(false),
    // Array of Discord user IDs. Was a JSON string in Appwrite; we normalize
    // to text[] so the dashboard can filter by participant without parsing.
    participants: text("participants")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Listing endpoint: recent recordings per guild.
    byGuildStartedAt: index("recordings_guild_started_at_idx").on(
      t.guildId,
      t.startedAt.desc(),
    ),
    // Retention sweep: scan oldest rows regardless of guild.
    byStartedAt: index("recordings_started_at_idx").on(t.startedAt),
  }),
);

export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;

// ── recording_tracks ──────────────────────────────────────────────────────

export const recordingTracks = pgTable(
  "recording_tracks",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    // R2 object key or Appwrite file ID — key shape differentiates backends.
    fileId: text("file_id").notNull(),
    fileSize: integer("file_size"),
    startOffset: integer("start_offset").notNull().default(0),
    // Speech segments: [{t: <ms from session start>, d: <duration ms>}, ...]
    segments: jsonb("segments").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byRecording: index("recording_tracks_recording_id_idx").on(t.recordingId),
  }),
);

export type RecordingTrack = typeof recordingTracks.$inferSelect;
export type NewRecordingTrack = typeof recordingTracks.$inferInsert;
