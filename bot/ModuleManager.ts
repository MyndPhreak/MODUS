import {
  Client,
  Message,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  REST,
  Routes,
  Interaction,
  MessageFlags,
} from "discord.js";
import { Player } from "discord-player";
import fs from "fs";
import path from "path";
import { AppwriteService } from "./AppwriteService";
import { Logger } from "./Logger";

export interface BotModule {
  name: string;
  description: string;
  /** Single command data (legacy). If `commands` is provided, this is ignored. */
  data?: any;
  /** Multiple command definitions. Each entry's `name` property is used for routing. */
  commands?: any[];
  /** If false, the module handles its own deferReply/reply. Default: true (auto-defers as ephemeral). */
  deferReply?: boolean;
  execute: (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
  /** Optional autocomplete handler for slash command options. */
  autocomplete?: (
    interaction: AutocompleteInteraction,
    moduleManager: ModuleManager,
  ) => Promise<void>;
}

export class ModuleManager {
  private client: Client;
  /** Maps command name → BotModule (a module with multiple commands has multiple entries). */
  private modules: Map<string, BotModule> = new Map();
  /** Tracks unique module names so we don't register a module twice. */
  private uniqueModules: Map<string, BotModule> = new Map();

  /** Public read-only access to all registered modules (keyed by module name). */
  public getRegisteredModules(): ReadonlyMap<string, BotModule> {
    return this.uniqueModules;
  }
  private modulesPath: string;
  public appwriteService: AppwriteService;
  private enabledModules: Set<string> = new Set();
  public logger: Logger;
  public player: Player;

  constructor(client: Client, logger: Logger, player: Player) {
    this.client = client;
    this.modulesPath = path.join(__dirname, "modules");
    this.appwriteService = new AppwriteService();
    this.logger = logger;
    this.player = player;
  }

  public async loadModules() {
    if (!fs.existsSync(this.modulesPath)) {
      fs.mkdirSync(this.modulesPath);
    }

    const files = fs
      .readdirSync(this.modulesPath)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

    for (const file of files) {
      try {
        const modulePath = path.join(this.modulesPath, file);
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
              const cmdName = (cmd.name || cmd.name || "").toLowerCase();
              if (cmdName) {
                this.modules.set(cmdName, module);
              }
            }
            this.logger.info(
              `Loaded module: ${module.name} (${module.commands.length} commands)`,
            );
          } else if (module.data) {
            // Legacy single-command module
            this.modules.set(module.name.toLowerCase(), module);
            this.logger.info(`Loaded module: ${module.name}`);
          }

          // Register module in Appwrite if not exists
          await this.appwriteService.ensureModuleRegistered(
            module.name,
            module.description || "No description",
          );
        } else {
          console.warn(
            `[ModuleManager] Skipping module ${file}: Missing name or execute function.`,
          );
        }
      } catch (error) {
        console.error(`[ModuleManager] Error loading module ${file}:`, error);
      }
    }

    await this.refreshEnabledModules();

    // Register slash commands
    await this.registerCommands();

    // Setup Realtime subscription
    this.appwriteService.subscribeToModules((payload) => {
      console.log("[ModuleManager] Realtime update detected for modules.");
      this.refreshEnabledModules();
    });
  }

  private async registerCommands() {
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
    const commandData: any[] = [];
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
    const enabled = await this.appwriteService.getEnabledModules();
    this.enabledModules = new Set(enabled.map((n) => n.toLowerCase()));
    console.log("Updated enabled modules:", Array.from(this.enabledModules));
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

    // ─── Chat Input Commands ──────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guildId } = interaction;
    const module = resolveModule(commandName);
    const moduleName = resolveModuleName(commandName);

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
      //    before making any slow network calls (like Appwrite checks)
      try {
        if (module.deferReply !== false) {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        } else {
          // Modules that handle their own reply still need fast acknowledgement
          await interaction.deferReply();
        }
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

      // 3. Check guild-specific enablement (network call, but interaction is already deferred)
      let isGuildEnabled = true;
      if (guildId) {
        isGuildEnabled = await this.appwriteService.isModuleEnabled(
          guildId,
          module.name,
        );
      }

      if (!isGuildEnabled) {
        try {
          await interaction.editReply({
            content: `This module is currently disabled for this server.`,
          });
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
