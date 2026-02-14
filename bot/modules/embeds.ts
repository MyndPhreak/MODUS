import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  PermissionFlagsBits,
  Events,
  Interaction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../ModuleManager";
import type { BotModule } from "../ModuleManager";

// ─── Helpers ─────────────────────────────────────────────────────────────

function parseColor(input: string): number | null {
  if (!input || !input.trim()) return null;
  const cleaned = input.trim().replace("#", "");
  const parsed = parseInt(cleaned, 16);
  if (isNaN(parsed) || parsed < 0 || parsed > 0xffffff) return null;
  return parsed;
}

const PRESET_COLORS: Record<string, number> = {
  blurple: 0x5865f2,
  green: 0x57f287,
  yellow: 0xfee75c,
  fuchsia: 0xeb459e,
  red: 0xed4245,
  white: 0xffffff,
  black: 0x000000,
  orange: 0xe67e22,
  blue: 0x3498db,
  purple: 0x9b59b6,
};

// ─── Command Definitions ─────────────────────────────────────────────────

const embedCommand = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Create a rich embed message using a dialog")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const embedQuickCommand = new SlashCommandBuilder()
  .setName("embed-quick")
  .setDescription("Quickly send a simple embed to a channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel to send the embed to")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((opt) =>
    opt.setName("title").setDescription("Embed title").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("description")
      .setDescription("Embed description (supports markdown)")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("color")
      .setDescription(
        "Hex color (#5865F2) or preset: blurple, green, red, etc.",
      )
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("footer").setDescription("Footer text").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("image")
      .setDescription("Image URL for the embed")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("thumbnail")
      .setDescription("Thumbnail URL for the embed")
      .setRequired(false),
  );

// ─── Modal ID prefix for matching ──────────────────────────────────────

const MODAL_ID_PREFIX = "embed_builder_modal_";
const CHANNEL_SELECT_PREFIX = "embed_channel_select_";

// Track pending embeds from modals (guildId-userId → embed data)
const pendingEmbeds = new Map<
  string,
  {
    embed: EmbedBuilder;
    guildId: string;
    userId: string;
  }
>();

// ─── Modal Interaction Handler (registered globally once) ───────────────

let modalHandlerRegistered = false;

function registerModalHandler(client: any) {
  if (modalHandlerRegistered) return;
  modalHandlerRegistered = true;

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith(MODAL_ID_PREFIX)) return;

      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const title = interaction.fields.getTextInputValue("embed_title");
        const description =
          interaction.fields.getTextInputValue("embed_description");
        const colorInput = interaction.fields.getTextInputValue("embed_color");
        const footer = interaction.fields.getTextInputValue("embed_footer");
        const imageUrl = interaction.fields.getTextInputValue("embed_image");

        // Build the embed
        const embed = new EmbedBuilder();

        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);

        // Parse color
        const lowerColor = (colorInput || "").toLowerCase().trim();
        if (PRESET_COLORS[lowerColor]) {
          embed.setColor(PRESET_COLORS[lowerColor]);
        } else {
          const parsedColor = parseColor(colorInput);
          if (parsedColor !== null) {
            embed.setColor(parsedColor);
          } else {
            embed.setColor(0x5865f2); // Default blurple
          }
        }

        if (footer) embed.setFooter({ text: footer });
        if (imageUrl && /^https?:\/\//.test(imageUrl.trim())) {
          embed.setImage(imageUrl.trim());
        }

        embed.setTimestamp();

        // Now show a channel selector
        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply({
            content: "❌ This command can only be used in a server.",
          });
          return;
        }

        // Get text channels the bot can send to
        const textChannels = guild.channels.cache
          .filter(
            (c) =>
              (c.type === ChannelType.GuildText ||
                c.type === ChannelType.GuildAnnouncement) &&
              c
                .permissionsFor(guild.members.me!)
                ?.has(PermissionFlagsBits.SendMessages),
          )
          .map((c) => ({
            label: `#${c.name}`,
            value: c.id,
            description: c.parent?.name || undefined,
          }))
          .slice(0, 25); // Discord select menu limit

        if (textChannels.length === 0) {
          await interaction.editReply({
            content:
              "❌ I don't have permission to send messages in any text channels.",
          });
          return;
        }

        const key = `${guild.id}-${interaction.user.id}`;
        pendingEmbeds.set(key, {
          embed,
          guildId: guild.id,
          userId: interaction.user.id,
        });

        // Auto-cleanup after 5 minutes
        setTimeout(() => pendingEmbeds.delete(key), 5 * 60 * 1000);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`${CHANNEL_SELECT_PREFIX}${interaction.user.id}`)
          .setPlaceholder("Select a channel to send the embed to...")
          .addOptions(textChannels);

        const row =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu,
          );

        // Show preview + channel selector
        await interaction.editReply({
          content: "**📝 Embed Preview** — Select a channel below to send it:",
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        console.error("[Embeds] Error handling modal submit:", error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: "❌ Failed to build embed. Please try again.",
            });
          }
        } catch {}
      }
    }

    // Handle Channel Selection
    if (interaction.isStringSelectMenu()) {
      if (!interaction.customId.startsWith(CHANNEL_SELECT_PREFIX)) return;

      try {
        await interaction.deferUpdate();

        const key = `${interaction.guildId}-${interaction.user.id}`;
        const pending = pendingEmbeds.get(key);

        if (!pending) {
          await interaction.editReply({
            content: "❌ Embed data expired. Please create a new embed.",
            embeds: [],
            components: [],
          });
          return;
        }

        const channelId = interaction.values[0];
        const channel = interaction.guild?.channels.cache.get(
          channelId,
        ) as TextChannel;

        if (!channel) {
          await interaction.editReply({
            content: "❌ Channel not found.",
            embeds: [],
            components: [],
          });
          return;
        }

        // Send the embed
        await channel.send({ embeds: [pending.embed] });

        // Clean up
        pendingEmbeds.delete(key);

        await interaction.editReply({
          content: `✅ Embed sent to <#${channelId}> successfully!`,
          embeds: [pending.embed],
          components: [],
        });
      } catch (error) {
        console.error("[Embeds] Error sending embed:", error);
        try {
          await interaction.editReply({
            content:
              "❌ Failed to send embed. Check bot permissions in the target channel.",
            embeds: [],
            components: [],
          });
        } catch {}
      }
    }
  });
}

// ─── Command Handlers ────────────────────────────────────────────────────

async function handleEmbed(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  // Register the modal handler on first use
  registerModalHandler(interaction.client);

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_ID_PREFIX}${interaction.user.id}`)
    .setTitle("📝 Embed Builder");

  const titleInput = new TextInputBuilder()
    .setCustomId("embed_title")
    .setLabel("Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter embed title...")
    .setMaxLength(256)
    .setRequired(false);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("embed_description")
    .setLabel("Description")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      "Enter embed description (supports **bold**, *italic*, etc.)...",
    )
    .setMaxLength(4096)
    .setRequired(false);

  const colorInput = new TextInputBuilder()
    .setCustomId("embed_color")
    .setLabel("Color (hex like #5865F2 or name like blurple)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("#5865F2 or blurple, green, red, orange...")
    .setMaxLength(20)
    .setRequired(false);

  const footerInput = new TextInputBuilder()
    .setCustomId("embed_footer")
    .setLabel("Footer Text")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Optional footer text...")
    .setMaxLength(2048)
    .setRequired(false);

  const imageInput = new TextInputBuilder()
    .setCustomId("embed_image")
    .setLabel("Image URL")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://example.com/image.png")
    .setMaxLength(2048)
    .setRequired(false);

  // Each TextInput needs its own ActionRow
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
  );

  // Show the modal — must be done before deferring
  await interaction.showModal(modal);
}

async function handleEmbedQuick(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const channel = interaction.options.getChannel(
    "channel",
    true,
  ) as TextChannel;
  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description", true);
  const colorInput = interaction.options.getString("color");
  const footer = interaction.options.getString("footer");
  const imageUrl = interaction.options.getString("image");
  const thumbnailUrl = interaction.options.getString("thumbnail");

  // Build embed
  const embed = new EmbedBuilder();
  embed.setTitle(title);
  embed.setDescription(description);

  // Parse color
  if (colorInput) {
    const lowerColor = colorInput.toLowerCase().trim();
    if (PRESET_COLORS[lowerColor]) {
      embed.setColor(PRESET_COLORS[lowerColor]);
    } else {
      const parsedColor = parseColor(colorInput);
      if (parsedColor !== null) {
        embed.setColor(parsedColor);
      } else {
        embed.setColor(0x5865f2);
      }
    }
  } else {
    embed.setColor(0x5865f2);
  }

  if (footer) embed.setFooter({ text: footer });
  if (imageUrl && /^https?:\/\//.test(imageUrl.trim())) {
    embed.setImage(imageUrl.trim());
  }
  if (thumbnailUrl && /^https?:\/\//.test(thumbnailUrl.trim())) {
    embed.setThumbnail(thumbnailUrl.trim());
  }

  embed.setTimestamp();

  // Check permissions
  const permissions = channel.permissionsFor(interaction.guild!.members.me!);
  if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply({
      content: `❌ I don't have permission to send messages in <#${channel.id}>.`,
    });
    return;
  }

  try {
    await channel.send({ embeds: [embed] });
    await interaction.editReply({
      content: `✅ Embed sent to <#${channel.id}>!`,
      embeds: [embed],
    });
  } catch (error: any) {
    console.error("[Embeds] Quick send error:", error);
    await interaction.editReply({
      content: `❌ Failed to send embed: ${error.message}`,
    });
  }
}

// ─── Module Export ────────────────────────────────────────────────────────

const embedsModule: BotModule = {
  name: "embeds",
  description: "Create and send rich embed messages to any channel.",
  deferReply: false, // /embed uses showModal which requires no defer

  commands: [embedCommand.toJSON(), embedQuickCommand.toJSON()],

  async execute(
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) {
    const commandName = interaction.commandName;

    switch (commandName) {
      case "embed":
        return handleEmbed(interaction, moduleManager);
      case "embed-quick":
        // embed-quick needs a deferred reply since it doesn't use a modal
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        return handleEmbedQuick(interaction, moduleManager);
      default:
        await interaction.reply({
          content: "❌ Unknown embed command.",
          flags: [MessageFlags.Ephemeral],
        });
    }
  },
};

export default embedsModule;
