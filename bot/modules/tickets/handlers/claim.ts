import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ChannelType,
  ThreadChannel,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { TicketsSettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { getThreadMeta, buildMetaFooter } from "../lib/utils";
import { isStaff } from "../lib/permissions";
import { PRIORITY_CONFIG } from "../lib/types";

// ── Claim handler ────────────────────────────────────────────────────────────

export async function handleClaim(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, guild, channel } = interaction;
  if (!guildId || !guild || !channel) return;

  const isThread =
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.PublicThread;
  if (!isThread) {
    await safeReply(interaction, "❌ Use this command inside a ticket thread.");
    return;
  }

  const thread = channel as ThreadChannel;
  const appwrite = moduleManager.appwriteService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);
  if (!settings) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const metaResult = await getThreadMeta(thread);
  if (!metaResult) {
    await safeReply(interaction, "❌ This doesn't appear to be a valid ticket thread.");
    return;
  }

  const { messageId, meta } = metaResult;

  // Only staff can claim
  if (!isStaff(member, settings, meta.typeId)) {
    await safeReply(interaction, "❌ Only staff members can claim tickets.");
    return;
  }

  const isClaiming = meta.claimedById !== interaction.user.id;
  const newStatus = isClaiming ? "claimed" : "open";
  const newClaimedById = isClaiming ? interaction.user.id : null;

  const updatedMeta = {
    ...meta,
    status: newStatus,
    claimedById: newClaimedById,
  } as typeof meta;

  // Rebuild info embed with updated status
  const priority = PRIORITY_CONFIG[meta.priority];
  const typeLabel =
    settings.types.find((t) => t.id === meta.typeId)?.name ?? "General Support";

  const updatedEmbed = new EmbedBuilder()
    .setTitle(`📋 Ticket #${String(meta.ticketId).padStart(4, "0")}`)
    .setColor(isClaiming ? 0x57f287 : 0x5865f2)
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
        value: isClaiming ? "🟢 Claimed" : "🔵 Open",
        inline: true,
      },
      {
        name: "🏷️ Priority",
        value: `${priority.emoji} ${priority.label}`,
        inline: true,
      },
      {
        name: "👷 Claimed By",
        value: isClaiming ? `<@${interaction.user.id}>` : "Unclaimed",
        inline: true,
      },
    )
    .setFooter(buildMetaFooter(updatedMeta));

  // Edit the pinned info message in-place
  try {
    const pinnedMsg = await thread.messages.fetch(messageId);
    await pinnedMsg.edit({ embeds: [updatedEmbed.toJSON()] });
  } catch {
    // If we can't edit the pinned message, still post the status update
  }

  const statusText = isClaiming
    ? `🙋 Ticket claimed by <@${interaction.user.id}>`
    : `↩️ Ticket released by <@${interaction.user.id}>`;

  await safeReply(interaction, statusText);

  moduleManager.logger.info(
    `Ticket #${meta.ticketId} ${isClaiming ? "claimed" : "unclaimed"} by ${interaction.user.tag}`,
    guildId,
    "tickets",
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function safeReply(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: [MessageFlags.Ephemeral] });
    }
  } catch {
    /* ignore */
  }
}
