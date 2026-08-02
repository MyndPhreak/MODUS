import {
  Client,
  Message,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  REST,
  Routes,
  Interaction,
  MessageFlags,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { Player } from "discord-player";
import fs from "fs";
import path from "path";
import { DatabaseService } from "./DatabaseService";
import { Logger } from "./Logger";
import type { AiTool } from "./lib/aiTools";

/**
 * A slash-command definition: any command builder (SlashCommandBuilder and
 * friends, matched structurally) or the already-serialized REST JSON body.
 */
export type SlashCommandData =
  | RESTPostAPIChatInputApplicationCommandsJSONBody
  | {
      name: string;
      description: string;
      toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
    };

export interface BotModule {
  name: string;
  description: string;
  /** Single command data (legacy). If `commands` is provided, this is ignored. */
  data?: SlashCommandData;
  /** Multiple command definitions. Each entry's `name` property is used for routing. */
  commands?: SlashCommandData[];
  /** If false, the module handles its own deferReply/reply. Default: true (auto-defers as ephemeral). */
  deferReply?: boolean;
  /**
   * If true, ModuleManager skips deferReply entirely — the module must call
   * interaction.reply() itself. Required for APIs like native Discord Polls
   * where the poll payload must be the *initial* reply, not an editReply.
   */
  skipDefer?: boolean;
  execute: (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
  /** Optional autocomplete handler for slash command options. */
  autocomplete?: (
    interaction: AutocompleteInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
  /** Optional button interaction handler. customId must be prefixed with `moduleName:`. */
  handleButton?: (
    interaction: ButtonInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
  /** Optional select-menu interaction handler. customId must be prefixed with `moduleName:`. */
  handleSelectMenu?: (
    interaction: StringSelectMenuInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
  /** Optional modal-submit handler. customId must be prefixed with `moduleName:`. */
  handleModal?: (
    interaction: ModalSubmitInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
  /**
   * Optional one-time event wiring (client listeners, timers, workers).
   * Called after the first loadModules() pass completes; guarded per module
   * name so /reload cannot attach duplicate listeners.
   */
  registerEvents?: (moduleManager: ModuleManager) => void | Promise<void>;
  /**
   * AI tools this module exposes to the assistant. Offered to the model only
   * when this module is enabled for the guild (and each tool's isAvailable
   * passes). See bot/lib/aiTools.ts.
   */
  aiTools?: AiTool[];
}

export class ModuleManager {
  /** Exposed so event-registration helpers (e.g. inactivity sweep) can access the Discord client. */
  public readonly client: Client;
  /** Maps command name → BotModule (a module with multiple commands has multiple entries). */
  private modules: Map<string, BotModule> = new Map();
  /** Tracks unique module names so we don't register a module twice. */
  private uniqueModules: Map<string, BotModule> = new Map();
  /**
   * Allows a module to be resolved from a button customId prefix that differs from its name.
   * e.g. { 'button-roles' → 'reaction-roles', 'button-roles-select' → 'reaction-roles' }
   */
  private buttonPrefixAliases: Map<string, string> = new Map([
    ["button-roles", "reaction-roles"],
    ["button-roles-select", "reaction-roles"],
  ]);

  /** Public read-only access to all registered modules (keyed by module name). */
  public getRegisteredModules(): ReadonlyMap<string, BotModule> {
    return this.uniqueModules;
  }
  private modulesPath: string;
  public databaseService: DatabaseService;
  private enabledModules: Set<string> = new Set();
  /** Module names whose registerEvents hook already ran (survives /reload). */
  private eventsRegistered: Set<string> = new Set();
  /** True once the first loadModules() pass has finished. */
  private modulesLoaded = false;
  /** Guards the modules-channel subscription so /reload doesn't stack duplicates. */
  private modulesSubscribed = false;
  public logger: Logger;
  public player: Player;

  constructor(client: Client, logger: Logger, player: Player) {
    this.client = client;
    this.modulesPath = path.join(__dirname, "modules");
    this.databaseService = new DatabaseService();
    this.logger = logger;
    this.player = player;
  }

  public async loadModules() {
    if (!fs.existsSync(this.modulesPath)) {
      fs.mkdirSync(this.modulesPath);
    }

    // Collect flat files (legacy single-file modules)
    const flatFiles = fs
      .readdirSync(this.modulesPath)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .map((f) => path.join(this.modulesPath, f));

    // Collect index entry-points from subdirectory modules (e.g. modules/tickets/index.ts)
    const subdirEntries = fs.readdirSync(this.modulesPath, { withFileTypes: true });
    const subdirFiles: string[] = [];
    for (const entry of subdirEntries) {
      if (!entry.isDirectory()) continue;
      for (const ext of ["index.ts", "index.js"]) {
        const candidate = path.join(this.modulesPath, entry.name, ext);
        if (fs.existsSync(candidate)) {
          subdirFiles.push(candidate);
          break;
        }
      }
    }

    const files = [...flatFiles, ...subdirFiles];

    for (const modulePath of files) {
      try {
        // Clear cache to allow hot-reloading if needed later
        delete require.cache[require.resolve(modulePath)];

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const moduleImport = require(modulePath);
        const module: BotModule = moduleImport.default || moduleImport;

        if (module.name && typeof module.execute === "function") {
          // Store unique module reference
          this.uniqueModules.set(module.name.toLowerCase(), module);

          // Register command name(s) → module mapping
          if (module.commands && module.commands.length > 0) {
            // Multi-command module: register each command name
            for (const cmd of module.commands) {
              const cmdName = (cmd.name || "").toLowerCase();
              if (cmdName) {
                this.modules.set(cmdName, module);
              }
            }
            this.logger.info(
              `Loaded module: ${module.name} (${module.commands.length} commands)`,
            );
          } else if (module.data) {
            // Legacy single-command module
            const cmdName = (module.data.name || module.name).toLowerCase();
            this.modules.set(cmdName, module);
            this.logger.info(`Loaded module: ${module.name} (command: /${cmdName})`);
          }

          // Register module in the modules table if not exists
          await this.databaseService.ensureModuleRegistered(
            module.name,
            module.description || "No description",
          );
        } else {
          console.warn(
            `[ModuleManager] Skipping module ${modulePath}: Missing name or execute function.`,
          );
        }
      } catch (error) {
        console.error(`[ModuleManager] Error loading module ${modulePath}:`, error);
      }
    }

    await this.refreshEnabledModules();

    // Register slash commands
    await this.registerCommands();

    // Hot-reload subscription: fires when another shard (or the dashboard)
    // writes to the modules table. Falls back to a no-op when Redis isn't
    // configured — restart is required to see new modules in that case.
    if (!this.modulesSubscribed) {
      await this.databaseService.subscribeToModules(() => {
        console.log("[ModuleManager] modules channel event — refreshing.");
        this.refreshEnabledModules();
      });
      this.modulesSubscribed = true;
    }

    // One-time event wiring for modules that declare registerEvents.
    for (const [name, module] of this.uniqueModules) {
      if (!module.registerEvents || this.eventsRegistered.has(name)) continue;
      try {
        await module.registerEvents(this);
        this.eventsRegistered.add(name);
      } catch (error) {
        console.error(
          `[ModuleManager] registerEvents failed for ${name}:`,
          error,
        );
      }
    }

    this.modulesLoaded = true;
  }

  private async registerCommands() {
    // Commands are registered globally, so one PUT covers the whole fleet.
    // Only shard 0 performs it — otherwise N shards send N identical REST
    // calls at boot and eat into Discord's daily command-registration limit.
    const shardId = this.client.shard?.ids[0] ?? 0;
    if (shardId !== 0) return;

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
      console.error(
        "[ModuleManager] DISCORD_TOKEN or CLIENT_ID is missing in .env",
      );
      return;
    }

    const rest = new REST({ version: "10" }).setToken(token);
    // Collect all command data from unique modules
    const commandData: SlashCommandData[] = [];
    for (const module of this.uniqueModules.values()) {
      if (module.commands && module.commands.length > 0) {
        commandData.push(...module.commands);
      } else if (module.data) {
        commandData.push(module.data);
      }
    }

    try {
      console.log(
        `[ModuleManager] Started refreshing ${commandData.length} application (/) commands.`,
      );

      // Registering globally. For faster testing, Routes.applicationGuildCommands(clientId, guildId) could be used.
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandData,
      });

      console.log(
        "[ModuleManager] Successfully reloaded application (/) commands.",
      );
    } catch (error) {
      console.error("[ModuleManager] Error registering slash commands:", error);
    }
  }

  private async refreshEnabledModules() {
    const enabled = await this.databaseService.getEnabledModules();
    this.enabledModules = new Set(enabled.map((n) => n.toLowerCase()));
    console.log("Updated enabled modules:", Array.from(this.enabledModules));
  }

  /**
   * Shared dispatch for button / select-menu / modal interactions: resolve
   * the module from the customId prefix (`moduleName:...`), check global
   * enablement, run the module's handler.
   */
  private async dispatchComponent(
    interaction:
      | ButtonInteraction
      | StringSelectMenuInteraction
      | ModalSubmitInteraction,
    handlerKey: "handleButton" | "handleSelectMenu" | "handleModal",
    label: string,
  ): Promise<void> {
    const [modulePrefix] = interaction.customId.split(":");
    if (!modulePrefix) return;

    // Direct lookup first; fall back to alias map for modules that use
    // a different customId prefix (e.g. button-roles → reaction-roles)
    const resolvedName =
      this.buttonPrefixAliases.get(modulePrefix.toLowerCase()) ??
      modulePrefix.toLowerCase();
    const module = this.uniqueModules.get(resolvedName);
    const handler = module?.[handlerKey];
    if (!module || !handler) return;

    if (!this.enabledModules.has(module.name.toLowerCase())) return;

    try {
      // The handlerKey/interaction pairing is guaranteed by the isButton/
      // isStringSelectMenu/isModalSubmit branch that routed us here.
      await handler(interaction as any, this);
    } catch (error) {
      console.error(
        `[ModuleManager] Error handling ${label} ${interaction.customId}:`,
        error,
      );
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Something went wrong!",
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch {
        /* ignore */
      }
    }
  }

  public async handleInteraction(interaction: Interaction) {
    // Helper: resolve module from command name
    const resolveModule = (cmdName: string): BotModule | undefined => {
      return this.modules.get(cmdName.toLowerCase());
    };

    // Helper: resolve the module's canonical name for enablement checks
    const resolveModuleName = (cmdName: string): string => {
      const mod = this.modules.get(cmdName.toLowerCase());
      return mod?.name?.toLowerCase() || cmdName.toLowerCase();
    };

    // ─── Autocomplete Interactions ─────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const { commandName } = interaction;
      const module = resolveModule(commandName);

      if (module?.autocomplete) {
        try {
          await module.autocomplete(interaction, this);
        } catch (error: any) {
          // 10062 = Unknown interaction — expected during rapid typing, suppress silently
          if (error?.code !== 10062) {
            console.error(
              `[ModuleManager] Autocomplete error for ${commandName}:`,
              error,
            );
          }
          // Respond with empty results on error to prevent Discord timeout
          try {
            await interaction.respond([]);
          } catch {
            /* already responded or expired */
          }
        }
      } else {
        // No handler found (or module not loaded yet), respond empty to prevent "Loading options failed"
        try {
          await interaction.respond([]);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    // ─── Component Interactions (buttons / select menus / modals) ─────
    if (interaction.isButton()) {
      return this.dispatchComponent(interaction, "handleButton", "button");
    }
    if (interaction.isStringSelectMenu()) {
      return this.dispatchComponent(
        interaction,
        "handleSelectMenu",
        "select menu",
      );
    }
    if (interaction.isModalSubmit()) {
      return this.dispatchComponent(interaction, "handleModal", "modal");
    }

    // ─── Chat Input Commands ──────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guildId } = interaction;
    const module = resolveModule(commandName);
    const moduleName = resolveModuleName(commandName);

    // Interactions can arrive between login and the end of loadModules()
    // (extractor loading alone can take seconds). Without this reply the
    // user just sees "The application did not respond".
    if (!module && !this.modulesLoaded) {
      try {
        await interaction.reply({
          content: "MODUS is still starting up — try again in a few seconds.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch {
        /* interaction expired */
      }
      return;
    }

    if (module) {
      // 1. Check global enablement first (local, no network call)
      const isGloballyEnabled = this.enabledModules.has(moduleName);

      if (!isGloballyEnabled) {
        try {
          await interaction.reply({
            content: `This module is currently disabled globally.`,
            flags: [MessageFlags.Ephemeral],
          });
        } catch (replyError) {
          console.error(
            "[ModuleManager] Failed to send disabled reply:",
            replyError,
          );
        }
        return;
      }

      // 2. Defer the reply FIRST to meet Discord's 3-second deadline
      //    before making any slow network calls (like database checks)
      //    Exception: skipDefer modules (e.g. polls) own the first reply themselves.
      if (!module.skipDefer && module.deferReply !== false) {
        try {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        } catch (deferError: any) {
          // 10062 = Unknown interaction — likely expired before we could defer
          if (deferError?.code !== 10062) {
            console.error(
              `[ModuleManager] Failed to defer reply for ${commandName}:`,
              deferError,
            );
          }
          return;
        }
      }

      // 3. Check guild-specific enablement. For deferred modules we can await
      //    the DB call safely. For skipDefer modules we'd still be on Discord's
      //    3-second interaction clock, so we use the cache-only variant and
      //    fall through (assume enabled) on miss — the cache warms for next time.
      let isGuildEnabled = true;
      if (guildId) {
        if (module.skipDefer) {
          const cached = this.databaseService.isModuleEnabledCached(
            guildId,
            module.name,
          );
          isGuildEnabled = cached ?? true;
        } else {
          isGuildEnabled = await this.databaseService.isModuleEnabled(
            guildId,
            module.name,
          );
        }
      }

      if (!isGuildEnabled) {
        try {
          const disabledMessage = "This module is currently disabled for this server.";
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: disabledMessage });
          } else {
            await interaction.reply({
              content: disabledMessage,
              flags: [MessageFlags.Ephemeral],
            });
          }
        } catch (replyError) {
          console.error(
            "[ModuleManager] Failed to send disabled reply:",
            replyError,
          );
        }
        return;
      }

      try {
        // Log command execution per-guild
        const user = interaction.user;
        this.logger.info(
          `/${commandName} used by ${user.tag} (${user.id})`,
          guildId ?? undefined,
          "command",
        );

        await module.execute(interaction, this);
      } catch (error) {
        console.error(
          `[ModuleManager] Error executing module ${module.name}:`,
          error,
        );

        // Log the error per-guild
        this.logger.error(
          `Error executing /${commandName}`,
          guildId ?? undefined,
          error,
          "command",
        );

        const errorMessage = "There was an error while executing this command!";
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
          } else {
            await interaction.reply({
              content: errorMessage,
              flags: [MessageFlags.Ephemeral],
            });
          }
        } catch (replyError) {
          console.error(
            "[ModuleManager] Failed to send error reply:",
            replyError,
          );
        }
      }
    }
  }
}
