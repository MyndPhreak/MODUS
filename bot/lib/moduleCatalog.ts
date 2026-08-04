import {
  ApplicationCommandOptionType,
  type APIApplicationCommandOption,
} from "discord.js";
import { BotModule, ModuleManager, SlashCommandData } from "../ModuleManager";

export interface DocsCommandOption {
  name: string;
  description: string;
  /** Human-readable option type, e.g. "String", "Subcommand", "User". */
  type: string;
  required: boolean;
  /** Nested options — populated for Subcommand / SubcommandGroup types. */
  options: DocsCommandOption[];
}

export interface DocsCommand {
  name: string;
  description: string;
  options: DocsCommandOption[];
}

export interface DocsModule {
  name: string;
  description: string;
  commands: DocsCommand[];
}

interface CommandJSON {
  name: string;
  description?: string;
  options?: APIApplicationCommandOption[];
}

function toCommandJSON(cmd: SlashCommandData): CommandJSON {
  if (typeof (cmd as { toJSON?: unknown }).toJSON === "function") {
    return (cmd as { toJSON: () => CommandJSON }).toJSON();
  }
  return cmd as unknown as CommandJSON;
}

function mapOptions(
  options: APIApplicationCommandOption[] | undefined,
): DocsCommandOption[] {
  if (!options) return [];
  return options.map((opt) => ({
    name: opt.name,
    description: opt.description || "",
    type: ApplicationCommandOptionType[opt.type] ?? "Unknown",
    required: "required" in opt ? Boolean(opt.required) : false,
    options: mapOptions(
      (opt as { options?: APIApplicationCommandOption[] }).options,
    ),
  }));
}

/**
 * Builds a plain-data catalog of every registered module's commands and
 * their full option trees. Shared by the /help command and the bot's
 * public GET /api/docs route so the two never drift.
 */
export function buildModuleCatalog(
  moduleManager: ModuleManager,
  opts: { includeHidden?: boolean } = {},
): DocsModule[] {
  const registered = moduleManager.getRegisteredModules();
  const catalog: DocsModule[] = [];

  for (const [, mod] of registered) {
    if (mod.hidden && !opts.includeHidden) continue;

    const commandDefs: SlashCommandData[] =
      mod.commands && mod.commands.length > 0
        ? mod.commands
        : mod.data
          ? [mod.data]
          : [];

    const commands: DocsCommand[] = commandDefs.map((cmd) => {
      const json = toCommandJSON(cmd);
      return {
        name: json.name,
        description: json.description || "No description.",
        options: mapOptions(json.options),
      };
    });

    catalog.push({
      name: mod.name,
      description: mod.description || "No description provided.",
      commands,
    });
  }

  catalog.sort((a, b) => a.name.localeCompare(b.name));
  return catalog;
}
