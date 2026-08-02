// ── AI System Prompt Composition ───────────────────────────────────
// The effective system prompt is layered:
//   CORE_SYSTEM_PROMPT            (immutable rules — always applied)
//   + current date/time context   (appended so relative dates resolve)
//   + guild personality/tone      (appended; owned by the dashboard field)
//   + TOOL_USE_..._APPENDIX        (appended when tool use is enabled)
// The guild field APPENDS to the core; it never replaces it.

/** Identity + behavior rules. No personality — tone lives in the guild field. */
export const CORE_SYSTEM_PROMPT = `You are Modus, a helpful AI assistant built into a Discord bot. \
Be as concise as you can WHILE still giving a COMPLETE answer — always include the specific \
facts, numbers, and details the user actually asked for (e.g. the current temperature, the exact price, \
the actual result) rather than a vague summary that leaves them out. Don't pad, but don't cut the answer short either. \
You can help with questions, have casual conversations, and assist server members. \
Do not pretend to have capabilities you don't have. Stay on topic and be helpful.`;

/** Default tone. Seeds the dashboard field and is used when a guild leaves it blank. */
export const DEFAULT_PERSONALITY =
  `You have a witty, upbeat personality and keep a conversational, friendly tone.`;

/** Appended only when tool use is enabled. */
export const TOOL_USE_SYSTEM_PROMPT_APPENDIX = `You also have direct control over the music player for this Discord server. \
When a user asks you to play, skip, stop, pause, resume, adjust volume, view the queue, or shuffle, \
use the appropriate music tool rather than describing what to do. \
Always execute the action and report what you did.

You can also search the web for current information using the web_search tool. \
Use it when the user asks about recent events, news, live scores, current prices, weather, or anything \
that requires up-to-date information you might not have. \
Do NOT use web_search for general knowledge questions you can already answer accurately.

IMPORTANT — when tools are involved, ACT instead of narrating:
- Never tell the user you are "about to" search, that you'll "look it up", "dig that up", or "try to find" something. \
Do not describe your plan. Just call the tool immediately and silently.
- After a tool returns, reply to the user with the actual answer to their question, using the data from the results.
- If the first results don't clearly contain the answer, call web_search AGAIN with a better query \
(for example add the country/region, or the phrase "current conditions" / "right now") before you respond. \
Try at least twice before telling the user you couldn't find it.
- Your reply to the user must be a finished, complete answer — never a promise to do something next.`;

/**
 * Full default prompts shipped BEFORE the append-model change. Guilds that never
 * customized their prompt have one of these stored verbatim. Treated as "unset"
 * so we don't re-append the old identity text or its "2-4 sentences" instruction.
 * Extend this list if older historical defaults surface.
 */
export const LEGACY_DEFAULT_PROMPTS: string[] = [
  `You are Modus, a helpful and friendly AI assistant built into a Discord bot. \
You have a witty, upbeat personality. Keep responses concise (2-4 sentences max) and conversational. \
You can help with questions, have casual conversations, and assist server members. \
Do not pretend to have capabilities you don't have. Stay on topic and be helpful.`,
];

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A one-line statement of the current date/time, given in UTC so it is
 * unambiguous across guilds. Without this the model has no idea what "today"
 * is and refuses relative-date questions ("next weekend", "tomorrow") instead
 * of answering or reaching for web_search.
 */
export function formatDateContext(now: Date): string {
  const formatted = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
  return `The current date and time is ${formatted}. Use this to resolve relative \
references such as "today", "tonight", "tomorrow", "this weekend", or "next week" \
(times are UTC unless the user names a timezone).`;
}

/**
 * Resolve the guild's stored value into the tone text to append.
 * - empty OR a known legacy default → DEFAULT_PERSONALITY
 * - anything else → the trimmed custom text
 */
export function resolvePersonality(raw: string | null | undefined): string {
  const normalized = normalizeWhitespace(raw ?? "");
  if (!normalized) return DEFAULT_PERSONALITY;
  for (const legacy of LEGACY_DEFAULT_PROMPTS) {
    if (normalizeWhitespace(legacy) === normalized) return DEFAULT_PERSONALITY;
  }
  return (raw ?? "").trim();
}

/**
 * Compose the effective system prompt: core + current date + tone +
 * (optional) tool appendix. `now` is injectable for deterministic tests;
 * it defaults to the moment the message is handled.
 */
export function buildSystemPrompt(
  rawPersonality: string | null | undefined,
  toolUseEnabled: boolean,
  now: Date = new Date(),
): string {
  let prompt = CORE_SYSTEM_PROMPT;
  prompt += "\n\n" + formatDateContext(now);
  const tone = resolvePersonality(rawPersonality);
  if (tone) prompt += "\n\n" + tone;
  if (toolUseEnabled) prompt += "\n\n" + TOOL_USE_SYSTEM_PROMPT_APPENDIX;
  return prompt;
}
