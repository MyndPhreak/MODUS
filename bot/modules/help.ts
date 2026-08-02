import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  type AnyComponentBuilder,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import { buildV2Layout } from "../lib/components-v2";

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
  tickets: "🎫",
  moderation: "🛡️",
  automod: "🤖",
  antiraid: "🚨",
  ai: "🧠",
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
        const desc = "description" in cmd && typeof cmd.description === "string" ? cmd.description : "No description.";
        commands.push({
          name: `/${cmd.name}`,
          description: desc,
        });
      }
    } else if (mod.data) {
      const desc = "description" in mod.data && typeof mod.data.description === "string" ? mod.data.description : "No description.";
      commands.push({
        name: `/${mod.data.name}`,
        description: desc,
      });
    }


    pages.push({
      name: mod.name,
      description: mod.description || "No description provided.",
      commands,
    });
  }

  pages.sort((a, b) => a.name.localeCompare(b.name));
  return pages;
}

function buildV2HelpPage(pages: ModulePage[], pageIndex: number): any[] {

  const page = pages[pageIndex];
  const icon = getModuleIcon(page.name);
  const totalPages = pages.length;

  const fields = page.commands.map((cmd) => ({
    name: cmd.name,
    value: cmd.description,
  }));

  return buildV2Layout({
    title: `${icon} ${page.name.charAt(0).toUpperCase() + page.name.slice(1)} Module`,
    description: `*${page.description}*\n\nPage ${pageIndex + 1} of ${totalPages}`,
    fields,
    footer: `Use the navigation buttons or dropdown below • ${totalPages} modules loaded`,
    useContainer: true,
  });
}

function buildInteractiveRows(
  pages: ModulePage[],
  pageIndex: number,
  disabled = false,
): ActionRowBuilder<any>[] {
  const totalPages = pages.length;

  // Category select dropdown
  const selectOptions = pages.slice(0, 25).map((p, idx) => ({
    label: `${getModuleIcon(p.name)} ${p.name.charAt(0).toUpperCase() + p.name.slice(1)}`,
    value: idx.toString(),
    description: p.description.slice(0, 50),
    default: idx === pageIndex,
  }));

  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("Jump to a module...")
    .addOptions(selectOptions)
    .setDisabled(disabled);

  const prevButton = new ButtonBuilder()
    .setCustomId("help_prev")
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || pageIndex === 0);

  const pageIndicator = new ButtonBuilder()
    .setCustomId("help_page_indicator")
    .setLabel(`${pageIndex + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const nextButton = new ButtonBuilder()
    .setCustomId("help_next")
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || pageIndex === totalPages - 1);

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevButton,
    pageIndicator,
    nextButton,
  );

  return [row1, row2];
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

    const v2Layout = buildV2HelpPage(pages, currentPage);
    const interactiveRows = buildInteractiveRows(pages, currentPage);

    const reply = await interaction.editReply({
      components: [...v2Layout, ...interactiveRows],
    });

    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 3 * 60 * 1000,
    });

    collector.on("collect", async (componentInteraction) => {
      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === "help_category_select") {
        currentPage = parseInt(componentInteraction.values[0], 10);
      } else if (componentInteraction.isButton()) {
        if (componentInteraction.customId === "help_prev") {
          currentPage = Math.max(0, currentPage - 1);
        } else if (componentInteraction.customId === "help_next") {
          currentPage = Math.min(pages.length - 1, currentPage + 1);
        }
      }

      const updatedV2Layout = buildV2HelpPage(pages, currentPage);
      const updatedRows = buildInteractiveRows(pages, currentPage);

      await componentInteraction.update({
        components: [...updatedV2Layout, ...updatedRows],
      });
    });

    collector.on("end", async () => {
      try {
        const disabledRows = buildInteractiveRows(pages, currentPage, true);
        const finalV2Layout = buildV2HelpPage(pages, currentPage);
        await interaction.editReply({
          components: [...finalV2Layout, ...disabledRows],
        });
      } catch {}
    });
  },
};

export default helpModule;

