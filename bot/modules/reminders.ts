/**
 * Reminders Module — Create, view, cancel, and auto-dispatch reminders.
 *
 * Commands:
 *  - /remindme <reminder> <when> [message]
 *  - /reminders list | cancel <id>
 *  - Message Context Menu: "Remind Me"
 *
 * AI Tools:
 *  - create_reminder, read_reminder, update_reminder, delete_reminder
 */
import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type ModalSubmitInteraction,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import * as chrono from "chrono-node";
import type { BotModule, ModuleManager } from "../ModuleManager";
import type { AiTool } from "../lib/aiTools";

// ─── Slash Commands & Context Menu Command Definitions ───────────────────────

const remindmeCommand = new SlashCommandBuilder()
  .setName("remindme")
  .setDescription("Set a reminder for a future date/time")
  .addStringOption((opt) =>
    opt
      .setName("reminder")
      .setDescription("What you want to be reminded about")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("when")
      .setDescription("When to remind you (e.g. 'in 30 mins', 'tomorrow 3pm', '2 hours')")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("message")
      .setDescription("Optional message ID or message link to quote")
      .setRequired(false),
  );

const remindersCommand = new SlashCommandBuilder()
  .setName("reminders")
  .setDescription("View or manage your active reminders")
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all your pending reminders"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancel a pending reminder")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("The ID of the reminder to cancel")
          .setRequired(true),
      ),
  );

const contextMenuCommand = new ContextMenuCommandBuilder()
  .setName("Remind Me")
  .setType(ApplicationCommandType.Message);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFutureDate(input: string): Date | null {
  const parsed = chrono.parseDate(input, new Date());
  if (!parsed || parsed.getTime() <= Date.now()) {
    return null;
  }
  return parsed;
}

function buildMessageUrl(guildId: string | null, channelId: string, messageId: string): string {
  const g = guildId ?? "@me";
  return `https://discord.com/channels/${g}/${channelId}/${messageId}`;
}

// ─── AI Tools ─────────────────────────────────────────────────────────────────

const remindersAiTools: AiTool[] = [
  {
    name: "create_reminder",
    description:
      "Create a new reminder for the user at a specified date/time or relative duration (e.g. 'in 30 minutes', 'tomorrow at 3pm', 'in 2 hours').",
    parameters: {
      type: "object",
      properties: {
        reminder: {
          type: "string",
          description: "The text of the reminder.",
        },
        when: {
          type: "string",
          description:
            "When the reminder should trigger (e.g. 'in 15 minutes', 'tomorrow 9am', '2 hours').",
        },
      },
      required: ["reminder", "when"],
    },
    execute: async ({ guildId, message, moduleManager, args }) => {
      const reminderText = String(args.reminder || "").trim();
      const whenStr = String(args.when || "").trim();

      if (!reminderText) return "❌ Please specify what to be reminded about.";
      const remindAt = parseFutureDate(whenStr);
      if (!remindAt) {
        return `❌ Could not parse a valid future date/time from "${whenStr}". Try format like "in 30 minutes", "tomorrow at 3pm", or "in 2 hours".`;
      }

      const created = await moduleManager.databaseService.reminders.create({
        guildId: guildId || null,
        channelId: message.channel.id,
        userId: message.author.id,
        reminder: reminderText,
        remindAt,
        status: "pending",
      });

      const unixTime = Math.floor(remindAt.getTime() / 1000);
      return `✅ Reminder created (ID: \`${created.id}\`). Scheduled for <t:${unixTime}:F> (<t:${unixTime}:R>): "${reminderText}"`;
    },
  },
  {
    name: "read_reminder",
    description: "List all active, pending reminders scheduled for the current user.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async ({ message, moduleManager }) => {
      const userReminders = await moduleManager.databaseService.reminders.listByUser(
        message.author.id,
        25,
      );

      if (userReminders.length === 0) {
        return "You have no active pending reminders.";
      }

      const lines = userReminders.map((r) => {
        const unixTime = Math.floor(r.remindAt.getTime() / 1000);
        return `• [\`${r.id}\`] <t:${unixTime}:R>: "${r.reminder}"`;
      });

      return `📋 **Your Pending Reminders (${userReminders.length}):**\n${lines.join("\n")}`;
    },
  },
  {
    name: "update_reminder",
    description: "Update the text or target date/time of a pending reminder by its ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the reminder to update.",
        },
        reminder: {
          type: "string",
          description: "New text for the reminder.",
        },
        when: {
          type: "string",
          description: "New target date/time (e.g. 'in 1 hour', 'tomorrow at 10am').",
        },
      },
      required: ["id"],
    },
    execute: async ({ message, moduleManager, args }) => {
      const id = String(args.id || "").trim();
      const existing = await moduleManager.databaseService.reminders.findById(id);

      if (!existing || existing.userId !== message.author.id || existing.status !== "pending") {
        return `❌ Pending reminder with ID \`${id}\` was not found.`;
      }

      const patch: Partial<typeof existing> = {};

      if (args.reminder && String(args.reminder).trim()) {
        patch.reminder = String(args.reminder).trim();
      }

      if (args.when && String(args.when).trim()) {
        const newDate = parseFutureDate(String(args.when).trim());
        if (!newDate) {
          return `❌ Could not parse a valid future date/time from "${args.when}".`;
        }
        patch.remindAt = newDate;
      }

      const updated = await moduleManager.databaseService.reminders.update(id, patch);
      if (!updated) return "❌ Failed to update reminder.";

      const unixTime = Math.floor(updated.remindAt.getTime() / 1000);
      return `✅ Reminder updated (ID: \`${updated.id}\`). Scheduled for <t:${unixTime}:R>: "${updated.reminder}"`;
    },
  },
  {
    name: "delete_reminder",
    description: "Cancel or delete a pending reminder by its ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the reminder to delete/cancel.",
        },
      },
      required: ["id"],
    },
    execute: async ({ message, moduleManager, args }) => {
      const id = String(args.id || "").trim();
      const existing = await moduleManager.databaseService.reminders.findById(id);

      if (!existing || existing.userId !== message.author.id) {
        return `❌ Pending reminder with ID \`${id}\` was not found.`;
      }

      const deleted = await moduleManager.databaseService.reminders.delete(id);
      if (deleted) {
        return `✅ Reminder \`${id}\` has been cancelled.`;
      }
      return `❌ Failed to cancel reminder \`${id}\`.`;
    },
  },
];

// ─── Module Definition ────────────────────────────────────────────────────────

const remindersModule: BotModule = {
  name: "reminders",
  description: "Set, list, and manage reminders with natural language time parsing.",
  meta: {
    displayName: "Reminders",
    category: "utility",
    icon: "i-lucide-clock",
    color: "sky",
    tags: ["timers", "natural-language", "personal", "scheduling"],
  },
  // skipDefer: context menu "Remind Me" must call showModal() as the FIRST
  // response — the module handles its own defer/reply for slash commands.
  skipDefer: true,
  commands: [
    remindmeCommand.toJSON(),
    remindersCommand.toJSON(),
    contextMenuCommand.toJSON(),
  ],
  aiTools: remindersAiTools,

  async execute(interaction, moduleManager) {
    // ── Context Menu Command ("Remind Me" on a message) ───────────────────────
    if (interaction.isContextMenuCommand()) {
      const messageInteraction = interaction as MessageContextMenuCommandInteraction;
      const targetMessage = messageInteraction.targetMessage;

      const modal = new ModalBuilder()
        .setCustomId(`reminders:modal:${targetMessage.id}`)
        .setTitle("Set Message Reminder");

      const whenInput = new TextInputBuilder()
        .setCustomId("when")
        .setLabel("When to remind you?")
        .setPlaceholder("e.g. in 30 minutes, tomorrow 9am, 2 hours")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const noteInput = new TextInputBuilder()
        .setCustomId("reminder")
        .setLabel("Reminder Note (optional)")
        .setPlaceholder(
          targetMessage.content
            ? targetMessage.content.replace(/\n/g, " ").slice(0, 80)
            : "What do you want to be reminded about?",
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(whenInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
      );

      await messageInteraction.showModal(modal);
      return;
    }


    // ── Slash Commands ────────────────────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const chatInt = interaction as ChatInputCommandInteraction;

    // skipDefer is set on this module so we must defer manually for slash cmds.
    await chatInt.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Subcommand: /reminders list | cancel
    if (chatInt.commandName === "reminders") {

      const sub = chatInt.options.getSubcommand();

      if (sub === "list") {
        const userReminders = await moduleManager.databaseService.reminders.listByUser(
          chatInt.user.id,
          25,
        );

        if (userReminders.length === 0) {
          await chatInt.editReply({
            content: "You have no active pending reminders.",
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle("⏰ Your Pending Reminders")
          .setColor(0x5865f2)
          .setTimestamp();

        for (const r of userReminders) {
          const unixTime = Math.floor(r.remindAt.getTime() / 1000);
          embed.addFields({
            name: `ID: \`${r.id}\``,
            value: `**Time:** <t:${unixTime}:F> (<t:${unixTime}:R>)\n**Reminder:** ${r.reminder}`,
          });
        }

        await chatInt.editReply({ embeds: [embed] });
        return;
      }

      if (sub === "cancel") {
        const id = chatInt.options.getString("id", true).trim();
        const existing = await moduleManager.databaseService.reminders.findById(id);

        if (!existing || existing.userId !== chatInt.user.id) {
          await chatInt.editReply({
            content: `❌ Could not find a pending reminder with ID \`${id}\`.`,
          });
          return;
        }

        await moduleManager.databaseService.reminders.delete(id);
        await chatInt.editReply({
          content: `✅ Cancelled reminder \`${id}\`: "${existing.reminder}"`,
        });
        return;
      }
    }

    // Command: /remindme <reminder> <when> [message]
    if (chatInt.commandName === "remindme") {
      const reminderText = chatInt.options.getString("reminder", true).trim();
      const whenStr = chatInt.options.getString("when", true).trim();
      const messageOpt = chatInt.options.getString("message");

      const remindAt = parseFutureDate(whenStr);
      if (!remindAt) {
        await chatInt.editReply({
          content: `❌ Could not parse a valid future date/time from "${whenStr}". Try something like \`in 30 minutes\`, \`tomorrow at 3pm\`, or \`in 2 hours\`.`,
        });
        return;
      }

      let messageId: string | null = null;
      let messageUrl: string | null = null;
      let quotedContent: string | null = null;

      // Extract quoted message details if URL or ID provided in options
      if (messageOpt) {
        const urlMatch = messageOpt.match(
          /https:\/\/discord\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/,
        );
        if (urlMatch) {
          messageId = urlMatch[3];
          messageUrl = messageOpt;
        } else if (/^\d+$/.test(messageOpt)) {
          messageId = messageOpt;
          messageUrl = buildMessageUrl(
            chatInt.guildId,
            chatInt.channelId,
            messageId,
          );
        }

        if (messageId && chatInt.channel && "messages" in chatInt.channel) {
          const fetched = await (chatInt.channel as any).messages
            .fetch(messageId)
            .catch(() => null);
          if (fetched) {
            quotedContent = `${fetched.author.username}: ${fetched.content || "[Media/Embed]"}`;
          }
        }
      }

      const created = await moduleManager.databaseService.reminders.create({
        guildId: chatInt.guildId || null,
        channelId: chatInt.channelId,
        userId: chatInt.user.id,
        reminder: reminderText,
        remindAt,
        status: "pending",
        messageId,
        messageUrl,
        quotedContent,
      });

      const unixTime = Math.floor(remindAt.getTime() / 1000);
      const embed = new EmbedBuilder()
        .setTitle("⏰ Reminder Set!")
        .setColor(0x57f287)
        .setDescription(reminderText)
        .addFields({
          name: "Remind Time",
          value: `<t:${unixTime}:F> (<t:${unixTime}:R>)`,
        })
        .setFooter({ text: `Reminder ID: ${created.id}` });

      if (quotedContent) {
        embed.addFields({
          name: "Quoted Message",
          value: `> ${quotedContent.replace(/\n/g, "\n> ")}`,
        });
      }

      await chatInt.editReply({ embeds: [embed] });
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, moduleManager) {
    if (!interaction.customId.startsWith("reminders:modal:")) return;

    const targetMessageId = interaction.customId.replace("reminders:modal:", "");
    const whenStr = interaction.fields.getTextInputValue("when").trim();
    const reminderNote = interaction.fields.getTextInputValue("reminder").trim();

    const remindAt = parseFutureDate(whenStr);
    if (!remindAt) {
      await interaction.reply({
        content: `❌ Could not parse a valid future date/time from "${whenStr}". Try something like \`in 30 minutes\`, \`tomorrow at 3pm\`, or \`in 2 hours\`.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (!interaction.channelId) {
      await interaction.reply({
        content: "❌ Channel not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    let quotedContent: string | null = null;
    let messageUrl: string | null = null;

    if (interaction.channel && "messages" in interaction.channel) {
      const fetched = await (interaction.channel as any).messages
        .fetch(targetMessageId)
        .catch(() => null);
      if (fetched) {
        quotedContent = `${fetched.author.username}: ${fetched.content || "[Media/Embed]"}`;
        messageUrl = buildMessageUrl(
          interaction.guildId,
          interaction.channelId,
          targetMessageId,
        );
      }
    }

    const reminderText = reminderNote || (quotedContent ? `Reminder for: ${quotedContent}` : "Message reminder");

    const created = await moduleManager.databaseService.reminders.create({
      guildId: interaction.guildId || null,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      reminder: reminderText,
      remindAt,
      status: "pending",
      messageId: targetMessageId,
      messageUrl,
      quotedContent,
    });


    const unixTime = Math.floor(remindAt.getTime() / 1000);
    const embed = new EmbedBuilder()
      .setTitle("⏰ Reminder Set for Message!")
      .setColor(0x57f287)
      .setDescription(reminderText)
      .addFields({
        name: "Remind Time",
        value: `<t:${unixTime}:F> (<t:${unixTime}:R>)`,
      })
      .setFooter({ text: `Reminder ID: ${created.id}` });

    if (quotedContent) {
      embed.addFields({
        name: "Quoted Message",
        value: `> ${quotedContent.replace(/\n/g, "\n> ")}`,
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });
  },
};

export default remindersModule;
