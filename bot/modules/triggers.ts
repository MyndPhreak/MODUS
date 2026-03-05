/**
 * Triggers Module — "Webhooks to Everything"
 *
 * Lets users create custom webhook triggers that send formatted embeds
 * to a Discord channel when an external event fires (GitHub PR merged,
 * Twitch stream ended, or any generic webhook POST).
 *
 * Slash commands:
 *   /triggers create <name> <provider> <channel>
 *   /triggers list
 *   /triggers delete <name>
 *   /triggers test <name>
 *   /triggers template <name> <json>
 *   /triggers filter <name> <json>
 */

import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import crypto from "crypto";
import { BotModule, ModuleManager } from "../ModuleManager";

// ── Provider-specific default embeds ───────────────────────────────

const PROVIDER_DEFAULTS: Record<
  string,
  { color: number; title: string; description: string }
> = {
  github: {
    color: 0x238636,
    title: "🐙 GitHub — {pr.title}",
    description: "[{repo.name}]({pr.url}) by **{sender.login}**\n{pr.title}",
  },
  twitch: {
    color: 0x9146ff,
    title: "📺 Twitch — {stream.user}",
    description:
      "**{stream.user}** went live: *{stream.title}*\nPlaying **{stream.game}**",
  },
  webhook: {
    color: 0x5865f2,
    title: "🔔 Webhook Triggered",
    description: "A webhook event was received.",
  },
};

// ── Helpers ────────────────────────────────────────────────────────

function generateSecret(): string {
  return crypto.randomUUID();
}

function buildWebhookUrl(secret: string): string {
  const host =
    process.env.WEBHOOK_BASE_URL ||
    `http://localhost:${process.env.BOT_PORT || "3000"}`;
  return `${host}/webhooks/trigger/${secret}`;
}

// ── Module Definition ──────────────────────────────────────────────

const triggersModule: BotModule = {
  name: "triggers",
  description: "Custom webhook triggers — post embeds on external events",
  data: new SlashCommandBuilder()
    .setName("triggers")
    .setDescription("Manage custom webhook triggers")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new webhook trigger")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Unique name for this trigger")
            .setRequired(true)
            .setMaxLength(128),
        )
        .addStringOption((opt) =>
          opt
            .setName("provider")
            .setDescription("Provider type")
            .setRequired(true)
            .addChoices(
              { name: "Generic Webhook", value: "webhook" },
              { name: "GitHub", value: "github" },
              { name: "Twitch", value: "twitch" },
            ),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post trigger messages to")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all triggers for this server"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a trigger")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Name of the trigger to delete")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Send a test message for a trigger")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Name of the trigger to test")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("template")
        .setDescription("Set a custom embed template (JSON)")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Trigger name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("json")
            .setDescription(
              'Embed JSON, e.g. {"title":"PR {pr.title}","color":65280}',
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("filter")
        .setDescription("Set filter conditions (JSON)")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Trigger name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("json")
            .setDescription(
              'Filter JSON, e.g. {"action":"closed","merged":true}',
            )
            .setRequired(true),
        ),
    )
    .toJSON(),

  // ── Autocomplete ──────────────────────────────────────────────────

  autocomplete: async (
    interaction: AutocompleteInteraction,
    moduleManager: ModuleManager,
  ) => {
    const guildId = interaction.guildId;
    if (!guildId) return interaction.respond([]);

    const focused = interaction.options.getFocused().toLowerCase();
    const triggers = await moduleManager.appwriteService.listTriggers(guildId);

    const filtered = triggers
      .filter((t: any) => t.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((t: any) => ({ name: `${t.name} (${t.provider})`, value: t.name }));

    await interaction.respond(filtered);
  },

  // ── Execute ───────────────────────────────────────────────────────

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
      // ── Create ──────────────────────────────────────────────────────
      case "create": {
        const name = interaction.options.getString("name", true).trim();
        const provider = interaction.options.getString("provider", true) as
          | "webhook"
          | "github"
          | "twitch";
        const channel = interaction.options.getChannel("channel", true);

        // Check for duplicate name
        const existing = await appwrite.listTriggers(guildId);
        if (
          existing.some((t: any) => t.name.toLowerCase() === name.toLowerCase())
        ) {
          await interaction.editReply(
            `❌ A trigger named **${name}** already exists. Choose a different name.`,
          );
          return;
        }

        // Check max triggers
        if (existing.length >= 25) {
          await interaction.editReply(
            "❌ You've reached the maximum of **25** triggers per server.",
          );
          return;
        }

        const secret = generateSecret();
        const webhookUrl = buildWebhookUrl(secret);

        await appwrite.createTrigger({
          guild_id: guildId,
          name,
          secret,
          provider,
          channel_id: channel.id,
          created_by: interaction.user.id,
        });

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Trigger Created")
          .addFields(
            { name: "Name", value: name, inline: true },
            { name: "Provider", value: provider, inline: true },
            { name: "Channel", value: `<#${channel.id}>`, inline: true },
            { name: "Webhook URL", value: `\`\`\`\n${webhookUrl}\n\`\`\`` },
          )
          .setFooter({
            text: "Paste this URL into your service's webhook settings",
          });

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── List ────────────────────────────────────────────────────────
      case "list": {
        const triggers = await appwrite.listTriggers(guildId);

        if (triggers.length === 0) {
          await interaction.editReply(
            "No triggers configured. Use `/triggers create` to add one.",
          );
          return;
        }

        const lines = triggers.map(
          (t: any, i: number) =>
            `**${i + 1}.** \`${t.name}\` — ${t.provider} → <#${t.channel_id}> ${t.enabled ? "✅" : "❌"}`,
        );

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🔔 Triggers (${triggers.length}/25)`)
          .setDescription(lines.join("\n"));

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── Delete ──────────────────────────────────────────────────────
      case "delete": {
        const name = interaction.options.getString("name", true);
        const triggers = await appwrite.listTriggers(guildId);
        const trigger = triggers.find(
          (t: any) => t.name.toLowerCase() === name.toLowerCase(),
        );

        if (!trigger) {
          await interaction.editReply(`❌ No trigger named **${name}** found.`);
          return;
        }

        await appwrite.deleteTrigger(trigger.$id);
        await interaction.editReply(`🗑️ Trigger **${trigger.name}** deleted.`);
        break;
      }

      // ── Test ────────────────────────────────────────────────────────
      case "test": {
        const name = interaction.options.getString("name", true);
        const triggers = await appwrite.listTriggers(guildId);
        const trigger = triggers.find(
          (t: any) => t.name.toLowerCase() === name.toLowerCase(),
        );

        if (!trigger) {
          await interaction.editReply(`❌ No trigger named **${name}** found.`);
          return;
        }

        const guild = interaction.guild!;
        const channel = guild.channels.cache.get(trigger.channel_id);
        if (!channel || !(channel instanceof TextChannel)) {
          await interaction.editReply(
            "❌ The configured channel is invalid or not a text channel.",
          );
          return;
        }

        const defaults =
          PROVIDER_DEFAULTS[trigger.provider] || PROVIDER_DEFAULTS.webhook;
        let embedData = defaults;

        // Use custom template if set
        if (trigger.embed_template) {
          try {
            embedData = { ...defaults, ...JSON.parse(trigger.embed_template) };
          } catch {
            // fall through to defaults
          }
        }

        const testEmbed = new EmbedBuilder()
          .setColor(embedData.color)
          .setTitle(embedData.title)
          .setDescription(embedData.description)
          .setFooter({ text: "🧪 Test message — this is not a real event" })
          .setTimestamp();

        await channel.send({ embeds: [testEmbed] });
        await interaction.editReply(
          `✅ Test message sent to <#${trigger.channel_id}>.`,
        );
        break;
      }

      // ── Template ────────────────────────────────────────────────────
      case "template": {
        const name = interaction.options.getString("name", true);
        const json = interaction.options.getString("json", true);

        // Validate JSON
        try {
          JSON.parse(json);
        } catch {
          await interaction.editReply(
            "❌ Invalid JSON. Please check your syntax.",
          );
          return;
        }

        const triggers = await appwrite.listTriggers(guildId);
        const trigger = triggers.find(
          (t: any) => t.name.toLowerCase() === name.toLowerCase(),
        );

        if (!trigger) {
          await interaction.editReply(`❌ No trigger named **${name}** found.`);
          return;
        }

        await appwrite.updateTrigger(trigger.$id, { embed_template: json });
        await interaction.editReply(
          `✅ Embed template updated for **${trigger.name}**.`,
        );
        break;
      }

      // ── Filter ──────────────────────────────────────────────────────
      case "filter": {
        const name = interaction.options.getString("name", true);
        const json = interaction.options.getString("json", true);

        // Validate JSON
        try {
          JSON.parse(json);
        } catch {
          await interaction.editReply(
            "❌ Invalid JSON. Please check your syntax.",
          );
          return;
        }

        const triggers = await appwrite.listTriggers(guildId);
        const trigger = triggers.find(
          (t: any) => t.name.toLowerCase() === name.toLowerCase(),
        );

        if (!trigger) {
          await interaction.editReply(`❌ No trigger named **${name}** found.`);
          return;
        }

        await appwrite.updateTrigger(trigger.$id, { filters: json });
        await interaction.editReply(
          `✅ Filters updated for **${trigger.name}**.`,
        );
        break;
      }
    }
  },
};

export default triggersModule;
