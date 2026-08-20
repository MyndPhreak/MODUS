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
  bigint,
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
// Static per-module registry. `ensureModuleRegistered` upserts on name,
// refreshing dashboard metadata from code every boot — but never `enabled`,
// which is the admin-controlled runtime kill switch.

/** Dashboard grouping for a module's display card. Keep in sync with the
 * category list bot modules can declare via `BotModule.meta.category`. */
export type ModuleCategoryKey =
  | "moderation"
  | "engagement"
  | "community"
  | "voice"
  | "ai"
  | "utility";

/** Semantic color tokens a module's display card can declare via
 * `BotModule.meta.color`. Keep in sync with `COLOR_STYLES` in
 * `web/app/utils/module-metadata.ts`, which maps each token to Tailwind
 * classes. */
export type ModuleColorToken =
  | "violet"
  | "blue"
  | "orange"
  | "rose"
  | "green"
  | "cyan"
  | "purple"
  | "amber"
  | "yellow"
  | "emerald"
  | "pink"
  | "sky"
  | "teal"
  | "fuchsia"
  | "red"
  | "indigo"
  | "gray";

export const modules = pgTable(
  "modules",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    description: text("description"),
    displayName: text("display_name"),
    category: text("category"),
    icon: text("icon"),
    color: text("color"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
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

// ── module_access ────────────────────────────────────────────────────────
// Per-(guild, module) dashboard RBAC grant. A role in `role_ids` may access
// and edit that module's dashboard config page without being a full admin
// (servers.admin_user_ids). Absent row = no non-admin role has access.

export const moduleAccess = pgTable(
  "module_access",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    moduleName: text("module_name").notNull(),
    roleIds: text("role_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildModule: uniqueIndex("module_access_guild_module_idx").on(
      t.guildId,
      t.moduleName,
    ),
    byGuild: index("module_access_guild_id_idx").on(t.guildId),
  }),
);

export type ModuleAccess = typeof moduleAccess.$inferSelect;
export type NewModuleAccess = typeof moduleAccess.$inferInsert;

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

// ── xp_users ──────────────────────────────────────────────────────────────
// Per-member XP, leveling, message counters, and rank tracking.

export const xpUsers = pgTable(
  "xp_users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    avatar: text("avatar"),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    charCount: integer("char_count").notNull().default(0),
    lastXpGainAt: timestamp("last_xp_gain_at", { withTimezone: true }),
    notificationPref: text("notification_pref").notNull().default("public"), // public|private|silent
    optedIn: boolean("opted_in").notNull().default(true),
    hiddenFromLeaderboard: boolean("hidden_from_leaderboard").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildUser: uniqueIndex("xp_users_guild_user_idx").on(
      t.guildId,
      t.userId,
    ),
    // Leaderboard: top XP per guild (opted_in only filtered at query time).
    byGuildXp: index("xp_users_guild_xp_idx").on(
      t.guildId,
      t.xp.desc(),
    ),
  }),
);

export type XpUser = typeof xpUsers.$inferSelect;
export type NewXpUser = typeof xpUsers.$inferInsert;

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
    // Template rows are saved embed presets shown on the embed builder page;
    // they share the tags CRUD path but are not invocable via /tag.
    isTemplate: boolean("is_template").notNull().default(false),
    description: text("description"),
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
    byGuildTemplate: index("tags_guild_template_idx").on(t.guildId, t.isTemplate),
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

// ── ticket_transcripts ────────────────────────────────────────────────────

export const ticketTranscripts = pgTable(
  "ticket_transcripts",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    ticketId: integer("ticket_id").notNull(),
    threadId: text("thread_id").notNull().unique(),
    threadName: text("thread_name").notNull(),
    openerId: text("opener_id").notNull(),
    claimedById: text("claimed_by_id"),
    closedById: text("closed_by_id").notNull(),
    typeId: text("type_id"),
    priority: text("priority").notNull(),
    participantIds: text("participant_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    messageCount: integer("message_count").notNull().default(0),
    hasSkippedAttachments: boolean("has_skipped_attachments")
      .notNull()
      .default(false),
    // Display-name lookup captured at snapshot time so transcripts remain
    // legible after members leave, roles are deleted, etc. Shape:
    //   { users: {id: name}, roles: {id: name}, channels: {id: name} }
    mentions: jsonb("mentions").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildClosed: index("ticket_transcripts_guild_closed_idx").on(
      t.guildId,
      t.closedAt.desc(),
    ),
    byOpener: index("ticket_transcripts_opener_idx").on(t.openerId),
    byExpires: index("ticket_transcripts_expires_idx")
      .on(t.expiresAt)
      .where(sql`expires_at IS NOT NULL`),
  }),
);

export type TicketTranscript = typeof ticketTranscripts.$inferSelect;
export type NewTicketTranscript = typeof ticketTranscripts.$inferInsert;

// ── ticket_messages ───────────────────────────────────────────────────────

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => ticketTranscripts.id, { onDelete: "cascade" }),
    discordMessageId: text("discord_message_id").notNull(),
    authorId: text("author_id").notNull(),
    authorTag: text("author_tag").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    authorIsBot: boolean("author_is_bot").notNull().default(false),
    content: text("content").notNull().default(""),
    embeds: jsonb("embeds").notNull().default(sql`'[]'::jsonb`),
    attachments: jsonb("attachments").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byTranscript: index("ticket_messages_transcript_created_idx").on(
      t.transcriptId,
      t.createdAt,
    ),
  }),
);

export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;

// ── reminders ─────────────────────────────────────────────────────────────

export const reminders = pgTable(
  "reminders",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id"),
    channelId: text("channel_id").notNull(),
    userId: text("user_id").notNull(),
    reminder: text("reminder").notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    messageId: text("message_id"),
    messageUrl: text("message_url"),
    quotedContent: text("quoted_content"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    byUser: index("reminders_user_id_idx").on(t.userId),
    byPendingRemindAt: index("reminders_pending_remind_at_idx")
      .on(t.status, t.remindAt)
      .where(sql`status = 'pending'`),
  }),
);

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;

// ── poll_templates ───────────────────────────────────────────────────────
// Reusable, on-demand poll presets saved from the dashboard. Sending a
// template does not mutate it — polls.question/options are snapshotted at
// send time (see `polls` below) so editing a template later never changes
// the record of a poll that was already sent.

export const pollTemplates = pgTable(
  "poll_templates",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    question: text("question").notNull(),
    options: jsonb("options")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    durationHours: integer("duration_hours").notNull().default(24),
    allowMultiselect: boolean("allow_multiselect").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuild: index("poll_templates_guild_id_idx").on(t.guildId),
  }),
);

export type PollTemplate = typeof pollTemplates.$inferSelect;
export type NewPollTemplate = typeof pollTemplates.$inferInsert;

// ── polls ─────────────────────────────────────────────────────────────────
// A poll that was actually sent to Discord — created via `/poll create` in
// the bot (source: "slash") or the dashboard send flow (source: "dashboard").
// Vote tallies are never persisted here; they're always read live from
// Discord. This table only tracks a poll's existence/metadata so the
// dashboard can list what's currently running.

export const polls = pgTable(
  "polls",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    templateId: text("template_id").references(() => pollTemplates.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    options: jsonb("options")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    finalized: boolean("finalized").notNull().default(false),
    createdBy: text("created_by"),
    source: text("source").notNull().default("slash"), // "slash" | "dashboard"
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Running-polls query: guild_id + not-yet-expired, skipping finalized rows.
    byGuildActive: index("polls_guild_active_idx")
      .on(t.guildId, t.expiresAt)
      .where(sql`finalized = false`),
    // /poll end and vote-finalization lookups go by message_id.
    byMessageId: uniqueIndex("polls_message_id_idx").on(t.messageId),
  }),
);

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;

// ── giveaways ─────────────────────────────────────────────────────────────
// A giveaway posted to Discord — created via `/giveaway create` (source:
// "slash") or the dashboard's create form (source: "dashboard"). Entries are
// tracked in `giveaway_entries`. `id` is generated by the application
// (crypto.randomUUID()) BEFORE the Discord message is sent, so it can be
// embedded in the Enter button's customId (`giveaway:enter:<id>`).

export const giveaways = pgTable(
  "giveaways",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    hostId: text("host_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** "key" | "gift" | "physical" | "other" */
    prizeKind: text("prize_kind").notNull(),
    /** Hidden from the public embed when prizeKind = "key"; revealed via DM at draw time. */
    prizeValue: text("prize_value").notNull(),
    imageUrl: text("image_url"),
    winnerCount: integer("winner_count").notNull().default(1),
    requirements: jsonb("requirements")
      .notNull()
      .default(sql`'{"requiredRoleIds":[],"blockedRoleIds":[]}'::jsonb`)
      .$type<{
        requiredRoleIds: string[];
        blockedRoleIds: string[];
        minAccountAgeDays?: number;
        minServerAgeDays?: number;
      }>(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** "active" | "ended" | "cancelled" */
    status: text("status").notNull().default("active"),
    winnerIds: jsonb("winner_ids").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    source: text("source").notNull().default("slash"), // "slash" | "dashboard"
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Draw worker's sweep query: status = 'active' AND ends_at <= now().
    byStatusEndsAt: index("giveaways_status_ends_at_idx").on(t.status, t.endsAt),
    // Dashboard list + guild-scoped lookups.
    byGuild: index("giveaways_guild_idx").on(t.guildId, t.createdAt),
    // /giveaway requirements|end|reroll and the Enter button resolve by message ID.
    byMessageId: uniqueIndex("giveaways_message_id_idx").on(t.messageId),
  }),
);

export type Giveaway = typeof giveaways.$inferSelect;
export type NewGiveaway = typeof giveaways.$inferInsert;

// ── giveaway_entries ─────────────────────────────────────────────────────

export const giveawayEntries = pgTable(
  "giveaway_entries",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    giveawayId: text("giveaway_id")
      .notNull()
      .references(() => giveaways.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    enteredAt: timestamp("entered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Enforces one entry per user per giveaway; also the lookup index for
    // the enter-button's "already entered" check.
    byGiveawayUser: uniqueIndex("giveaway_entries_giveaway_user_idx").on(
      t.giveawayId,
      t.userId,
    ),
  }),
);

export type GiveawayEntry = typeof giveawayEntries.$inferSelect;
export type NewGiveawayEntry = typeof giveawayEntries.$inferInsert;

// ── event_announcements ─────────────────────────────────────────────────────
// Tracks which channel message announces a given Discord scheduled event, so
// the bot can keep it in sync (interested-count edits, "now live" status)
// without duplicating event data itself. Discord remains the source of
// truth for the event; this table only tracks the announcement message.

export const eventAnnouncements = pgTable(
  "event_announcements",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id").notNull(),
    eventId: text("event_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildEvent: uniqueIndex("event_announcements_guild_event_idx").on(
      t.guildId,
      t.eventId,
    ),
  }),
);

export type EventAnnouncement = typeof eventAnnouncements.$inferSelect;
export type NewEventAnnouncement = typeof eventAnnouncements.$inferInsert;

// ── music playback state ──────────────────────────────────────────────────
// Lavalink owns the live player, but these rows are the recoverable source of
// truth. Encoded Lavalink tracks and transient media URLs deliberately do not
// belong in this schema.

export interface MusicSourceData {
  name: string;
  uri?: string;
  identifier?: string;
}

export interface MusicCanonicalTrackData {
  id: string;
  requestedInput: string;
  requestType: "search" | "url" | "playlist" | "album" | "track";
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  artworkUrl?: string;
  isrc?: string;
  requestedBy: string;
  requestedAt: string;
  requestedSource: MusicSourceData;
  playbackSource?: MusicSourceData;
  matchConfidence?: number;
}

export const musicSessions = pgTable(
  "music_sessions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    guildId: text("guild_id")
      .notNull()
      .unique("music_sessions_guild_id_unique"),
    revision: integer("revision").notNull().default(0),
    currentEntryId: text("current_entry_id"),
    checkpointPositionMs: integer("checkpoint_position_ms").notNull().default(0),
    checkpointedAt: timestamp("checkpointed_at", { withTimezone: true }),
    volume: integer("volume").notNull().default(100),
    repeatMode: text("repeat_mode").notNull().default("off"),
    autoplay: boolean("autoplay").notNull().default(false),
    filters: jsonb("filters")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),
    assignedNodeId: text("assigned_node_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type MusicSession = typeof musicSessions.$inferSelect;
export type NewMusicSession = typeof musicSessions.$inferInsert;

export const musicQueueEntries = pgTable(
  "music_queue_entries",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => musicSessions.guildId, { onDelete: "cascade" }),
    canonicalMetadata: jsonb("canonical_metadata")
      .notNull()
      .$type<MusicCanonicalTrackData>(),
    requesterId: text("requester_id").notNull(),
    position: integer("position").notNull(),
    status: text("status").notNull().default("pending"),
    matchSource: text("match_source"),
    matchConfidence: doublePrecision("match_confidence"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildPosition: index("music_queue_entries_guild_position_idx").on(
      t.guildId,
      t.position,
    ),
  }),
);

export type MusicQueueEntryRow = typeof musicQueueEntries.$inferSelect;
export type NewMusicQueueEntryRow = typeof musicQueueEntries.$inferInsert;

export const musicOperations = pgTable(
  "music_operations",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => musicSessions.guildId, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    resultingRevision: integer("resulting_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGuildOperation: uniqueIndex("music_operations_guild_operation_idx").on(
      t.guildId,
      t.operationId,
    ),
    byGuildRevision: index("music_operations_guild_revision_idx").on(
      t.guildId,
      t.resultingRevision,
    ),
  }),
);

export type MusicOperation = typeof musicOperations.$inferSelect;
export type NewMusicOperation = typeof musicOperations.$inferInsert;
