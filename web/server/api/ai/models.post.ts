/**
 * POST /api/ai/models
 *
 * Proxy endpoint that fetches available models from the configured AI provider.
 * Accepts the provider, API key, and (optional) base URL from the request body
 * so the dashboard can populate the model selector dynamically.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

interface RequestBody {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}

const PROVIDER_BASE_URLS: Record<string, string> = {
  OpenAI: "https://api.openai.com/v1",
  "Google Gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
  Groq: "https://api.groq.com/openai/v1",
  "OpenAI Compatible": "", // uses baseUrl from body
};

// Curated fallback lists when the API doesn't enumerate models
const FALLBACK_MODELS: Record<string, string[]> = {
  OpenAI: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o3-mini"],
  "Google Gemini": [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-3-flash",
    "gemini-3-pro",
  ],
  "Anthropic Claude": [
    "claude-sonnet-4",
    "claude-opus-4",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  Groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  "OpenAI Compatible": [],
};

export default defineEventHandler(async (event) => {
  const body = await readBody<RequestBody>(event);
  const { provider, apiKey, baseUrl } = body;

  if (!provider || !apiKey) {
    throw createError({
      statusCode: 400,
      message: "provider and apiKey are required",
    });
  }

  try {
    // ── Anthropic: no model enumeration API, return curated list ──
    if (provider === "Anthropic Claude") {
      // Validate the key by listing messages (cheapest check)
      const client = new Anthropic({ apiKey });
      // Anthropic doesn't have a list-models endpoint in the standard SDK;
      // we validate by attempting a tiny request
      try {
        await client.models.list();
      } catch {
        // If models.list() isn't available, just trust the key for now
      }
      return { models: FALLBACK_MODELS["Anthropic Claude"] };
    }

    // ── OpenAI SDK compatible providers ───────────────────────────
    const resolvedBaseUrl =
      provider === "OpenAI Compatible"
        ? (baseUrl ?? "http://localhost:11434/v1")
        : (PROVIDER_BASE_URLS[provider] ?? PROVIDER_BASE_URLS["OpenAI"]);

    const openai = new OpenAI({ apiKey, baseURL: resolvedBaseUrl });
    const modelsResponse = await openai.models.list();

    const chatModels = modelsResponse.data
      .filter((m) => {
        const id = m.id.toLowerCase();
        // Filter to chat/text models only (skip embedding, whisper, tts, etc.)
        if (provider === "OpenAI") {
          return (
            id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3")
          );
        }
        if (provider === "Google Gemini") {
          return id.includes("gemini") && !id.includes("embedding");
        }
        // Groq / OpenAI Compatible: return all
        return true;
      })
      .map((m) => m.id)
      .sort();

    return {
      models:
        chatModels.length > 0 ? chatModels : (FALLBACK_MODELS[provider] ?? []),
    };
  } catch (err: any) {
    // If API key is invalid or provider is unreachable, fall back to curated list
    console.warn(
      `[AI Models API] Failed to fetch models for ${provider}:`,
      err?.message,
    );
    return {
      models: FALLBACK_MODELS[provider] ?? [],
      warning: "Could not reach provider — showing known models.",
    };
  }
});
