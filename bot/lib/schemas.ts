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
