/**
 * modules/tickets/index.ts
 *
 * Entry-point for the Tickets module.  Wires the BotModule interface to all
 * handlers and registers the /ticket management command.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  PermissionsBitField,
  ChannelType,
  TextChannel,
  MessageFlags,
} from "discord.js";
import type { BotModule, ModuleManager } from "../../ModuleManager";
import {
  TicketsSettingsSchema,
} from "../../lib/schemas";
import { parseSettings } from "../../lib/validateSettings";
import { deployOrUpdatePanel } from "./lib/panels";

// ── Handlers ──────────────────────────────────────────────────────────────────
import { handleOpen, handleModalOpen, invalidateSettingsCache } from "./handlers/open";
import { handleClose } from "./handlers/close";
import { handleClaim } from "./handlers/claim";
import {
  handleAdd,
  handleRemove,
  handleRename,
  handlePriority,
  handleTranscript,
} from "./handlers/manage";
import { startInactivitySweep } from "./lib/inactivity";

// ── Slash commands ─────────────────────────────────────────────────────────────

/** /tickets config  — deploy / update the panel */
const ticketsCommand = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("Configure the ticketing system")
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription("Deploy or update the ticket panel")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to post the ticket panel in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName("parent_channel")
          .setDescription(
            "Text channel where ticket threads are created (defaults to panel channel)",
          )
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable the ticketing system"),
  )
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
  .toJSON();

/** /ticket — in-thread management commands (staff) */
const ticketCommand = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Manage the current ticket thread")
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setDescription("Close this ticket and generate a transcript"),
  )
  .addSubcommand((sub) =>
    sub.setName("claim").setDescription("Claim or unclaim this ticket"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a user to this ticket")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to add").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a user from this ticket")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to remove").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("rename")
      .setDescription("Rename this ticket thread")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("New name for the thread")
          .setRequired(true)
          .setMaxLength(96),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("priority")
      .setDescription("Set the priority of this ticket")
      .addStringOption((opt) =>
        opt
          .setName("level")
          .setDescription("Priority level")
          .setRequired(true)
          .addChoices(
            { name: "🟢 Low", value: "low" },
            { name: "🔵 Normal", value: "normal" },
            { name: "🟠 High", value: "high" },
            { name: "🔴 Critical", value: "critical" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("transcript")
      .setDescription("Generate and download the current transcript"),
  )
  .toJSON();

// ── BotModule ──────────────────────────────────────────────────────────────────

const ticketsModule: BotModule = {
  name: "tickets",
  description: "Private thread-based support ticketing system",
  commands: [ticketsCommand, ticketCommand],
  deferReply: false, // handlers manage their own deferral

  // ── Slash command router ──────────────────────────────────────────────────
  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const { commandName, guildId } = interaction;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // ── /tickets subcommands (admin config) ──────────────────────────────
    if (commandName === "tickets") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const sub = interaction.options.getSubcommand();

      if (sub === "config") {
        const panelCh = interaction.options.getChannel("channel", true) as TextChannel;
        const parentCh = interaction.options.getChannel("parent_channel") as TextChannel | null;

        const appwrite = moduleManager.databaseService;
        const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
        const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);

        if (!settings) {
          await interaction.editReply("❌ Failed to load current settings.");
          return;
        }

        // Merge channel overrides into existing settings
        const updatedSettings = {
          ...rawSettings,
          panelChannelId: panelCh.id,
          defaultParentChannelId: parentCh?.id ?? panelCh.id,
        };

        try {
          const msgId = await deployOrUpdatePanel(panelCh, {
            ...settings,
            panelChannelId: panelCh.id,
            defaultParentChannelId: parentCh?.id ?? panelCh.id,
          });

          await appwrite.setModuleSettings(guildId, "tickets", {
            ...updatedSettings,
            panelMessageId: msgId,
          });
          await appwrite.setModuleStatus(guildId, "tickets", true);

          await interaction.editReply(
            `✅ Ticket panel deployed in <#${panelCh.id}>. Tickets will be created as threads${parentCh ? ` under <#${parentCh.id}>` : " in the same channel"}.`,
          );
          // Bust settings cache so the next button click sees fresh config
          invalidateSettingsCache(guildId);
        } catch (err) {
          moduleManager.logger.error("Failed to deploy ticket panel", guildId, err, "tickets");
          await interaction.editReply(
            "❌ Failed to deploy panel. Check bot permissions (Send Messages, Create Private Threads).",
          );
        }
        return;
      }

      if (sub === "disable") {
        await moduleManager.databaseService.setModuleStatus(guildId, "tickets", false);
        await interaction.editReply("✅ Ticketing system disabled.");
        return;
      }
    }

    // ── /ticket subcommands (in-thread management) ───────────────────────
    if (commandName === "ticket") {
      const sub = interaction.options.getSubcommand();

      // close and transcript need public replies; others are ephemeral
      const ephemeralSubs = ["add", "remove", "rename", "priority", "claim"];
      const isEphemeral = ephemeralSubs.includes(sub);
      await interaction.deferReply({
        flags: isEphemeral ? [MessageFlags.Ephemeral] : undefined,
      });

      switch (sub) {
        case "close":
          return handleClose(interaction, moduleManager);
        case "claim":
          return handleClaim(interaction, moduleManager);
        case "add":
          return handleAdd(interaction, moduleManager);
        case "remove":
          return handleRemove(interaction, moduleManager);
        case "rename":
          return handleRename(interaction, moduleManager);
        case "priority":
          return handlePriority(interaction, moduleManager);
        case "transcript":
          return handleTranscript(interaction, moduleManager);
      }
    }
  },

  // ── Button handler ────────────────────────────────────────────────────────
  // customId formats: tickets:open  |  tickets:open:<typeId>
  //                   tickets:close |  tickets:claim  |  tickets:priority
  handleButton: async (
    interaction: ButtonInteraction,
    moduleManager: ModuleManager,
  ) => {
    const parts = interaction.customId.split(":");
    const action = parts[1]; // open | close | claim | priority
    const typeId = parts[2]; // optional typeId for open

    switch (action) {
      case "open":
        return handleOpen(interaction, moduleManager, typeId);
      case "close":
        return handleClose(interaction, moduleManager);
      case "claim":
        return handleClaim(interaction, moduleManager);
      case "priority": {
        // "Set Priority" button — for now reply with a prompt
        // (full button-based priority picker is Phase 2 alongside modals)
        await interaction.reply({
          content:
            "Use `/ticket priority` to set the priority level:\n`/ticket priority level:high`",
          flags: [MessageFlags.Ephemeral],
        });
        break;
      }
    }
  },

  // ── Select menu handler ───────────────────────────────────────────────────
  // customId: tickets:type-select  (value = typeId)
  handleSelectMenu: async (
    interaction: StringSelectMenuInteraction,
    moduleManager: ModuleManager,
  ) => {
    const typeId = interaction.values[0];
    return handleOpen(interaction, moduleManager, typeId);
  },

  // ── Modal handler ─────────────────────────────────────────────────────────
  // customId formats: tickets:open-modal  |  tickets:open-modal:<typeId>
  handleModal: async (
    interaction: ModalSubmitInteraction,
    moduleManager: ModuleManager,
  ) => {
    const parts = interaction.customId.split(":");
    if (parts[1] === "open-modal") {
      const typeId = parts[2]; // undefined when no ticket type
      return handleModalOpen(interaction, moduleManager, typeId);
    }
  },
};

// ── Event registration ───────────────────────────────────────────────────────

export function registerTicketsEvents(moduleManager: ModuleManager): void {
  startInactivitySweep(moduleManager.client, moduleManager);
}

export default ticketsModule;
