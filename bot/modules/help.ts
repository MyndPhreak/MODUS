import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ─── Types ────────────────────────────────────────────────────────────────

interface ModulePage {
  name: string;
  description: string;
  commands: { name: string; description: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, string> = {
  help: "❓",
  ping: "🏓",
  music: "🎵",
  embeds: "📝",
  reload: "🔄",
  welcome: "👋",
};

function getModuleIcon(name: string): string {
  return MODULE_ICONS[name.toLowerCase()] || "📦";
}

function buildPages(moduleManager: ModuleManager): ModulePage[] {
  const registered = moduleManager.getRegisteredModules();
  const pages: ModulePage[] = [];

  for (const [, mod] of registered) {
    const commands: { name: string; description: string }[] = [];

    if (mod.commands && mod.commands.length > 0) {
      for (const cmd of mod.commands) {
        commands.push({
          name: `/${cmd.name}`,
          description: cmd.description || "No description.",
        });
      }
    } else if (mod.data) {
      commands.push({
        name: `/${mod.data.name}`,
        description: mod.data.description || "No description.",
      });
    }

    pages.push({
      name: mod.name,
      description: mod.description || "No description provided.",
      commands,
    });
  }

  // Sort alphabetically for consistency
  pages.sort((a, b) => a.name.localeCompare(b.name));
  return pages;
}

function buildEmbed(pages: ModulePage[], pageIndex: number): EmbedBuilder {
  const page = pages[pageIndex];
  const icon = getModuleIcon(page.name);
  const totalPages = pages.length;

  const commandList =
    page.commands.length > 0
      ? page.commands
          .map((cmd) => `> **${cmd.name}**\n> ${cmd.description}`)
          .join("\n\n")
      : "> *No commands registered.*";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `Module Help — Page ${pageIndex + 1} of ${totalPages}`,
    })
    .setTitle(
      `${icon}  ${page.name.charAt(0).toUpperCase() + page.name.slice(1)}`,
    )
    .setDescription(`*${page.description}*`)
    .addFields({
      name: "Commands",
      value: commandList,
    })
    .setFooter({
      text: `Use the buttons below to browse modules • ${totalPages} modules loaded`,
    })
    .setTimestamp();

  return embed;
}

function buildButtons(
  pageIndex: number,
  totalPages: number,
  disabled: boolean = false,
): ActionRowBuilder<ButtonBuilder> {
  const prevButton = new ButtonBuilder()
    .setCustomId("help_prev")
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || pageIndex === 0);

  const pageIndicator = new ButtonBuilder()
    .setCustomId("help_page_indicator")
    .setLabel(`${pageIndex + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true); // Always disabled — just a label

  const nextButton = new ButtonBuilder()
    .setCustomId("help_next")
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || pageIndex === totalPages - 1);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevButton,
    pageIndicator,
    nextButton,
  );
}

// ─── Module Export ────────────────────────────────────────────────────────

const helpModule: BotModule = {
  name: "help",
  description:
    "Browse all available modules and commands in a private paginated view.",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse all available modules and commands.")
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const pages = buildPages(moduleManager);

    if (pages.length === 0) {
      await interaction.editReply({
        content: "No modules are currently loaded.",
      });
      return;
    }

    let currentPage = 0;

    const embed = buildEmbed(pages, currentPage);
    const buttons = buildButtons(currentPage, pages.length);

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [buttons],
    });

    // Create a collector that only responds to the original user
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 2 * 60 * 1000, // 2 minutes
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.customId === "help_prev") {
        currentPage = Math.max(0, currentPage - 1);
      } else if (buttonInteraction.customId === "help_next") {
        currentPage = Math.min(pages.length - 1, currentPage + 1);
      }

      const updatedEmbed = buildEmbed(pages, currentPage);
      const updatedButtons = buildButtons(currentPage, pages.length);

      await buttonInteraction.update({
        embeds: [updatedEmbed],
        components: [updatedButtons],
      });
    });

    collector.on("end", async () => {
      // Disable buttons after timeout
      try {
        const disabledButtons = buildButtons(currentPage, pages.length, true);
        await interaction.editReply({
          components: [disabledButtons],
        });
      } catch {
        // Message may have been deleted
      }
    });
  },
};

export default helpModule;
