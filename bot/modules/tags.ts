import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../ModuleManager";
import type { BotModule } from "../ModuleManager";

// ─── Command Definitions ─────────────────────────────────────────────────

const tagCommand = new SlashCommandBuilder()
  .setName("tag")
  .setDescription("Post a saved tag/snippet")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Tag name to post")
      .setRequired(true)
      .setAutocomplete(true),
  );

const tagCreateCommand = new SlashCommandBuilder()
  .setName("tag-create")
  .setDescription("Create a new tag/snippet")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Tag name (lowercase, no spaces — use hyphens)")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("Plain text content for the tag")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("embed-title")
      .setDescription("Embed title (creates an embed tag)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("embed-description")
      .setDescription("Embed description")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("embed-color")
      .setDescription("Embed color hex (e.g., #5865F2)")
      .setRequired(false),
  );

const tagDeleteCommand = new SlashCommandBuilder()
  .setName("tag-delete")
  .setDescription("Delete an existing tag")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Tag name to delete")
      .setRequired(true)
      .setAutocomplete(true),
  );

const tagListCommand = new SlashCommandBuilder()
  .setName("tag-list")
  .setDescription("List all available tags in this server");

// ─── Helpers ─────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

function parseColor(input: string): number | null {
  if (!input || !input.trim()) return null;
  const cleaned = input.trim().replace("#", "");
  const parsed = parseInt(cleaned, 16);
  if (isNaN(parsed) || parsed < 0 || parsed > 0xffffff) return null;
  return parsed;
}

// ─── Command Handlers ────────────────────────────────────────────────────

async function handleTag(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const name = interaction.options.getString("name", true);
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      content: "❌ This command can only be used in a server.",
    });
    return;
  }

  const tag = await moduleManager.appwriteService.getTagByName(guildId, name);
  if (!tag) {
    await interaction.editReply({
      content: `❌ Tag \`${name}\` not found. Use \`/tag-list\` to see available tags.`,
    });
    return;
  }

  // Check role restrictions
  if (tag.allowed_roles) {
    try {
      const allowedRoles: string[] = JSON.parse(tag.allowed_roles);
      if (allowedRoles.length > 0) {
        const member = interaction.member;
        const memberRoles =
          member && "cache" in (member.roles as any)
            ? Array.from((member.roles as any).cache.keys())
            : Array.isArray(member?.roles)
              ? member.roles
              : [];
        const hasPermission = allowedRoles.some((r: string) =>
          (memberRoles as string[]).includes(r),
        );
        if (!hasPermission) {
          await interaction.editReply({
            content: "❌ You don't have the required role to use this tag.",
          });
          return;
        }
      }
    } catch {
      // If parsing fails, allow access
    }
  }

  // Send the tag content
  if (tag.embed_data) {
    try {
      const embedData = JSON.parse(tag.embed_data);
      const embed = new EmbedBuilder();
      if (embedData.title) embed.setTitle(embedData.title);
      if (embedData.description) embed.setDescription(embedData.description);
      if (embedData.color !== undefined) embed.setColor(embedData.color);
      if (embedData.url) embed.setURL(embedData.url);
      if (embedData.footer) embed.setFooter(embedData.footer);
      if (embedData.image) embed.setImage(embedData.image.url);
      if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail.url);
      if (embedData.author) embed.setAuthor(embedData.author);
      if (embedData.fields) embed.setFields(embedData.fields);
      if (embedData.timestamp) embed.setTimestamp();

      // If there's also plain text content, send it alongside
      await interaction.editReply({
        content: tag.content || undefined,
        embeds: [embed],
      });
    } catch (error) {
      console.error("[Tags] Error parsing embed data:", error);
      await interaction.editReply({
        content: tag.content || "❌ Failed to render tag embed.",
      });
    }
  } else if (tag.content) {
    await interaction.editReply({ content: tag.content });
  } else {
    await interaction.editReply({
      content: "❌ This tag has no content.",
    });
  }
}

async function handleTagCreate(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const rawName = interaction.options.getString("name", true);
  const name = slugify(rawName);
  const content = interaction.options.getString("content");
  const embedTitle = interaction.options.getString("embed-title");
  const embedDescription = interaction.options.getString("embed-description");
  const embedColor = interaction.options.getString("embed-color");
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply({
      content: "❌ This command can only be used in a server.",
    });
    return;
  }

  if (!name) {
    await interaction.editReply({
      content:
        "❌ Invalid tag name. Use lowercase letters, numbers, and hyphens.",
    });
    return;
  }

  if (!content && !embedTitle && !embedDescription) {
    await interaction.editReply({
      content:
        "❌ Provide at least `content`, `embed-title`, or `embed-description`.",
    });
    return;
  }

  // Check if tag already exists
  const existing = await moduleManager.appwriteService.getTagByName(
    guildId,
    name,
  );
  if (existing) {
    await interaction.editReply({
      content: `❌ Tag \`${name}\` already exists. Delete it first or use the dashboard to edit.`,
    });
    return;
  }

  // Build embed data if any embed fields are provided
  let embedData: string | undefined;
  if (embedTitle || embedDescription) {
    const embed: Record<string, any> = {};
    if (embedTitle) embed.title = embedTitle;
    if (embedDescription) embed.description = embedDescription;
    const color = parseColor(embedColor || "");
    embed.color = color !== null ? color : 0x5865f2;
    embedData = JSON.stringify(embed);
  }

  try {
    await moduleManager.appwriteService.createTag({
      guild_id: guildId,
      name,
      content: content || undefined,
      embed_data: embedData,
      created_by: interaction.user.id,
    });

    const preview = new EmbedBuilder()
      .setTitle("✅ Tag Created")
      .setDescription(`Tag \`${name}\` has been created successfully.`)
      .setColor(0x57f287)
      .addFields(
        {
          name: "Usage",
          value: `\`/tag ${name}\``,
          inline: true,
        },
        {
          name: "Type",
          value: embedData ? "Embed" : "Text",
          inline: true,
        },
      );

    await interaction.editReply({ embeds: [preview] });
  } catch (error: any) {
    console.error("[Tags] Error creating tag:", error);
    await interaction.editReply({
      content: `❌ Failed to create tag: ${error.message || "Unknown error"}`,
    });
  }
}

async function handleTagDelete(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const name = interaction.options.getString("name", true);
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply({
      content: "❌ This command can only be used in a server.",
    });
    return;
  }

  const tag = await moduleManager.appwriteService.getTagByName(guildId, name);
  if (!tag) {
    await interaction.editReply({
      content: `❌ Tag \`${name}\` not found.`,
    });
    return;
  }

  try {
    await moduleManager.appwriteService.deleteTag(tag.$id, guildId);
    await interaction.editReply({
      content: `✅ Tag \`${name}\` has been deleted.`,
    });
  } catch (error: any) {
    console.error("[Tags] Error deleting tag:", error);
    await interaction.editReply({
      content: `❌ Failed to delete tag: ${error.message || "Unknown error"}`,
    });
  }
}

async function handleTagList(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      content: "❌ This command can only be used in a server.",
    });
    return;
  }

  const tags = await moduleManager.appwriteService.getTags(guildId);

  if (tags.length === 0) {
    await interaction.editReply({
      content:
        "📭 No tags found for this server. Staff can create tags with `/tag-create` or from the dashboard.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🏷️ Available Tags")
    .setColor(0x5865f2)
    .setDescription(
      tags
        .map((t) => {
          const type = t.embed_data ? "📦 Embed" : "📝 Text";
          return `\`${t.name}\` — ${type}`;
        })
        .join("\n"),
    )
    .setFooter({
      text: `${tags.length} tag${tags.length !== 1 ? "s" : ""} available • Use /tag <name> to post`,
    });

  await interaction.editReply({ embeds: [embed] });
}

// ─── Autocomplete Handler ────────────────────────────────────────────────

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  moduleManager: ModuleManager,
) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const focused = interaction.options.getFocused().toLowerCase();
  const tags = await moduleManager.appwriteService.getTags(guildId);

  const filtered = tags
    .filter((t) => t.name.includes(focused))
    .slice(0, 25)
    .map((t) => ({
      name: t.name,
      value: t.name,
    }));

  await interaction.respond(filtered);
}

// ─── Module Export ────────────────────────────────────────────────────────

const tagsModule: BotModule = {
  name: "tags",
  description: "Create and use custom tags/snippets with embeds or text.",

  commands: [
    tagCommand.toJSON(),
    tagCreateCommand.toJSON(),
    tagDeleteCommand.toJSON(),
    tagListCommand.toJSON(),
  ],

  async execute(
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) {
    const commandName = interaction.commandName;

    switch (commandName) {
      case "tag":
        return handleTag(interaction, moduleManager);
      case "tag-create":
        return handleTagCreate(interaction, moduleManager);
      case "tag-delete":
        return handleTagDelete(interaction, moduleManager);
      case "tag-list":
        return handleTagList(interaction, moduleManager);
      default:
        await interaction.editReply({
          content: "❌ Unknown tag command.",
        });
    }
  },

  async autocomplete(
    interaction: AutocompleteInteraction,
    moduleManager: ModuleManager,
  ) {
    return handleAutocomplete(interaction, moduleManager);
  },
};

export default tagsModule;
