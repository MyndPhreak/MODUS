import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ButtonInteraction,
  PermissionsBitField,
  ChannelType,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  EmbedBuilder,
  MessageFlags,
  Events,
  Interaction,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import {
  ButtonRolesSettingsSchema,
  ButtonRolesSettingsType,
  ButtonRolesPanel,
  ButtonRoleEntry,
} from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";
import { parseHexColor, deployOrUpdateMessage } from "../lib/discord-utils";

// ── Custom ID prefixes ────────────────────────────────────────────────────
// Buttons:   "button-roles:{panelId}:{entryId}"
// Dropdowns: "button-roles-select:{panelId}"

const BTN_PREFIX = "button-roles";
const SELECT_PREFIX = "button-roles-select";

// ── Style map ─────────────────────────────────────────────────────────────

const STYLE_MAP: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

// parseHexColor is imported from ../lib/discord-utils

// ── Panel builder ─────────────────────────────────────────────────────────

function buildPanelPayload(panel: ButtonRolesPanel) {
  const embedCfg = panel.embed;

  // Embed (always shown to provide context)
  const embed = new EmbedBuilder().setDescription(
    embedCfg?.description || "Select a role from the options below.",
  );
  if (embedCfg?.title) embed.setTitle(embedCfg.title);
  if (embedCfg?.color) {
    const c = parseHexColor(embedCfg.color);
    if (c !== null) embed.setColor(c);
  }

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] =
    [];

  if (panel.type === "dropdown") {
    // ── Select menu (max 25 options) ─────────────────────────────────
    const options = panel.entries.slice(0, 25).map((entry) => ({
      label: entry.label,
      value: `${entry.id}`,
      emoji: entry.emoji || undefined,
    }));

    if (options.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`${SELECT_PREFIX}:${panel.id}`)
        .setPlaceholder("Select roles to toggle…")
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      );
    }
  } else {
    // ── Buttons (up to 5 per row × 5 rows) ───────────────────────────
    const chunks: ButtonRoleEntry[][] = [];
    for (let i = 0; i < panel.entries.length; i += 5) {
      chunks.push(panel.entries.slice(i, i + 5));
    }
    for (const chunk of chunks.slice(0, 5)) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        chunk.map((entry) => {
          const b = new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}:${panel.id}:${entry.id}`)
            .setLabel(entry.label)
            .setStyle(STYLE_MAP[entry.style] ?? ButtonStyle.Primary);
          if (entry.emoji) b.setEmoji(entry.emoji);
          return b;
        }),
      );
      components.push(row);
    }
  }

  return { embeds: [embed], components } as any;
}

/**
 * Deploy (or redeploy) a single panel to a channel.
 * Tries in-place edit first; falls back to a new post.
 * Returns the updated panel with channelId/messageId set.
 */
async function deployPanel(
  panel: ButtonRolesPanel,
  channel: TextChannel,
  moduleManager: ModuleManager,
  guildId: string,
): Promise<ButtonRolesPanel> {
  const payload = buildPanelPayload(panel);
  const messageId = await deployOrUpdateMessage(
    channel,
    payload,
    panel.messageId,
    panel.channelId,
  );
  moduleManager.logger.info(
    `Button-roles panel "${panel.name}" deployed to #${channel.name}`,
    guildId,
    "reaction-roles",
  );
  return { ...panel, channelId: channel.id, messageId };
}

// ── Role toggle helpers ───────────────────────────────────────────────────

async function toggleRole(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  guildId: string,
  roleId: string,
  label: string,
): Promise<string> {
  const member = await interaction.guild?.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) return "❌ Could not load your server profile.";

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, "Button Role toggle");
      return `➖ Removed the **${label}** role.`;
    } else {
      await member.roles.add(roleId, "Button Role toggle");
      return `➕ Added the **${label}** role.`;
    }
  } catch {
    return `❌ I couldn't update your **${label}** role — check my permissions.`;
  }
}

// ── Module Definition ──────────────────────────────────────────────────────

const buttonRolesModule: BotModule = {
  name: "reaction-roles", // Appwrite key preserved for backward compat
  description: "Create button or dropdown panels that toggle roles",
  data: new SlashCommandBuilder()
    .setName("buttonroles")
    .setDescription("Manage button/dropdown role panels")
    .addSubcommand((sub) =>
      sub
        .setName("deploy")
        .setDescription("Post (or refresh) a configured panel in a channel")
        .addStringOption((opt) =>
          opt
            .setName("panel")
            .setDescription("Name of the panel to deploy")
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the panel in")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all configured button-role panels"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable the button-roles module"),
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply(
        "This command can only be used in a server.",
      );
      return;
    }

    const appwrite = moduleManager.appwriteService;
    const raw = await appwrite.getModuleSettings(guildId, "reaction-roles");
    const settings =
      parseSettings(ButtonRolesSettingsSchema, raw, "reaction-roles", guildId) ??
      { panels: [] };

    if (subcommand === "list") {
      if (settings.panels.length === 0) {
        await interaction.editReply(
          "No panels configured yet. Use the dashboard to create panels.",
        );
        return;
      }
      const lines = settings.panels.map(
        (p, i) =>
          `**${i + 1}. ${p.name}** — ${p.type}, ${p.entries.length} entries${p.messageId ? " ✅ deployed" : " ⏳ not yet deployed"}`,
      );
      await interaction.editReply(`**Button Role Panels:**\n${lines.join("\n")}`);
      return;
    }

    if (subcommand === "deploy") {
      const panelName = interaction.options.getString("panel", true);
      const channel = interaction.options.getChannel(
        "channel",
        true,
      ) as TextChannel;

      const panelIndex = settings.panels.findIndex(
        (p) => p.name.toLowerCase() === panelName.toLowerCase(),
      );
      if (panelIndex === -1) {
        await interaction.editReply(
          `❌ No panel named **${panelName}** found. Use \`/buttonroles list\` to see available panels.`,
        );
        return;
      }

      const panel = settings.panels[panelIndex];
      if (panel.entries.length === 0) {
        await interaction.editReply(
          `⚠️ Panel **${panel.name}** has no entries. Add some in the dashboard first.`,
        );
        return;
      }

      try {
        const updated = await deployPanel(
          panel,
          channel,
          moduleManager,
          guildId,
        );
        settings.panels[panelIndex] = updated;
        await appwrite.setModuleSettings(
          guildId,
          "reaction-roles",
          settings,
        );
        await appwrite.setModuleStatus(guildId, "reaction-roles", true);
        await interaction.editReply(
          `✅ Panel **${panel.name}** deployed in <#${channel.id}>.`,
        );
      } catch (err) {
        moduleManager.logger.error(
          `Failed to deploy panel "${panel.name}"`,
          guildId,
          err,
          "reaction-roles",
        );
        await interaction.editReply(
          "❌ Failed to post the panel. Check my permissions in that channel.",
        );
      }
      return;
    }

    if (subcommand === "disable") {
      await appwrite.setModuleStatus(guildId, "reaction-roles", false);
      await interaction.editReply("✅ Button roles module disabled.");
    }
  },

  // ── Button handler (buttons type panels) ─────────────────────────────
  handleButton: async (
    interaction: ButtonInteraction,
    moduleManager: ModuleManager,
  ) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    // customId format: "button-roles:{panelId}:{entryId}"
    const parts = interaction.customId.split(":");
    if (parts.length < 3) return;
    const [, panelId, entryId] = parts;

    const appwrite = moduleManager.appwriteService;
    const isEnabled = await appwrite.isModuleEnabled(guildId, "reaction-roles");
    if (!isEnabled) {
      await interaction.reply({
        content: "This panel is currently disabled.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const raw = await appwrite.getModuleSettings(guildId, "reaction-roles");
    const settings = parseSettings(
      ButtonRolesSettingsSchema,
      raw,
      "reaction-roles",
      guildId,
    );
    if (!settings) return;

    const panel = settings.panels.find((p) => p.id === panelId);
    if (!panel) return;

    const entry = panel.entries.find((e) => e.id === entryId);
    if (!entry) return;

    const msg = await toggleRole(
      interaction,
      guildId,
      entry.roleId,
      entry.label,
    );
    await interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
  },
};

// ── Event Registration (dropdown select-menu handler) ─────────────────────

export function registerReactionRolesEvents(moduleManager: ModuleManager) {
  const client = (moduleManager as any)["client"] as any;

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith(`${SELECT_PREFIX}:`)) return;

    const guildId = interaction.guildId;
    if (!guildId) return;

    const appwrite = moduleManager.appwriteService;
    const isEnabled = await appwrite.isModuleEnabled(guildId, "reaction-roles");
    if (!isEnabled) return;

    const raw = await appwrite.getModuleSettings(guildId, "reaction-roles");
    const settings = parseSettings(
      ButtonRolesSettingsSchema,
      raw,
      "reaction-roles",
      guildId,
    );
    if (!settings) return;

    // Extract panelId: "button-roles-select:{panelId}"
    const panelId = interaction.customId.split(":")[1];
    const panel = settings.panels.find((p) => p.id === panelId);
    if (!panel) return;

    // Defer so we have time to process all toggles
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const selectedIds = new Set(interaction.values);
    const results: string[] = [];

    for (const entry of panel.entries) {
      const wantsRole = selectedIds.has(entry.id);
      const member = await interaction.guild?.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (!member) continue;

      try {
        if (wantsRole && !member.roles.cache.has(entry.roleId)) {
          await member.roles.add(entry.roleId, "Button Role dropdown");
          results.push(`➕ **${entry.label}**`);
        } else if (!wantsRole && member.roles.cache.has(entry.roleId)) {
          await member.roles.remove(entry.roleId, "Button Role dropdown");
          results.push(`➖ ~~${entry.label}~~`);
        }
      } catch {
        results.push(`❌ Failed: **${entry.label}**`);
      }
    }

    const reply =
      results.length > 0
        ? `Roles updated:\n${results.join("\n")}`
        : "No changes — your selections match your current roles.";

    await interaction.editReply({ content: reply });
  });

  moduleManager.logger.info(
    "Button-roles dropdown event listener registered.",
    undefined,
    "reaction-roles",
  );
}

export default buttonRolesModule;
