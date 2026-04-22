import {
  ChatInputCommandInteraction,
  ChannelType,
  ThreadChannel,
  GuildMember,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { TicketsSettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { getThreadMeta, buildMetaFooter, applyPriorityPrefix } from "../lib/utils";
import { isStaff } from "../lib/permissions";
import { PRIORITY_CONFIG, type TicketPriority } from "../lib/types";

// ── /ticket add ──────────────────────────────────────────────────────────────

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, guild, channel } = interaction;
  if (!guildId || !guild || !channel) return;
  if (!isTicketThread(channel.type)) {
    await interaction.editReply("❌ Use this command inside a ticket thread.");
    return;
  }

  const thread = channel as ThreadChannel;
  const target = interaction.options.getMember("user") as GuildMember | null;
  if (!target) {
    await interaction.editReply("❌ User not found.");
    return;
  }

  const appwrite = moduleManager.databaseService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);
  if (!settings) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const metaResult = await getThreadMeta(thread);

  if (!member || !metaResult) {
    await interaction.editReply("❌ This doesn't appear to be a valid ticket thread.");
    return;
  }

  if (!isStaff(member, settings, metaResult.meta.typeId)) {
    await interaction.editReply("❌ Only staff can add members to a ticket.");
    return;
  }

  await thread.members.add(target.id);
  await interaction.editReply(`✅ Added <@${target.id}> to the ticket.`);
}

// ── /ticket remove ───────────────────────────────────────────────────────────

export async function handleRemove(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, guild, channel } = interaction;
  if (!guildId || !guild || !channel) return;
  if (!isTicketThread(channel.type)) {
    await interaction.editReply("❌ Use this command inside a ticket thread.");
    return;
  }

  const thread = channel as ThreadChannel;
  const target = interaction.options.getMember("user") as GuildMember | null;
  if (!target) {
    await interaction.editReply("❌ User not found.");
    return;
  }

  const appwrite = moduleManager.databaseService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);
  if (!settings) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const metaResult = await getThreadMeta(thread);

  // Staff or ticket opener can remove
  if (!member || !metaResult) {
    await interaction.editReply("❌ This doesn't appear to be a valid ticket thread.");
    return;
  }

  if (
    interaction.user.id !== metaResult.meta.ownerId &&
    !isStaff(member, settings, metaResult.meta.typeId)
  ) {
    await interaction.editReply("❌ Only staff or the ticket opener can remove members.");
    return;
  }

  // Prevent removing the opener
  if (target.id === metaResult.meta.ownerId) {
    await interaction.editReply("❌ Cannot remove the ticket opener.");
    return;
  }

  await thread.members.remove(target.id);
  await interaction.editReply(`✅ Removed <@${target.id}> from the ticket.`);
}

// ── /ticket rename ───────────────────────────────────────────────────────────

export async function handleRename(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, guild, channel } = interaction;
  if (!guildId || !guild || !channel) return;
  if (!isTicketThread(channel.type)) {
    await interaction.editReply("❌ Use this command inside a ticket thread.");
    return;
  }

  const thread = channel as ThreadChannel;
  const newName = interaction.options.getString("name", true).trim().substring(0, 96);

  const appwrite = moduleManager.databaseService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);
  if (!settings) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const metaResult = await getThreadMeta(thread);
  if (!member || !metaResult) {
    await interaction.editReply("❌ This doesn't appear to be a valid ticket thread.");
    return;
  }

  if (!isStaff(member, settings, metaResult.meta.typeId)) {
    await interaction.editReply("❌ Only staff can rename tickets.");
    return;
  }

  await thread.setName(newName);
  await interaction.editReply(`✅ Ticket renamed to **${newName}**.`);
}

// ── /ticket priority ─────────────────────────────────────────────────────────

export async function handlePriority(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, guild, channel } = interaction;
  if (!guildId || !guild || !channel) return;
  if (!isTicketThread(channel.type)) {
    await interaction.editReply("❌ Use this command inside a ticket thread.");
    return;
  }

  const thread = channel as ThreadChannel;
  const priority = interaction.options.getString("level", true) as TicketPriority;

  if (!["low", "normal", "high", "critical"].includes(priority)) {
    await interaction.editReply("❌ Invalid priority level.");
    return;
  }

  const appwrite = moduleManager.databaseService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);
  if (!settings) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const metaResult = await getThreadMeta(thread);
  if (!member || !metaResult) {
    await interaction.editReply("❌ This doesn't appear to be a valid ticket thread.");
    return;
  }

  if (!isStaff(member, settings, metaResult.meta.typeId)) {
    await interaction.editReply("❌ Only staff can set ticket priority.");
    return;
  }

  const { messageId, meta } = metaResult;
  const conf = PRIORITY_CONFIG[priority];
  const updatedMeta = { ...meta, priority } as typeof meta;

  // Rename thread to reflect priority (prefix emoji)
  const newThreadName = applyPriorityPrefix(thread.name, conf.emoji, priority);
  await thread.setName(newThreadName).catch(() => {});

  // Update pinned info embed
  const typeLabel =
    settings.types.find((t) => t.id === meta.typeId)?.name ?? "General Support";

  const updatedEmbed = new EmbedBuilder()
    .setTitle(`📋 Ticket #${String(meta.ticketId).padStart(4, "0")}`)
    .setColor(conf.color)
    .addFields(
      { name: "👤 Opened By", value: `<@${meta.ownerId}>`, inline: true },
      { name: "🏷️ Type", value: typeLabel, inline: true },
      {
        name: "📅 Opened",
        value: `<t:${Math.floor(new Date(meta.openedAt).getTime() / 1000)}:R>`,
        inline: true,
      },
      {
        name: "⚡ Status",
        value: meta.status === "claimed" ? "🟢 Claimed" : "🔵 Open",
        inline: true,
      },
      {
        name: "🏷️ Priority",
        value: `${conf.emoji} ${conf.label}`,
        inline: true,
      },
      {
        name: "👷 Claimed By",
        value: meta.claimedById ? `<@${meta.claimedById}>` : "Unclaimed",
        inline: true,
      },
    )
    .setFooter(buildMetaFooter(updatedMeta));

  try {
    const pinnedMsg = await thread.messages.fetch(messageId);
    await pinnedMsg.edit({ embeds: [updatedEmbed.toJSON()] });
  } catch {
    /* ignore if message was deleted */
  }

  await interaction.editReply(
    `${conf.emoji} Priority set to **${conf.label}**.`,
  );
}

// ── /ticket transcript ───────────────────────────────────────────────────────

export async function handleTranscript(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, channel } = interaction;
  if (!guildId || !channel) return;
  if (!isTicketThread(channel.type)) {
    await interaction.editReply("❌ Use this command inside a ticket thread.");
    return;
  }

  const { generateMarkdownTranscript } = await import("../lib/transcript");
  const { AttachmentBuilder } = await import("discord.js");

  const thread = channel as ThreadChannel;
  const buf = await generateMarkdownTranscript(thread);
  const attachment = new AttachmentBuilder(buf, {
    name: `${thread.name}-transcript.md`,
  });

  await interaction.editReply({
    content: "📄 Here is the current transcript:",
    files: [attachment],
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function isTicketThread(type: ChannelType): boolean {
  return (
    type === ChannelType.PrivateThread || type === ChannelType.PublicThread
  );
}
