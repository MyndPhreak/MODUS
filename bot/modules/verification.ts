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
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import {
  VerificationSettingsSchema,
  VerificationSettingsType,
  VerificationButtonConfig,
  PanelEmbedConfig,
} from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";
import { parseHexColor, deployOrUpdateMessage } from "../lib/discord-utils";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Map schema style string → discord.js ButtonStyle enum value */
const STYLE_MAP: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};


/**
 * Build the Discord message payload (embed + button rows) from stored settings.
 * Falls back to a sensible default if no embed or buttons are configured.
 */
function buildPanelPayload(settings: VerificationSettingsType) {
  const embedCfg = settings.embed;
  const buttons = settings.buttons;

  // ── Embed ────────────────────────────────────────────────────────────
  const embed = new EmbedBuilder().setDescription(
    embedCfg?.description ||
      "Welcome! Click the button below to verify yourself and gain access to the server.",
  );
  if (embedCfg?.title) embed.setTitle(embedCfg.title);
  if (embedCfg?.color) {
    const colorNum = parseHexColor(embedCfg.color);
    if (colorNum !== null) embed.setColor(colorNum);
  }

  // ── Button Rows (max 5 buttons per ActionRow, up to 5 rows) ──────────
  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (buttons.length === 0) {
    // Legacy/default single button — assigns no role by default,
    // but handleButton will gracefully inform the user if no buttons in config.
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("verification:verify")
          .setLabel("Verify to Enter")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
      ),
    );
  } else {
    const chunks: VerificationButtonConfig[][] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      chunks.push(buttons.slice(i, i + 5));
    }
    for (const chunk of chunks.slice(0, 5)) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        chunk.map((btn) => {
          const b = new ButtonBuilder()
            .setCustomId(`verification:role:${btn.roleId}`)
            .setLabel(btn.label)
            .setStyle(STYLE_MAP[btn.style] ?? ButtonStyle.Success);
          if (btn.emoji) b.setEmoji(btn.emoji);
          return b;
        }),
      );
      components.push(row);
    }
  }

  return { embeds: [embed], components };
}


async function deployPanel(
  channel: TextChannel,
  settings: VerificationSettingsType,
  moduleManager: ModuleManager,
  guildId: string,
): Promise<VerificationSettingsType> {
  const payload = buildPanelPayload(settings);
  const messageId = await deployOrUpdateMessage(
    channel,
    payload,
    settings.verificationMessageId,
    settings.verificationChannelId,
  );
  moduleManager.logger.info(
    messageId === settings.verificationMessageId
      ? "Verification panel updated in-place."
      : "Verification panel posted to new message.",
    guildId,
    "verification",
  );
  return {
    ...settings,
    verificationChannelId: channel.id,
    verificationMessageId: messageId,
  };
}

// ── Module Definition ──────────────────────────────────────────────────────

const verificationModule: BotModule = {
  name: "verification",
  description: "Protects the server with a customisable verification panel",
  data: new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Set up or manage the verification panel")
    .addSubcommand((sub) =>
      sub
        .setName("deploy")
        .setDescription(
          "Post (or refresh) the verification panel in a channel",
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
        .setName("disable")
        .setDescription("Disable the verification system"),
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

    const appwrite = moduleManager.databaseService;

    if (subcommand === "deploy") {
      const channel = interaction.options.getChannel(
        "channel",
        true,
      ) as TextChannel;

      const rawSettings = await appwrite.getModuleSettings(
        guildId,
        "verification",
      );
      const settings = parseSettings(
        VerificationSettingsSchema,
        rawSettings,
        "verification",
        guildId,
      ) ?? { buttons: [] };

      if (settings.buttons.length === 0) {
        await interaction.editReply(
          "⚠️ No buttons configured yet. Please set up your verification panel in the dashboard first, then run `/verification deploy` again.",
        );
        return;
      }

      try {
        const updated = await deployPanel(
          channel,
          settings,
          moduleManager,
          guildId,
        );
        await appwrite.setModuleSettings(guildId, "verification", updated);
        await appwrite.setModuleStatus(guildId, "verification", true);
        await interaction.editReply(
          `✅ Verification panel deployed in <#${channel.id}>.`,
        );
      } catch (err) {
        moduleManager.logger.error(
          "Failed to deploy verification panel",
          guildId,
          err,
          "verification",
        );
        await interaction.editReply(
          "❌ Missing permissions to send messages in that channel.",
        );
      }
    } else if (subcommand === "disable") {
      await appwrite.setModuleStatus(guildId, "verification", false);
      await interaction.editReply("✅ Verification system disabled.");
    }
  },

  // ── Button handler ───────────────────────────────────────────────────
  handleButton: async (
    interaction: ButtonInteraction,
    moduleManager: ModuleManager,
  ) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const appwrite = moduleManager.databaseService;
    const isEnabled = await appwrite.isModuleEnabled(guildId, "verification");
    if (!isEnabled) {
      await interaction.reply({
        content: "Verification is disabled.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const rawSettings = await appwrite.getModuleSettings(
      guildId,
      "verification",
    );
    const settings = parseSettings(
      VerificationSettingsSchema,
      rawSettings,
      "verification",
      guildId,
    );
    if (!settings) {
      await interaction.reply({
        content: "Verification is not configured.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Determine which role to assign
    let targetRoleId: string | undefined;

    const [, action, roleIdFromId] = interaction.customId.split(":");

    if (action === "role" && roleIdFromId) {
      // New-style button: verification:role:{roleId}
      targetRoleId = roleIdFromId;
    } else if (action === "verify") {
      // Legacy single-button: use the first configured button's role
      targetRoleId = settings.buttons[0]?.roleId;
    }

    if (!targetRoleId) {
      await interaction.reply({
        content:
          "⚠️ This button is not configured. Please ask an admin to redeploy the verification panel.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const member = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (!member) {
      await interaction.reply({
        content: "Could not find your server profile.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (member.roles.cache.has(targetRoleId)) {
      await interaction.reply({
        content: "✅ You already have this role!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    try {
      await member.roles.add(targetRoleId, "Verification gate");
      const roleName =
        interaction.guild?.roles.cache.get(targetRoleId)?.name ?? targetRoleId;
      await interaction.reply({
        content: `✅ You've been given the **${roleName}** role. Welcome!`,
        flags: [MessageFlags.Ephemeral],
      });
      moduleManager.logger.info(
        `${interaction.user.tag} verified — granted role ${roleName}`,
        guildId,
        "verification",
      );
    } catch (err) {
      moduleManager.logger.error(
        "Verification role assignment failed",
        guildId,
        err,
        "verification",
      );
      await interaction.reply({
        content:
          "❌ I couldn't assign the role. Please check my permissions.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};

export function registerVerificationEvents(_moduleManager: ModuleManager) {
  // All interactions are handled through the button handler above.
}

export default verificationModule;
