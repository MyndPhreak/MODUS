/**
 * Zod v4 schemas for every module's Appwrite settings.
 *
 * Each schema mirrors the module's DEFAULT_SETTINGS / interface and adds
 * `.default()` on every field so that `schema.parse({})` always returns
 * a fully-populated, type-safe object — eliminating the unsafe
 * `{ ...DEFAULT_SETTINGS, ...saved }` spread pattern.
 *
 * Unknown keys are stripped automatically (`z.object` does NOT passthrough).
 */

import * as z from "zod";

// ── Recording ──────────────────────────────────────────────────────

export const RecordingSettingsSchema = z.object({
  maxDuration: z.number().default(14400), // 4 hours in seconds
  bitrate: z.number().default(64), // kbps
  maxConcurrentUsers: z.number().default(25), // cap FFmpeg processes per session
  announceMode: z.literal(["none", "tts", "soundClip"]).default("tts"),
  announceSoundFileId: z.string().default(""),
  allowedRoleIds: z.array(z.string()).default([]),
  allowedUserIds: z.array(z.string()).default([]),
});

export type RecordingSettings = z.infer<typeof RecordingSettingsSchema>;

// ── Welcome ────────────────────────────────────────────────────────

const TemplateElementSchema = z.object({
  id: z.string(),
  type: z.literal(["text", "image", "rect", "circle", "avatar"]),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  // Text props
  text: z.string().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  fontStyle: z.string().optional(),
  fill: z.string().optional(),
  align: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  // Rect/Circle props
  cornerRadius: z.number().optional(),
  opacity: z.number().optional(),
  // Image props
  src: z.string().optional(),
  // Avatar
  radius: z.number().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  // Rotation
  rotation: z.number().optional(),
  // Shadow
  shadowColor: z.string().optional(),
  shadowBlur: z.number().optional(),
  shadowOffsetX: z.number().optional(),
  shadowOffsetY: z.number().optional(),
});

export const WelcomeTemplateSchema = z.object({
  canvasWidth: z.number().default(1024),
  canvasHeight: z.number().default(500),
  backgroundColor: z.string().default("#1a1a2e"),
  backgroundImage: z.string().optional(),
  elements: z.array(TemplateElementSchema).default([]),
  channelId: z.string().optional(),
});

export type WelcomeTemplateSettings = z.infer<typeof WelcomeTemplateSchema>;

// ── Music ──────────────────────────────────────────────────────────

export const MusicSettingsSchema = z.object({
  defaultVolume: z.number().default(50),
  djRoleId: z.string().default(""),
  updateNickname: z.boolean().default(true),
  maxQueueSize: z.number().default(200),
  activeFilters: z.array(z.string()).default([]),
});

export type MusicSettings = z.infer<typeof MusicSettingsSchema>;

// ── Moderation ─────────────────────────────────────────────────────

const CommandPermissionsSchema = z.object({
  ban: z.array(z.string()).optional(),
  kick: z.array(z.string()).optional(),
  timeout: z.array(z.string()).optional(),
  warn: z.array(z.string()).optional(),
  purge: z.array(z.string()).optional(),
  channel: z.array(z.string()).optional(),
});

export const ModerationSettingsSchema = z.object({
  modLogChannelId: z.string().optional(),
  muteRoleId: z.string().optional(),
  warnThreshold: z.number().default(3),
  warnAction: z.literal(["timeout", "kick", "ban", "none"]).default("timeout"),
  autoTimeoutDuration: z.number().default(60),
  dmOnAction: z.boolean().default(true),
  exemptRoleIds: z.array(z.string()).default([]),
  deleteCommandMessage: z.boolean().default(false),
  commandPermissions: CommandPermissionsSchema.optional(),
  /** Tracked internally — not user-facing in the dashboard */
  lastCaseId: z.number().optional(),
});

export type ModerationSettingsType = z.infer<typeof ModerationSettingsSchema>;

// ── Milestones ─────────────────────────────────────────────────────

const MilestoneConfigSchema = z.object({
  threshold: z.number(),
  message: z.string(),
});

export const MilestoneSettingsSchema = z.object({
  milestones: z.array(MilestoneConfigSchema).optional(),
  announcementChannel: z.string().optional(),
});

export type MilestoneSettingsType = z.infer<typeof MilestoneSettingsSchema>;

// ── Logging ────────────────────────────────────────────────────────

export const LoggingSettingsSchema = z.object({
  auditChannelId: z.string().default(""),
  logMessages: z.boolean().default(false),
  logMembers: z.boolean().default(false),
  logRoles: z.boolean().default(false),
  logChannels: z.boolean().default(false),
  logInvites: z.boolean().default(false),
});

export type LoggingSettingsType = z.infer<typeof LoggingSettingsSchema>;

// ── TempVoice ──────────────────────────────────────────────────────

export const TempVoiceSettingsSchema = z.object({
  lobbyChannelIds: z.array(z.string()).default([]),
  defaultUserLimit: z.number().default(0),
  namingTemplate: z.string().default("{username}'s Channel"),
  categoryId: z.string().optional(),
});

export type TempVoiceSettingsType = z.infer<typeof TempVoiceSettingsSchema>;

// ── AI ─────────────────────────────────────────────────────────────

const AI_PROVIDERS = [
  "OpenAI",
  "Google Gemini",
  "Anthropic Claude",
  "Groq",
  "OpenAI Compatible",
] as const;

export const AISettingsSchema = z.object({
  aiProvider: z.literal(AI_PROVIDERS).default("Groq"),
  aiApiKey: z.string().default(""),
  aiModel: z.string().default("llama-3.3-70b-versatile"),
  aiBaseUrl: z.string().default(""),
  systemPrompt: z.string().default(""),
  maxInputTokens: z.number().default(500),
  maxOutputTokens: z.number().default(300),
  rateLimitSeconds: z.number().default(60),
  respondToDMs: z.boolean().default(false),
  toolUseEnabled: z.boolean().default(false),
  contextEnabled: z.boolean().default(true),
  contextMessageCount: z.number().default(5),
  contextTTLMinutes: z.number().default(15),
});

export type AISettingsType = z.infer<typeof AISettingsSchema>;

// ── Triggers ───────────────────────────────────────────────────────

export const TriggersSettingsSchema = z.object({
  maxTriggers: z.number().default(25),
});

export type TriggersSettingsType = z.infer<typeof TriggersSettingsSchema>;

// ── Anti-Raid ──────────────────────────────────────────────────────

export const AntiRaidSettingsSchema = z.object({
  joinThreshold: z.number().default(5), // 5 joins
  timeWindow: z.number().default(10), // in 10 seconds
  action: z.literal(["lockdown", "kick", "ban"]).default("lockdown"),
  alertChannelId: z.string().optional(),
});

export type AntiRaidSettingsType = z.infer<typeof AntiRaidSettingsSchema>;

// ── Shared Panel Embed Config ──────────────────────────────────────

export const PanelEmbedSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  /** Hex color string, e.g. "#5865F2" */
  color: z.string().optional(),
});

export type PanelEmbedConfig = z.infer<typeof PanelEmbedSchema>;

// ── Verification (Enhanced) ─────────────────────────────────────────

export const VerificationButtonSchema = z.object({
  id: z.string(),
  label: z.string().max(80),
  emoji: z.string().optional(),
  style: z.literal(["Primary", "Secondary", "Success", "Danger"]).default("Success"),
  roleId: z.string(),
});

export type VerificationButtonConfig = z.infer<typeof VerificationButtonSchema>;

export const VerificationSettingsSchema = z.object({
  /** Channel where the panel was last deployed */
  verificationChannelId: z.string().optional(),
  /** Discord message ID of the deployed panel (for in-place edits) */
  verificationMessageId: z.string().optional(),
  /** Optional embed shown above the buttons */
  embed: PanelEmbedSchema.optional(),
  /** Button definitions — up to 5 per row, max 5 rows = 25 total */
  buttons: z.array(VerificationButtonSchema).default([]),
});

export type VerificationSettingsType = z.infer<typeof VerificationSettingsSchema>;

// ── Tickets ────────────────────────────────────────────────────────

/**
 * A single text-input question shown in the pre-open modal.
 * Up to 5 per ticket type (Discord modal component limit).
 */
export const TicketQuestionSchema = z.object({
  /** Unique key — used as the Discord TextInput customId to retrieve the answer. */
  id: z.string(),
  /** Displayed inside the modal (≤45 chars — Discord TextInput label limit). */
  label: z.string().max(45),
  placeholder: z.string().max(100).optional(),
  required: z.boolean().default(true),
  /** "short" = single-line, "paragraph" = multi-line textarea. */
  style: z.literal(["short", "paragraph"]).default("short"),
  minLength: z.number().min(0).max(4000).optional(),
  maxLength: z.number().min(1).max(4000).optional(),
});

export type TicketQuestionConfig = z.infer<typeof TicketQuestionSchema>;

/**
 * A single configurable ticket category (e.g. "Billing", "Bug Report").
 * Up to 5 types are shown as buttons on the panel; 6-25 fall back to
 * a select menu automatically.
 */
export const TicketTypeSchema = z.object({
  id: z.string(),
  name: z.string().max(80),
  emoji: z.string().optional(),
  /** Short description shown in the select-menu drop-down (≤100 chars) */
  description: z.string().max(100).optional(),
  /** Text channel whose thread list hosts private threads for this type */
  parentChannelId: z.string().optional(),
  /** Staff roles pinged/allowed for this type (falls back to global staffRoleIds) */
  staffRoleIds: z.array(z.string()).default([]),
  embed: PanelEmbedSchema.optional(),
  buttonStyle: z.literal(["Primary", "Secondary", "Success", "Danger"]).default("Primary"),
  /** Questions shown in the pre-open modal for this type (max 5). Empty = no modal for this type. */
  questions: z.array(TicketQuestionSchema).default([]),
});

export type TicketTypeConfig = z.infer<typeof TicketTypeSchema>;

export const TicketsSettingsSchema = z.object({
  // ── Panel deployment ──────────────────────────────────────────────
  panelChannelId: z.string().optional(),
  /** Discord message ID of the deployed panel — used for in-place edits */
  panelMessageId: z.string().optional(),
  panelEmbed: PanelEmbedSchema.optional(),

  // ── Ticket types (empty = single-mode, no type selection shown) ───
  types: z.array(TicketTypeSchema).default([]),

  // ── Fallbacks (used in single-mode or when a type has no override) ─
  /** Default parent text channel for private threads */
  defaultParentChannelId: z.string().optional(),
  /** Global staff roles (pinged on every new ticket, can manage tickets) */
  staffRoleIds: z.array(z.string()).default([]),

  // ── Transcripts ───────────────────────────────────────────────────
  /** Channel where the bot posts the transcript when a ticket closes */
  transcriptChannelId: z.string().optional(),
  /** Also DM the markdown transcript to the ticket opener */
  dmTranscript: z.boolean().default(true),

  // ── Behaviour ─────────────────────────────────────────────────────
  /** Max concurrent open tickets per user (0 = unlimited) */
  maxTicketsPerUser: z.number().default(1),
  /** Thread name template. Variables: {count} {username} {type} */
  namingTemplate: z.string().default("ticket-{count}-{username}"),
  /**
   * Fallback questions for types that define none. Max 5.
   * Empty array = no pre-open modal.
   */
  questions: z.array(TicketQuestionSchema).default([]),
  /**
   * Close ticket threads after this many hours of inactivity (measured by last message).
   * 0 = disabled.
   */
  inactivityHours: z.number().default(0),

  // ── Web transcripts ──────────────────────────────────────────────
  /**
   * Publish a Discord-authenticated web transcript at ticket close, in
   * addition to the markdown attachment. Feature-flagged per guild.
   */
  webTranscripts: z
    .object({
      enabled: z.boolean().default(false),
      /** Null = retain forever. */
      retentionDays: z.number().int().nullable().default(90),
      mirrorAttachments: z.boolean().default(true),
      attachmentMaxSizeBytes: z
        .number()
        .int()
        .positive()
        .default(8 * 1024 * 1024),
    })
    .default({
      enabled: false,
      retentionDays: 90,
      mirrorAttachments: true,
      attachmentMaxSizeBytes: 8 * 1024 * 1024,
    }),

  // ── Internal ──────────────────────────────────────────────────────
  /** Ever-incrementing ticket serial number — do not expose in the UI */
  ticketCounter: z.number().default(0),
});

export type TicketsSettingsType = z.infer<typeof TicketsSettingsSchema>;
/** Convenience alias — matches the other schemas' `<Name>Settings` exports. */
export type TicketsSettings = TicketsSettingsType;

// ── Button Roles (replaces Reaction Roles) ─────────────────────────
//
// The Appwrite module key remains "reaction-roles" for backward compat.
// The UI / bot now calls this feature "Button Roles".

export const ButtonRoleEntrySchema = z.object({
  id: z.string(),
  label: z.string().max(80),
  emoji: z.string().optional(),
  roleId: z.string(),
  style: z.literal(["Primary", "Secondary", "Success", "Danger"]).default("Primary"),
});

export type ButtonRoleEntry = z.infer<typeof ButtonRoleEntrySchema>;

export const ButtonRolesPanelSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Channel where this panel was last deployed */
  channelId: z.string().optional(),
  /** Discord message ID of the deployed panel */
  messageId: z.string().optional(),
  /** "buttons" = up to 5×5 button grid; "dropdown" = single select menu */
  type: z.literal(["buttons", "dropdown"]).default("buttons"),
  embed: PanelEmbedSchema.optional(),
  entries: z.array(ButtonRoleEntrySchema).default([]),
});

export type ButtonRolesPanel = z.infer<typeof ButtonRolesPanelSchema>;

export const ButtonRolesSettingsSchema = z.object({
  panels: z.array(ButtonRolesPanelSchema).default([]),
});

export type ButtonRolesSettingsType = z.infer<typeof ButtonRolesSettingsSchema>;

// Legacy alias — kept so any older code that imports ReactionRolesSettingsType
// still compiles without errors during the migration window.
/** @deprecated Use ButtonRolesSettingsType instead */
export type ReactionRolesSettingsType = ButtonRolesSettingsType;
/** @deprecated Use ButtonRolesSettingsSchema instead */
export const ReactionRolesSettingsSchema = ButtonRolesSettingsSchema;

// ── Polls ──────────────────────────────────────────────────────────

export const PollsSettingsSchema = z.object({
  maxOptions: z.number().default(10), // Limit number of poll options
});

export type PollsSettingsType = z.infer<typeof PollsSettingsSchema>;

// ── Events ────────────────────────────────────────────────────────

export const EventsSettingsSchema = z.object({
  announcementChannelId: z.string().optional(),
  notifyRoleIds: z.array(z.string()).default([]),
});

export type EventsSettingsType = z.infer<typeof EventsSettingsSchema>;

// ── Social Alerts ─────────────────────────────────────────────────

export const SocialAlertSchema = z.object({
  platform: z.enum(["youtube", "twitch", "x", "rss", "github", "tiktok"]),
  handle: z.string(), 
  channelId: z.string(),
  message: z.string().optional(),
});

export const AlertsSettingsSchema = z.object({
  alerts: z.array(SocialAlertSchema).default([]),
});

export type AlertsSettingsType = z.infer<typeof AlertsSettingsSchema>;


