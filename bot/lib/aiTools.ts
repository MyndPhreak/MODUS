import type { Message } from "discord.js";
import type { ModuleManager } from "../ModuleManager";

/** Everything a tool's execute() needs to act on the triggering message. */
export interface AiToolContext {
  guildId: string;
  message: Message; // triggering message: author, member (voice channel), channel
  moduleManager: ModuleManager;
  args: Record<string, unknown>;
}

/** A single AI-callable action, owned by the module that exposes it. */
export interface AiTool {
  /** Unique across ALL modules. Used as the LLM function name. */
  name: string;
  /** What the model reads to decide when to call this. */
  description: string;
  /** Provider-neutral JSON Schema for the arguments (an "object" schema). */
  parameters: Record<string, unknown>;
  /**
   * Optional runtime gate BEYOND module-enabled — e.g. a required env var.
   * Returning false means the tool is not offered to the model this request.
   */
  isAvailable?: (
    ctx: Pick<AiToolContext, "guildId" | "moduleManager">,
  ) => boolean | Promise<boolean>;
  /** Perform the action; return text that is fed back to the model. */
  execute: (ctx: AiToolContext) => Promise<string>;
}

/** OpenAI / Groq / Gemini / OpenAI-Compatible function-tool format. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toOpenAiTools(tools: AiTool[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Anthropic tool format (input_schema instead of parameters). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAnthropicTools(tools: AiTool[]): any[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}
