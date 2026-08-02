import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Message,
} from "discord.js";
import http from "http";
import https from "https";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { BotModule, ModuleManager } from "../ModuleManager";
import { AISettingsSchema } from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";
import { buildSystemPrompt } from "../lib/aiPrompt";
import { AiTool, collectAiTools, toOpenAiTools, toAnthropicTools } from "../lib/aiTools";
import { getWeather } from "../lib/weather";

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
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface LLMResponse {
  content: string;
  tool_calls?: ToolCall[]; // Array of tool calls made by the model
  input_tokens: number;
  output_tokens: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[]; // For assistant role
  tool_call_id?: string;   // For tool role
  name?: string;           // For tool role (OpenAI sometimes needs name, Anthropic needs tool_use_id mapped)
}

interface ConversationEntry {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  timestamp: number; // Date.now()
}

// ── Per-Channel Conversation Context Buffer ────────────────────────
// Key: channelId → array of recent exchanges (user + assistant).
// Pruned by TTL and max count before each call.

const channelContext = new Map<string, ConversationEntry[]>();

/** Module-scoped reference to ModuleManager, set during event registration */
let _moduleManager: ModuleManager | null = null;

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
  role: "user" | "assistant" | "tool",
  content: string,
  tool_calls?: ToolCall[],
  tool_call_id?: string,
  name?: string,
) {
  if (!channelContext.has(channelId)) {
    channelContext.set(channelId, []);
  }
  channelContext.get(channelId)!.push({
    role,
    content,
    tool_calls,
    tool_call_id,
    name,
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
    // Add rough estimate for tool_calls size
    const toolTokens = entry.tool_calls ? 50 * entry.tool_calls.length : 0;
    const entryTokens = estimateTokens(entry.content || "") + toolTokens;
    if (tokensUsed + entryTokens > remainingTokenBudget) break;
    result.unshift({
      role: entry.role,
      content: entry.content,
      tool_calls: entry.tool_calls,
      tool_call_id: entry.tool_call_id,
      name: entry.name,
    });
    tokensUsed += entryTokens;
  }

  return result;
}

// ── Cost Estimation ────────────────────────────────────────────────
// `estimated_cost` is a rough analytics figure, not billing. Rather than
// hardcode a price catalog that rots as models and prices change, we read
// optional per-million-token rates from the environment:
//
//   AI_PRICE_INPUT_PER_MTOK   USD per 1M input tokens
//   AI_PRICE_OUTPUT_PER_MTOK  USD per 1M output tokens
//
// If neither is set (e.g. a free-tier provider like Groq), we log exact token
// counts only and leave estimated_cost NULL. Token counts are always accurate;
// the dollar figure is best-effort and opt-in.

function envRate(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const inRate = envRate("AI_PRICE_INPUT_PER_MTOK");
  const outRate = envRate("AI_PRICE_OUTPUT_PER_MTOK");
  const haveIn = inRate !== undefined;
  const haveOut = outRate !== undefined;
  if (!haveIn && !haveOut) return undefined;
  return (
    (haveIn ? (inputTokens / 1_000_000) * inRate! : 0) +
    (haveOut ? (outputTokens / 1_000_000) * outRate! : 0)
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

// ── Unified LLM Caller ─────────────────────────────────────────────

async function callLLM(
  provider: AIProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxOutputTokens: number,
  baseUrl?: string,
  tools: AiTool[] = [],
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
      messages: conversationMessages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "user" as const,
            content: [{
              type: "tool_result" as const,
              tool_use_id: m.tool_call_id!,
              content: m.content
            }]
          };
        } else if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
          const contentBlocks: Anthropic.ContentBlock[] = [];
          if (m.content) {
            contentBlocks.push({ type: "text", text: m.content } as unknown as Anthropic.ContentBlock);
          }
          for (const tc of m.tool_calls) {
            contentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.args
            } as unknown as Anthropic.ContentBlock);
          }
          return { role: "assistant" as const, content: contentBlocks };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      }),
      ...(tools.length ? { tools: toAnthropicTools(tools) } : {}),
    };

    const response = await anthropic.messages.create(createParams);

    // Check for tool use
    if (tools.length && response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
      const textBlock = response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined;
      
      if (toolBlocks.length > 0) {
        return {
          content: textBlock?.text ?? "",
          tool_calls: toolBlocks.map((b) => ({
            id: b.id,
            name: b.name,
            args: b.input as Record<string, unknown>,
          })),
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
      ...conversationMessages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            content: m.content,
            tool_call_id: m.tool_call_id!,
            name: m.name!
          };
        } else if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
          return {
            role: "assistant" as const,
            content: m.content || null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.args) }
            }))
          };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      }),
    ],
    ...(tools.length ? { tools: toOpenAiTools(tools), tool_choice: "auto" } : {}),
  });

  const choice = response.choices[0];
  const usage = response.usage;

  // Check for tool call response
  if (
    tools.length &&
    choice?.finish_reason === "tool_calls" &&
    choice.message?.tool_calls?.length
  ) {
    const tool_calls = choice.message.tool_calls.map((tc: any) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? "{}");
      } catch {
        _moduleManager?.logger.warn("Failed to parse tool call arguments", undefined, "ai");
      }
      return {
        id: tc.id,
        name: tc.function?.name ?? tc.name ?? "",
        args
      };
    });
    return {
      content: choice.message.content ?? "",
      tool_calls,
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

// ── Web Search ─────────────────────────────────────────────────────

// Compose the SearXNG query URL. `category` picks the vertical (general|news);
// `timeRange` (day|week|month) restricts recency when provided.
export function buildSearchUrl(
  baseUrl: string,
  query: string,
  category: string,
  timeRange?: string,
): string {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: category,
    language: "en",
  });
  if (timeRange) params.set("time_range", timeRange);
  return `${baseUrl}/search?${params.toString()}`;
}

async function performWebSearch(
  query: string,
  category: string = "general",
  timeRange?: string,
): Promise<string> {
  const baseUrl = process.env.SEARXNG_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("SEARXNG_URL not configured");

  const searchUrl = buildSearchUrl(baseUrl, query, category, timeRange);
  const parsed = new URL(searchUrl);
  const requester = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const req = requester.get(
      searchUrl,
      { headers: { "Accept": "application/json" } },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          done(() => reject(new Error(`SearXNG returned HTTP ${res.statusCode}`)));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const results: { title: string; url: string; content?: string }[] =
              (json.results ?? []).slice(0, 5);
            if (!results.length) {
              done(() => resolve("No results found."));
              return;
            }
            const formatted = results
              .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content ?? ""}`)
              .join("\n\n");
            done(() => resolve(formatted));
          } catch {
            // SearXNG likely returned HTML — JSON format probably not enabled
            done(() => reject(new Error(
              "SearXNG returned a non-JSON response. Enable JSON format in SearXNG settings.yml: search.formats: [html, json]"
            )));
          }
        });
      },
    );
    req.on("error", (err) => done(() => reject(err)));
    req.setTimeout(8000, () => {
      req.destroy();
      done(() => reject(new Error("Search request timed out after 8s")));
    });
  });
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

const DEFAULT_SETTINGS: Required<AIModuleSettings> = {
  aiProvider: "Groq",
  aiApiKey: "",
  aiModel: "llama-3.3-70b-versatile",
  aiBaseUrl: "",
  systemPrompt: "",
  maxInputTokens: 500,
  maxOutputTokens: 512,
  rateLimitSeconds: 60,
  respondToDMs: false,
  toolUseEnabled: false,
  contextEnabled: true,
  contextMessageCount: 5,
  contextTTLMinutes: 15,
};

// ── Core AI tools (owned by the ai module itself) ──────────────────
const aiCoreTools: AiTool[] = [
  {
    name: "web_search",
    description:
      "Search the web for current, real-time information (recent events, news, prices, live scores, facts). For headlines or 'latest' questions, set category='news' and recency='day'. Use category='general' for stock prices, sports scores, and factual lookups. ALWAYS include the location or country in the query when the question is location-specific. (For weather, use get_weather instead.)",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Include location/country when relevant, e.g. 'election results South Carolina'.",
        },
        category: {
          type: "string",
          enum: ["general", "news"],
          description: "'news' for headlines/current events; 'general' (default) for everything else.",
        },
        recency: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Restrict to recent results. Use 'day' for today's news. Omit for timeless queries.",
        },
      },
      required: ["query"],
    },
    isAvailable: () => !!process.env.SEARXNG_URL,
    execute: async ({ args }) => {
      const query = (args.query as string) || "";
      if (!query) return "❌ I need a search query to look something up.";
      if (!process.env.SEARXNG_URL) {
        return "❌ Web search isn't configured. The bot owner needs to set `SEARXNG_URL` to a running SearXNG instance.";
      }
      const category = args.category === "news" ? "news" : "general";
      const recency = args.recency;
      const timeRange =
        recency === "day" || recency === "week" || recency === "month" ? recency : undefined;
      const results = await performWebSearch(query, category, timeRange);
      return results.slice(0, 3200);
    },
  },
  {
    name: "get_weather",
    description:
      "Get current weather and a 7-day forecast for a location. Use this for ANY weather question — current conditions or the forecast for a specific day (today, tomorrow, this weekend). Prefer this over web_search for weather.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "City, with state/country if ambiguous, e.g. 'North Augusta SC' or 'Tokyo'.",
        },
      },
      required: ["location"],
    },
    execute: async ({ args }) => getWeather((args.location as string) || ""),
  },
];

// ── Module Definition ──────────────────────────────────────────────

const aiModule: BotModule = {
  name: "ai",
  aiTools: aiCoreTools,
  registerEvents: registerAIEvents,
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

    const db = moduleManager.databaseService;

    switch (subcommand) {
      case "status": {
        const isEnabled = await db.isModuleEnabled(guildId, "ai");
        const settings = await db.getModuleSettings(guildId, "ai");
        const merged: AIModuleSettings =
          parseSettings(AISettingsSchema, settings, "ai", guildId) ??
          DEFAULT_SETTINGS;
        const isPremium = await db.isGuildPremium(guildId);
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
            `Tool use: ${merged.toolUseEnabled ? "✅" : "❌"}`,
            `Web search: ${merged.toolUseEnabled && process.env.SEARXNG_URL ? "✅" : "❌"}`,
          ].join("\n"),
        );
        break;
      }

      case "disable": {
        await db.setModuleStatus(guildId, "ai", false);
        await interaction.editReply("✅ AI module has been disabled.");
        break;
      }
    }
  },
};

// ── Event Registration ─────────────────────────────────────────────

export function registerAIEvents(moduleManager: ModuleManager) {
  _moduleManager = moduleManager;
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

      const db = moduleManager.databaseService;

      // ─ Module enabled check ─────────────────────────────────────
      const isEnabled = await db.isModuleEnabled(guildId, "ai");
      if (!isEnabled) return;

      // ─ Load settings ────────────────────────────────────────────
      const savedSettings = await db.getModuleSettings(guildId, "ai");
      const settings: Required<AIModuleSettings> = (parseSettings(
        AISettingsSchema,
        savedSettings,
        "ai",
        guildId,
      ) as Required<AIModuleSettings>) ?? {
        ...DEFAULT_SETTINGS,
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
        const isPremium = await db.isGuildPremium(guildId);
        if (!isPremium) {
          await message.reply(
            "⚠️ The AI module requires either a guild-provided API key or a **Premium** subscription for hosted AI. Configure your key in the dashboard or contact the bot owner.",
          );
          return;
        }

        // 1️⃣ Try admin-set global config (Postgres, via guild_configs)
        const globalConfig = await db.getGlobalAIConfig();

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
        settings.maxOutputTokens = 512;
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

      // Gather the tools this guild may use right now (enabled modules only).
      const { tools: aiTools, lookup: aiToolLookup } = settings.toolUseEnabled
        ? await collectAiTools(moduleManager, guildId)
        : { tools: [] as AiTool[], lookup: new Map<string, AiTool>() };

      // ─ Build effective system prompt ─────────────────────────────
      // Core rules (always) + guild personality (appended) + tool appendix.
      const effectiveSystemPrompt = buildSystemPrompt(
        settings.systemPrompt,
        aiTools.length > 0,
      );

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
            moduleManager.logger.info(
              `Including ${contextMessages.length} context messages for channel ${channelId}`,
              guildId,
              "ai",
            );
          }
        }
      }

      // Add the new user message
      llmMessages.push({ role: "user", content: trimmedMessage });
      const newMessagesStartIndex = llmMessages.length - 1;

      // ─ Agent Loop ─────────────────────────────────────────────
      let reply = "";
      let action: "chat" | "tool_use" = "chat";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let iterations = 0;
      const MAX_ITERATIONS = 5;

      while (iterations < MAX_ITERATIONS) {
        iterations++;

        moduleManager.logger.info(
          `Calling LLM (iter ${iterations}): provider=${settings.aiProvider}, model=${settings.aiModel}, baseUrl=${settings.aiBaseUrl || "(default)"}, toolUse=${settings.toolUseEnabled}, messages=${llmMessages.length}`,
          guildId,
          "ai",
        );

        const result = await callLLM(
          settings.aiProvider,
          apiKey,
          settings.aiModel,
          llmMessages,
          settings.maxOutputTokens,
          settings.aiBaseUrl || undefined,
          aiTools,
        );

        totalInputTokens += result.input_tokens;
        totalOutputTokens += result.output_tokens;

        if (result.tool_calls && result.tool_calls.length > 0) {
          action = "tool_use";
          
          // Append the assistant's tool calls to the message history
          llmMessages.push({
            role: "assistant",
            content: result.content || "",
            tool_calls: result.tool_calls
          });

          // Execute all tools in parallel
          const toolPromises = result.tool_calls.map(async (tc) => {
            moduleManager.logger.info(
              `[AI] Tool call: ${tc.name}(${JSON.stringify(tc.args)}) for ${message.author.tag}`,
              guildId,
              "ai",
            );
            
            try {
              if ("sendTyping" in message.channel) {
                await message.channel.sendTyping().catch(() => {});
              }
              const tool = aiToolLookup.get(tc.name);
              const execResult = tool
                ? await tool.execute({ guildId, message, moduleManager, args: tc.args })
                : `❓ I tried to use an unknown tool: \`${tc.name}\`. That's a bug — please report it!`;
              return {
                role: "tool" as const,
                content: execResult,
                tool_call_id: tc.id,
                name: tc.name
              };
            } catch (toolErr: any) {
              moduleManager.logger.error("Tool execution error", guildId, toolErr, "ai");
              return {
                role: "tool" as const,
                content: `❌ ${toolErr?.message ?? "Something went wrong."}`,
                tool_call_id: tc.id,
                name: tc.name
              };
            }
          });

          const toolResults = await Promise.all(toolPromises);
          
          // Append tool results to message history and loop again
          llmMessages.push(...toolResults);
          
        } else {
          // No tool calls, we have our final text reply
          reply = result.content.slice(0, 1990) || "🤔 I got nothing on that one.";
          break;
        }
      }

      if (iterations >= MAX_ITERATIONS && !reply) {
         reply = "⚠️ I had to stop thinking because it took too many steps. Here is what I have so far.";
      }

      await message.reply(reply);

      // ─ Push to context buffer ────────────────────────────────────
      if (settings.contextEnabled) {
        const channelId = message.channel.id;
        // Push all new messages (user request + any assistant tool calls + any tool results + final reply)
        const newMessages = llmMessages.slice(newMessagesStartIndex);
        for (const m of newMessages) {
           pushContext(channelId, m.role as "user" | "assistant" | "tool", m.content, m.tool_calls, m.tool_call_id, m.name);
        }
        if (reply && newMessages[newMessages.length - 1].content !== reply) {
           // Fallback in case loop exited strangely and the final reply wasn't pushed
           pushContext(channelId, "assistant", reply);
        }
      }

      // ─ Log usage ─────────────────────────────────────────────────
      const cost = estimateCost(totalInputTokens, totalOutputTokens);

      await db.logAIUsage({
        guildId,
        userId: message.author.id,
        provider: settings.aiProvider,
        model: settings.aiModel,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
        ...(cost !== undefined ? { estimated_cost: cost } : {}),
        action,
        key_source: keySource,
      });

      moduleManager.logger.info(
        `[AI] ${message.author.tag} → ${totalInputTokens + totalOutputTokens} tokens (${settings.aiProvider}/${settings.aiModel}) [${keySource} key] [${action}]`,
        guildId,
        "ai",
      );
    } catch (err: any) {
      moduleManager.logger.error("Error handling message", message.guildId ?? undefined, err, "ai");

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

  // ── Periodic Cleanup: cooldownMap & channelContext ──
  // Prevent unbounded memory growth
  const CLEANUP_INTERVAL_MS = 5 * 60_000;
  setInterval(() => {
    const now = Date.now();
    let evictedCooldowns = 0;
    let evictedContexts = 0;

    // Evict expired cooldowns (entries older than 5 minutes are definitely stale)
    for (const [key, ts] of cooldownMap) {
      if (now - ts > 5 * 60_000) {
        cooldownMap.delete(key);
        evictedCooldowns++;
      }
    }

    // Evict channel contexts where ALL entries are older than the max TTL (30min)
    const MAX_CONTEXT_TTL = 30 * 60_000;
    for (const [channelId, entries] of channelContext) {
      const newest = entries[entries.length - 1];
      if (!newest || now - newest.timestamp > MAX_CONTEXT_TTL) {
        channelContext.delete(channelId);
        evictedContexts++;
      }
    }

    if (evictedCooldowns > 0 || evictedContexts > 0) {
      moduleManager.logger.info(
        `Cache cleanup: evicted ${evictedCooldowns} cooldowns, ${evictedContexts} contexts (cooldowns=${cooldownMap.size}, contexts=${channelContext.size})`,
        undefined,
        "ai",
      );
    }
  }, CLEANUP_INTERVAL_MS);

  moduleManager.logger.info("messageCreate event listener registered.", undefined, "ai");
}

export default aiModule;
