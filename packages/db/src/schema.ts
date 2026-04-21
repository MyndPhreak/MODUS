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
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
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

// ── modules ───────────────────────────────────────────────────────────────
// Static per-module registry. `ensureModuleRegistered` upserts on name.

export const modules = pgTable(
  "modules",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byName: uniqueIndex("modules_name_idx").on(t.name),
  }),
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;

// ── servers ───────────────────────────────────────────────────────────────
// Guild metadata + premium flag. `admin_user_ids` / `dashboard_role_ids` were
// Appwrite string arrays; preserved as text[] here for GIN-indexable membership.

export const servers = pgTable(
  "servers",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    ownerId: text("owner_id"),
    memberCount: integer("member_count"),
    status: boolean("status").notNull().default(false),
    ping: integer("ping"),
    shardId: integer("shard_id"),
    lastChecked: timestamp("last_checked", { withTimezone: true }),
    isPublic: boolean("is_public").notNull().default(false),
    description: text("description"),
    inviteLink: text("invite_link"),
    premium: boolean("premium").notNull().default(false),
    adminUserIds: text("admin_user_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    dashboardRoleIds: text("dashboard_role_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildId: uniqueIndex("servers_guild_id_idx").on(t.guildId),
    byOwnerId: index("servers_owner_id_idx").on(t.ownerId),
  }),
);

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;

// ── guild_configs ─────────────────────────────────────────────────────────
// Per-(guild, module) settings. In Appwrite, `settings` was a 16 KB JSON
// string; here it's JSONB so we gain containment queries (`@>`) and can
// index frequently-read paths.
//
// Two special sentinel rows:
//   - guildId="__global__", moduleName="ai"           → global AI config
//   - moduleName="alerts_state"                        → per-guild alerts cursor

export const guildConfigs = pgTable(
  "guild_configs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    moduleName: text("module_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildModule: uniqueIndex("guild_configs_guild_module_idx").on(
      t.guildId,
      t.moduleName,
    ),
    byGuild: index("guild_configs_guild_id_idx").on(t.guildId),
    byModuleEnabled: index("guild_configs_module_enabled_idx").on(
      t.moduleName,
      t.enabled,
    ),
  }),
);

export type GuildConfig = typeof guildConfigs.$inferSelect;
export type NewGuildConfig = typeof guildConfigs.$inferInsert;

// ── bot_status ────────────────────────────────────────────────────────────
// Per-shard heartbeat. Document ID was `shard-<n>` in Appwrite; we preserve
// that as the primary key so cross-shard upserts remain stable.

export const botStatus = pgTable("bot_status", {
  id: text("id").primaryKey(), // `shard-<n>`
  botId: text("bot_id").notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  version: text("version"),
  shardId: integer("shard_id").notNull(),
  totalShards: integer("total_shards").notNull(),
});

export type BotStatus = typeof botStatus.$inferSelect;
export type NewBotStatus = typeof botStatus.$inferInsert;

// ── logs ──────────────────────────────────────────────────────────────────
// High-insert volume. Schema is declarative-partition-ready — if volume
// warrants it, convert to monthly partitions with a follow-up migration
// (ALTER TABLE ... PARTITION BY RANGE (timestamp)).

export const logs = pgTable(
  "logs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    message: text("message").notNull(),
    level: text("level").notNull(), // "info" | "warn" | "error"
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    shardId: integer("shard_id"),
    source: text("source"),
  },
  (t) => ({
    byGuildTimestamp: index("logs_guild_timestamp_idx").on(
      t.guildId,
      t.timestamp.desc(),
    ),
    byTimestamp: index("logs_timestamp_idx").on(t.timestamp.desc()),
  }),
);

export type LogEntry = typeof logs.$inferSelect;
export type NewLogEntry = typeof logs.$inferInsert;

// ── milestone_users ───────────────────────────────────────────────────────

export const milestoneUsers = pgTable(
  "milestone_users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    charCount: integer("char_count").notNull().default(0),
    lastMilestone: integer("last_milestone").notNull().default(0),
    notificationPref: text("notification_pref").notNull().default("public"), // public|private|silent
    optedIn: boolean("opted_in").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildUser: uniqueIndex("milestone_users_guild_user_idx").on(
      t.guildId,
      t.userId,
    ),
    // Leaderboard: top speakers per guild (opted_in only filtered at query time).
    byGuildChars: index("milestone_users_guild_chars_idx").on(
      t.guildId,
      t.charCount.desc(),
    ),
  }),
);

export type MilestoneUser = typeof milestoneUsers.$inferSelect;
export type NewMilestoneUser = typeof milestoneUsers.$inferInsert;

// ── automod_rules ─────────────────────────────────────────────────────────

export const automodRules = pgTable(
  "automod_rules",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    trigger: text("trigger").notNull(),
    // Appwrite stored these as 16 KB / 8 KB JSON strings — JSONB here.
    conditions: jsonb("conditions").notNull().default(sql`'{}'::jsonb`),
    actions: jsonb("actions").notNull().default(sql`'[]'::jsonb`),
    exemptRoles: text("exempt_roles").array().notNull().default(sql`ARRAY[]::text[]`),
    exemptChannels: text("exempt_channels")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    cooldown: integer("cooldown"),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuild: index("automod_rules_guild_idx").on(t.guildId),
    byGuildEnabled: index("automod_rules_guild_enabled_idx").on(
      t.guildId,
      t.enabled,
    ),
    byGuildTrigger: index("automod_rules_guild_trigger_idx").on(
      t.guildId,
      t.trigger,
    ),
  }),
);

export type AutomodRule = typeof automodRules.$inferSelect;
export type NewAutomodRule = typeof automodRules.$inferInsert;

// ── ai_usage_log ──────────────────────────────────────────────────────────
// High-insert — same partitioning comment as `logs`.

export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    // Appwrite `float` → Postgres double precision (estimated_cost in USD).
    estimatedCost: doublePrecision("estimated_cost"),
    action: text("action").notNull().default("chat"),
    keySource: text("key_source"), // "guild" | "shared"
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byGuildTimestamp: index("ai_usage_log_guild_timestamp_idx").on(
      t.guildId,
      t.timestamp.desc(),
    ),
    byUserTimestamp: index("ai_usage_log_user_timestamp_idx").on(
      t.userId,
      t.timestamp.desc(),
    ),
    byTimestamp: index("ai_usage_log_timestamp_idx").on(t.timestamp.desc()),
  }),
);

export type AIUsageLogEntry = typeof aiUsageLog.$inferSelect;
export type NewAIUsageLogEntry = typeof aiUsageLog.$inferInsert;

// ── tags ──────────────────────────────────────────────────────────────────

export const tags = pgTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(), // lowercased at write time
    content: text("content"),
    // Structured embed payload — JSONB so we can query it later if needed.
    embedData: jsonb("embed_data"),
    allowedRoles: text("allowed_roles")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildName: uniqueIndex("tags_guild_name_idx").on(t.guildId, t.name),
    byGuild: index("tags_guild_idx").on(t.guildId),
  }),
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// ── temp_voice_channels ───────────────────────────────────────────────────

export const tempVoiceChannels = pgTable(
  "temp_voice_channels",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    ownerId: text("owner_id").notNull(),
    lobbyChannelId: text("lobby_channel_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byChannelId: uniqueIndex("temp_voice_channels_channel_id_idx").on(
      t.channelId,
    ),
    byGuild: index("temp_voice_channels_guild_idx").on(t.guildId),
    byGuildOwner: index("temp_voice_channels_guild_owner_idx").on(
      t.guildId,
      t.ownerId,
    ),
  }),
);

export type TempVoiceChannel = typeof tempVoiceChannels.$inferSelect;
export type NewTempVoiceChannel = typeof tempVoiceChannels.$inferInsert;

// ── triggers ──────────────────────────────────────────────────────────────

export const triggers = pgTable(
  "triggers",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    secret: text("secret").notNull(),
    provider: text("provider").notNull(), // webhook|github|twitch
    channelId: text("channel_id").notNull(),
    embedTemplate: jsonb("embed_template"),
    filters: jsonb("filters"),
    createdBy: text("created_by"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bySecret: uniqueIndex("triggers_secret_idx").on(t.secret),
    byGuildName: uniqueIndex("triggers_guild_name_idx").on(t.guildId, t.name),
    byGuild: index("triggers_guild_idx").on(t.guildId),
    byGuildEnabled: index("triggers_guild_enabled_idx").on(
      t.guildId,
      t.enabled,
    ),
  }),
);

export type TriggerRow = typeof triggers.$inferSelect;
export type NewTriggerRow = typeof triggers.$inferInsert;
