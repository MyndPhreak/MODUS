import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Message,
  GuildMember,
} from "discord.js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { BotModule, ModuleManager } from "../ModuleManager";
import {
  musicPlay,
  musicSkip,
  musicStop,
  musicPause,
  musicResume,
  musicSetVolume,
  musicGetQueue,
  musicGetNowPlaying,
  musicShuffle,
} from "./music";

// ── Types ──────────────────────────────────────────────────────────

export type AIProvider =
  | "OpenAI"
  | "Google Gemini"
  | "Anthropic Claude"
  | "Groq"
  | "OpenAI Compatible";

export interface AIModuleSettings {
  // Provider config
  aiProvider: AIProvider;
  aiApiKey?: string; // Guild-provided key (overrides shared bot key)
  aiModel?: string; // e.g. 'llama-3.3-70b-versatile'
  aiBaseUrl?: string; // Only for OpenAI Compatible providers

  // Personality
  systemPrompt?: string;

  // Limits
  maxInputTokens?: number; // Max tokens in user message (default: 500)
  maxOutputTokens?: number; // Max tokens in AI response (default: 300)

  // Rate limiting
  rateLimitSeconds?: number; // Per-user cooldown in seconds

  // Toggles
  respondToDMs?: boolean;
  toolUseEnabled?: boolean;

  // Context & Memory (Phase 3)
  contextEnabled?: boolean; // Enable conversation context (default: true)
  contextMessageCount?: number; // Max messages to remember per channel (default: 5)
  contextTTLMinutes?: number; // How long to remember context (default: 15)
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface LLMResponse {
  content: string;
  tool_call?: ToolCall; // set when the model chose a tool instead of text
  input_tokens: number;
  output_tokens: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: number; // Date.now()
}

// ── Per-Channel Conversation Context Buffer ────────────────────────
// Key: channelId → array of recent exchanges (user + assistant).
// Pruned by TTL and max count before each call.

const channelContext = new Map<string, ConversationEntry[]>();

function pruneContext(
  channelId: string,
  maxCount: number,
  ttlMinutes: number,
): ConversationEntry[] {
  const entries = channelContext.get(channelId);
  if (!entries || entries.length === 0) return [];

  const cutoff = Date.now() - ttlMinutes * 60 * 1000;

  // Drop entries older than the TTL
  const fresh = entries.filter((e) => e.timestamp >= cutoff);

  // Keep only the last N entries
  const trimmed = fresh.slice(-maxCount);

  // Update the map
  if (trimmed.length === 0) {
    channelContext.delete(channelId);
  } else {
    channelContext.set(channelId, trimmed);
  }

  return trimmed;
}

function pushContext(
  channelId: string,
  role: "user" | "assistant",
  content: string,
) {
  if (!channelContext.has(channelId)) {
    channelContext.set(channelId, []);
  }
  channelContext.get(channelId)!.push({
    role,
    content,
    timestamp: Date.now(),
  });
}

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build the context messages that fit within the remaining token budget.
 * Returns an array of ChatMessage entries (oldest first) that fit.
 */
function buildContextMessages(
  entries: ConversationEntry[],
  remainingTokenBudget: number,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  let tokensUsed = 0;

  // Walk backwards from most recent, collect entries that fit
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const entryTokens = estimateTokens(entry.content);
    if (tokensUsed + entryTokens > remainingTokenBudget) break;
    result.unshift({ role: entry.role, content: entry.content });
    tokensUsed += entryTokens;
  }

  return result;
}

// ── Cost Estimation ────────────────────────────────────────────────
// Approximate per-million-token pricing (input / output) in USD

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Anthropic
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-haiku-3-5": { input: 0.8, output: 4.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.8, output: 4.0 },
  // Google Gemini
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-pro": { input: 3.5, output: 10.5 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  // Groq (free tier — cost is ~0)
  "llama-3.3-70b-versatile": { input: 0.0, output: 0.0 },
  "llama-3.1-8b-instant": { input: 0.0, output: 0.0 },
  "mixtral-8x7b-32768": { input: 0.0, output: 0.0 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Exact match → prefix match → default to 0
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    const prefix = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
    pricing = prefix ? MODEL_PRICING[prefix] : { input: 0, output: 0 };
  }
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

// ── Provider Base URL Resolution ───────────────────────────────────

function resolveBaseUrl(provider: AIProvider, customUrl?: string): string {
  switch (provider) {
    case "OpenAI":
      return "https://api.openai.com/v1";
    case "Google Gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai/";
    case "Groq":
      return "https://api.groq.com/openai/v1";
    case "OpenAI Compatible":
      return customUrl || "http://localhost:11434/v1";
    case "Anthropic Claude":
      return ""; // handled separately
    default:
      return "https://api.openai.com/v1";
  }
}

// ── Tool Schema Definitions ────────────────────────────────────────
// OpenAI function-calling format (also used by Groq, Gemini, OpenAI Compatible).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OPENAI_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "play_music",
      description:
        "Play a song or add it to the music queue. Use this when the user wants to play, queue, or listen to music.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The song name, artist name, or a YouTube/Spotify URL to play.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "skip_track",
      description: "Skip the currently playing track and move to the next one.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_music",
      description: "Stop all music playback and clear the entire queue.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_music",
      description: "Pause the currently playing track.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "resume_music",
      description: "Resume a paused track.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_volume",
      description:
        "Set the playback volume to a specific percentage between 1 and 100.",
      parameters: {
        type: "object",
        properties: {
          level: {
            type: "number",
            description: "Volume level from 1 to 100.",
          },
        },
        required: ["level"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_queue",
      description:
        "Show what is currently in the music queue, including what is playing and what is up next.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nowplaying",
      description:
        "Show information about the track that is currently playing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "shuffle_queue",
      description: "Shuffle the tracks in the music queue into a random order.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// Anthropic tool format (input_schema instead of parameters)
const ANTHROPIC_TOOLS: Anthropic.Tool[] = OPENAI_TOOLS.map((t) => ({
  name: (t.function as any).name as string,
  description: ((t.function as any).description ?? "") as string,
  input_schema: (t.function as any).parameters as Anthropic.Tool.InputSchema,
}));

// ── Unified LLM Caller ─────────────────────────────────────────────

async function callLLM(
  provider: AIProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxOutputTokens: number,
  baseUrl?: string,
  toolsEnabled?: boolean,
): Promise<LLMResponse> {
  // Separate out system prompt from conversation messages
  const systemMsg = messages.find((m) => m.role === "system");
  const systemPrompt = systemMsg?.content ?? "";
  const conversationMessages = messages.filter((m) => m.role !== "system");
  // ── Anthropic path ──────────────────────────────────────────────
  if (provider === "Anthropic Claude") {
    const anthropic = new Anthropic({ apiKey });

    const createParams: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxOutputTokens,
      system: systemPrompt,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      ...(toolsEnabled ? { tools: ANTHROPIC_TOOLS } : {}),
    };

    const response = await anthropic.messages.create(createParams);

    // Check for tool use
    if (toolsEnabled && response.stop_reason === "tool_use") {
      const toolBlock = response.content.find((b) => b.type === "tool_use") as
        | Anthropic.ToolUseBlock
        | undefined;
      if (toolBlock) {
        return {
          content: "",
          tool_call: {
            name: toolBlock.name,
            args: toolBlock.input as Record<string, unknown>,
          },
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        };
      }
    }

    const textBlock = response.content.find((b) => b.type === "text") as
      | Anthropic.TextBlock
      | undefined;
    return {
      content: textBlock?.text ?? "",
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    };
  }

  // ── OpenAI-compatible path (OpenAI, Groq, Gemini, OpenAI Compatible) ──
  const openai = new OpenAI({
    apiKey,
    baseURL: resolveBaseUrl(provider, baseUrl),
  });

  const response = await openai.chat.completions.create({
    model,
    max_tokens: maxOutputTokens,
    messages: [
      { role: "system" as const, content: systemPrompt },
      ...conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
    ...(toolsEnabled ? { tools: OPENAI_TOOLS, tool_choice: "auto" } : {}),
  });

  const choice = response.choices[0];
  const usage = response.usage;

  // Check for tool call response
  if (
    toolsEnabled &&
    choice?.finish_reason === "tool_calls" &&
    choice.message?.tool_calls?.length
  ) {
    const tc = choice.message.tool_calls[0];
    const tcAny = tc as any;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tcAny.function?.arguments ?? "{}");
    } catch {
      // malformed JSON from model — treat as chat
      console.warn(
        "[AI] Failed to parse tool call arguments:",
        tcAny.function?.arguments,
      );
    }
    return {
      content: "",
      tool_call: { name: tcAny.function?.name ?? tcAny.name ?? "", args },
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    };
  }

  return {
    content: choice?.message?.content ?? "",
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
  };
}

// ── Tool Router ────────────────────────────────────────────────────
// Executes the tool call returned by the LLM and returns the result message.

async function executeToolCall(
  toolCall: ToolCall,
  message: Message,
  guildId: string,
  moduleManager: ModuleManager,
): Promise<string> {
  const { name, args } = toolCall;

  // All music tools require the music module to be enabled
  const isMusicEnabled = await moduleManager.appwriteService.isModuleEnabled(
    guildId,
    "music",
  );
  if (!isMusicEnabled) {
    return "❌ The music module is not enabled on this server. Ask an admin to enable it in the dashboard.";
  }

  switch (name) {
    case "play_music": {
      const query = (args.query as string) || "";
      if (!query) return "❌ I need a song name or URL to play something.";

      // Resolve the user's voice channel from the message member
      const member = message.member as GuildMember | null;
      const voiceChannel = member?.voice?.channel;
      if (!voiceChannel) {
        return "❌ You need to be in a voice channel for me to play music!";
      }

      const result = await musicPlay(
        guildId,
        voiceChannel,
        query,
        message.author,
        moduleManager,
        message.channel as any,
      );
      return result.message;
    }

    case "skip_track": {
      const result = await musicSkip(guildId);
      return result.message;
    }

    case "stop_music": {
      const result = await musicStop(guildId, moduleManager);
      return result.message;
    }

    case "pause_music": {
      const result = await musicPause(guildId);
      return result.message;
    }

    case "resume_music": {
      const result = await musicResume(guildId);
      return result.message;
    }

    case "set_volume": {
      const level =
        typeof args.level === "number" ? args.level : Number(args.level);
      if (isNaN(level))
        return "❌ Please specify a valid volume level (1–100).";
      const result = await musicSetVolume(guildId, level, moduleManager);
      return result.message;
    }

    case "get_queue": {
      const result = await musicGetQueue(guildId);
      return result.message;
    }

    case "get_nowplaying": {
      const result = await musicGetNowPlaying(guildId);
      return result.message;
    }

    case "shuffle_queue": {
      const result = await musicShuffle(guildId);
      return result.message;
    }

    default:
      return `❓ I tried to use an unknown tool: \`${name}\`. That's a bug — please report it!`;
  }
}

// ── Rate Limiting ──────────────────────────────────────────────────
// In-memory cooldown map: "guildId:userId" → last call timestamp (ms)

const cooldownMap = new Map<string, number>();

function isOnCooldown(
  guildId: string,
  userId: string,
  cooldownSeconds: number,
): boolean {
  const key = `${guildId}:${userId}`;
  const lastCall = cooldownMap.get(key);
  if (!lastCall) return false;
  return Date.now() - lastCall < cooldownSeconds * 1000;
}

function setCooldown(guildId: string, userId: string) {
  cooldownMap.set(`${guildId}:${userId}`, Date.now());
}

function getCooldownRemaining(
  guildId: string,
  userId: string,
  cooldownSeconds: number,
): number {
  const key = `${guildId}:${userId}`;
  const lastCall = cooldownMap.get(key);
  if (!lastCall) return 0;
  const elapsed = (Date.now() - lastCall) / 1000;
  return Math.max(0, cooldownSeconds - elapsed);
}

// ── Defaults ───────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are Modus, a helpful and friendly AI assistant built into a Discord bot. \
You have a witty, upbeat personality. Keep responses concise (2-4 sentences max) and conversational. \
You can help with questions, have casual conversations, and assist server members. \
Do not pretend to have capabilities you don't have. Stay on topic and be helpful.`;

const TOOL_USE_SYSTEM_PROMPT_APPENDIX = `

You also have direct control over the music player for this Discord server. \
When a user asks you to play, skip, stop, pause, resume, adjust volume, view the queue, or shuffle, \
use the appropriate music tool rather than describing what to do. \
Always execute the action and report what you did.`;

const DEFAULT_SETTINGS: Required<AIModuleSettings> = {
  aiProvider: "Groq",
  aiApiKey: "",
  aiModel: "llama-3.3-70b-versatile",
  aiBaseUrl: "",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxInputTokens: 500,
  maxOutputTokens: 300,
  rateLimitSeconds: 60,
  respondToDMs: false,
  toolUseEnabled: false,
  contextEnabled: true,
  contextMessageCount: 5,
  contextTTLMinutes: 15,
};

// ── Module Definition ──────────────────────────────────────────────

const aiModule: BotModule = {
  name: "ai",
  description: "AI conversational assistant — @mention the bot to chat",
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Configure the AI assistant module")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Show AI module status and current configuration"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable the AI module for this server"),
    )
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const appwrite = moduleManager.appwriteService;

    switch (subcommand) {
      case "status": {
        const isEnabled = await appwrite.isModuleEnabled(guildId, "ai");
        const settings = await appwrite.getModuleSettings(guildId, "ai");
        const merged: AIModuleSettings = { ...DEFAULT_SETTINGS, ...settings };
        const isPremium = await appwrite.isGuildPremium(guildId);
        const hasOwnKey = !!merged.aiApiKey;

        const keyStatus = hasOwnKey
          ? "✅ Using guild-provided API key"
          : isPremium
            ? "✅ Using Modus shared key (Premium)"
            : "❌ No key — configure one in the dashboard or contact bot owner for Premium";

        await interaction.editReply(
          [
            `**🤖 AI Module Status**`,
            `Enabled: ${isEnabled ? "✅" : "❌"}`,
            `Provider: \`${merged.aiProvider}\``,
            `Model: \`${merged.aiModel}\``,
            `Key: ${keyStatus}`,
            `Cooldown: \`${merged.rateLimitSeconds}s\` per user`,
            `DM responses: ${merged.respondToDMs ? "✅" : "❌"}`,
            `Tool use (music): ${merged.toolUseEnabled ? "✅" : "❌"}`,
          ].join("\n"),
        );
        break;
      }

      case "disable": {
        await appwrite.setModuleStatus(guildId, "ai", false);
        await interaction.editReply("✅ AI module has been disabled.");
        break;
      }
    }
  },
};

// ── Event Registration ─────────────────────────────────────────────

export function registerAIEvents(moduleManager: ModuleManager) {
  const client = moduleManager["client"];

  client.on("messageCreate", async (message: Message) => {
    try {
      // Ignore bots
      if (message.author.bot) return;

      // Must @mention this bot
      if (!client.user || !message.mentions.has(client.user)) return;

      const guildId = message.guildId;

      // DM handling — off by default
      if (!guildId) return;

      const appwrite = moduleManager.appwriteService;

      // ─ Module enabled check ─────────────────────────────────────
      const isEnabled = await appwrite.isModuleEnabled(guildId, "ai");
      if (!isEnabled) return;

      // ─ Load settings ────────────────────────────────────────────
      const savedSettings = await appwrite.getModuleSettings(guildId, "ai");
      const settings: Required<AIModuleSettings> = {
        ...DEFAULT_SETTINGS,
        ...savedSettings,
      };

      // ─ Determine API key & key source ───────────────────────────
      const guildHasKey = !!settings.aiApiKey;
      let apiKey: string;
      let keySource: "guild" | "shared";

      if (guildHasKey) {
        apiKey = settings.aiApiKey;
        keySource = "guild";
      } else {
        // ── No guild key: check premium + global config ──────────
        const isPremium = await appwrite.isGuildPremium(guildId);
        if (!isPremium) {
          await message.reply(
            "⚠️ The AI module requires either a guild-provided API key or a **Premium** subscription for hosted AI. Configure your key in the dashboard or contact the bot owner.",
          );
          return;
        }

        // 1️⃣ Try admin-set global config from Appwrite
        const globalConfig = await appwrite.getGlobalAIConfig();

        if (globalConfig?.aiApiKey) {
          apiKey = globalConfig.aiApiKey;
          keySource = "shared";
          // Guild's explicitly saved provider/model/baseUrl take priority over the global
          // admin config. We check `savedSettings` (raw DB doc) because `settings` is always
          // fully populated with defaults post-merge, making a falsy check unreliable.
          // The guild's systemPrompt is ALWAYS used regardless of key source.
          if (!savedSettings.aiProvider)
            settings.aiProvider = globalConfig.aiProvider ?? "Groq";
          if (!savedSettings.aiModel)
            settings.aiModel =
              globalConfig.aiModel ?? "llama-3.3-70b-versatile";
          if (!savedSettings.aiBaseUrl && globalConfig.aiBaseUrl)
            settings.aiBaseUrl = globalConfig.aiBaseUrl;
        } else if (process.env.AI_API_KEY) {
          // 2️⃣ Fall back to bot .env vars — guild's systemPrompt is still honored.
          apiKey = process.env.AI_API_KEY;
          keySource = "shared";
          // Only apply env-level defaults if the guild hasn't explicitly set their own values.
          if (!savedSettings.aiProvider)
            settings.aiProvider =
              (process.env.AI_PROVIDER as AIProvider) ?? "Groq";
          if (!savedSettings.aiModel)
            settings.aiModel =
              process.env.AI_MODEL ?? "llama-3.3-70b-versatile";
          if (!savedSettings.aiBaseUrl && process.env.AI_BASE_URL)
            settings.aiBaseUrl = process.env.AI_BASE_URL;
        } else {
          await message.reply(
            "⚠️ This server has Premium but no AI key is configured. Please ask the Discord Server Owner to set one in the server settings.",
          );
          return;
        }

        // Enforce shared-key token/rate limits regardless of guild settings
        settings.rateLimitSeconds = 60;
        settings.maxInputTokens = 500;
        settings.maxOutputTokens = 300;
      }

      // ─ Rate limit check ─────────────────────────────────────────
      // For shared-key guilds, settings.rateLimitSeconds was already overridden
      // to 60 above. For guild-key guilds, the dashboard-saved value is used.
      const cooldown = settings.rateLimitSeconds;

      if (isOnCooldown(guildId, message.author.id, cooldown)) {
        const remaining = getCooldownRemaining(
          guildId,
          message.author.id,
          cooldown,
        );
        await message.reply(
          `⏳ Please wait **${Math.ceil(remaining)}s** before using me again.`,
        );
        return;
      }

      // Set cooldown immediately to prevent double-fire
      setCooldown(guildId, message.author.id);

      // ─ Strip @mention prefix from user message ──────────────────
      const mentionRegex = new RegExp(`<@!?${client.user!.id}>\\s*`, "gi");
      const userMessage = message.content.replace(mentionRegex, "").trim();

      if (!userMessage) {
        await message.reply("Hey! What can I help you with? 😊");
        return;
      }

      // ─ Enforce input token cap (rough char estimate) ────────────
      // ~4 chars per token; trim if too long
      const maxChars = settings.maxInputTokens * 4;
      const trimmedMessage =
        userMessage.length > maxChars
          ? userMessage.slice(0, maxChars) + "…"
          : userMessage;

      // ─ Defer typing indicator ───────────────────────────────────
      if ("sendTyping" in message.channel) {
        await message.channel.sendTyping().catch(() => {});
      }

      // ─ Build effective system prompt ─────────────────────────────
      // Guard: fall back to default prompt if the guild saved an empty string
      let effectiveSystemPrompt =
        settings.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

      // Append music tool hint when tool use is enabled
      if (settings.toolUseEnabled) {
        effectiveSystemPrompt += TOOL_USE_SYSTEM_PROMPT_APPENDIX;
      }

      // ─ Build messages array with conversation context ────────────
      const channelId = message.channel.id;
      const llmMessages: ChatMessage[] = [
        { role: "system", content: effectiveSystemPrompt },
      ];

      // Add context messages if enabled
      if (settings.contextEnabled) {
        const contextEntries = pruneContext(
          channelId,
          settings.contextMessageCount,
          settings.contextTTLMinutes,
        );

        if (contextEntries.length > 0) {
          // Reserve tokens for the new user message, leave the rest for context
          const newMsgTokens = estimateTokens(trimmedMessage);
          const systemTokens = estimateTokens(effectiveSystemPrompt);
          const remainingBudget = Math.max(
            0,
            settings.maxInputTokens - newMsgTokens - systemTokens,
          );

          const contextMessages = buildContextMessages(
            contextEntries,
            remainingBudget,
          );

          if (contextMessages.length > 0) {
            llmMessages.push(...contextMessages);
            console.log(
              `[AI] Including ${contextMessages.length} context messages for channel ${channelId}`,
            );
          }
        }
      }

      // Add the new user message
      llmMessages.push({ role: "user", content: trimmedMessage });

      // ─ Call the LLM ─────────────────────────────────────────────
      console.log(
        `[AI] Calling LLM: provider=${settings.aiProvider}, model=${settings.aiModel}, baseUrl=${settings.aiBaseUrl || "(default)"}, toolUse=${settings.toolUseEnabled}, messages=${llmMessages.length}`,
      );

      const result = await callLLM(
        settings.aiProvider,
        apiKey,
        settings.aiModel,
        llmMessages,
        settings.maxOutputTokens,
        settings.aiBaseUrl || undefined,
        settings.toolUseEnabled,
      );

      // ─ Handle tool call ──────────────────────────────────────────
      let reply: string;
      let action: "chat" | "tool_use" = "chat";

      if (result.tool_call) {
        action = "tool_use";
        moduleManager.logger.info(
          `[AI] Tool call: ${result.tool_call.name}(${JSON.stringify(result.tool_call.args)}) for ${message.author.tag}`,
          guildId,
          "ai",
        );

        try {
          const toolResult = await executeToolCall(
            result.tool_call,
            message,
            guildId,
            moduleManager,
          );
          reply = toolResult.slice(0, 1990);
        } catch (toolErr: any) {
          console.error("[AI] Tool execution error:", toolErr);
          reply =
            "❌ Something went wrong trying to do that. Please try again.";
        }
      } else {
        // Normal chat response
        reply =
          result.content.slice(0, 1990) || "🤔 I got nothing on that one.";
      }

      await message.reply(reply);

      // ─ Push to context buffer ────────────────────────────────────
      if (settings.contextEnabled) {
        const channelId = message.channel.id;
        pushContext(channelId, "user", trimmedMessage);
        pushContext(channelId, "assistant", reply);
      }

      // ─ Log usage ─────────────────────────────────────────────────
      const totalTokens = result.input_tokens + result.output_tokens;
      const cost = estimateCost(
        settings.aiModel,
        result.input_tokens,
        result.output_tokens,
      );

      await appwrite.logAIUsage({
        guildId,
        userId: message.author.id,
        provider: settings.aiProvider,
        model: settings.aiModel,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        total_tokens: totalTokens,
        estimated_cost: cost,
        action,
        key_source: keySource,
      });

      moduleManager.logger.info(
        `[AI] ${message.author.tag} → ${totalTokens} tokens (${settings.aiProvider}/${settings.aiModel}) [${keySource} key] [${action}]`,
        guildId,
        "ai",
      );
    } catch (err: any) {
      console.error("[AI] Error handling message:", err);

      // Surface a user-friendly error
      const errMsg =
        err?.status === 401
          ? "❌ Invalid API key. Please check the API key in the dashboard."
          : err?.status === 404
            ? `❌ Model not found — \`${(err as any)?.message || "unknown"}\`. Check that the model name is correct for your provider.`
            : err?.status === 429
              ? "❌ Rate limit hit on the AI provider. Please try again shortly."
              : "❌ Something went wrong talking to the AI. Please try again later.";

      try {
        await message.reply(errMsg);
      } catch {}
    }
  });

  console.log("[AI] messageCreate event listener registered.");
}

export default aiModule;
