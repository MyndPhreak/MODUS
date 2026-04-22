import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ChannelType,
  ThreadChannel,
  TextChannel,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { TicketsSettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { getThreadMeta } from "../lib/utils";
import { generateMarkdownTranscript } from "../lib/transcript";
import { snapshotTranscript } from "../lib/snapshot";
import { isStaff } from "../lib/permissions";

// ── Close handler ────────────────────────────────────────────────────────────

export async function handleClose(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const { guildId, guild, channel } = interaction;
  if (!guildId || !guild || !channel) return;

  const isThread =
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.PublicThread;

  if (!isThread) {
    await safeReply(interaction, "❌ This can only be used inside a ticket thread.");
    return;
  }

  const thread = channel as ThreadChannel;

  // Resolve settings
  const appwrite = moduleManager.databaseService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);

  if (!settings) {
    await safeReply(interaction, "❌ Ticket system not configured.");
    return;
  }

  // Get ticket metadata from pinned embed
  const metaResult = await getThreadMeta(thread);
  if (!metaResult) {
    await safeReply(interaction, "❌ This doesn't appear to be a valid ticket thread.");
    return;
  }

  const { meta } = metaResult;

  // Permission check: opener OR staff can close
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const canClose =
    interaction.user.id === meta.ownerId ||
    isStaff(member, settings, meta.typeId);

  if (!canClose) {
    await safeReply(interaction, "❌ Only the ticket opener or staff can close this ticket.");
    return;
  }

  // Acknowledge first — transcript generation can take a moment
  await safeReply(interaction, "🔒 Closing ticket and generating transcript…");

  try {
    // ── Generate transcript ────────────────────────────────────────────────
    const transcriptBuffer = await generateMarkdownTranscript(thread);
    const filename = `${thread.name}-transcript.md`;
    const attachment = new AttachmentBuilder(transcriptBuffer, { name: filename });

    // ── Snapshot to web transcript (optional, feature-flagged) ────────────
    let webUrl: string | null = null;
    try {
      const snapshot = await snapshotTranscript(
        thread,
        meta,
        settings,
        moduleManager,
        interaction.user.id,
      );
      if (snapshot) {
        const base = process.env.PUBLIC_WEB_URL?.replace(/\/$/, "");
        if (base) webUrl = `${base}/ticket/${snapshot.slug}`;
      }
    } catch (err) {
      moduleManager.logger.error(
        "Failed to snapshot ticket transcript",
        guildId,
        err,
        "tickets",
      );
    }

    // ── Post transcript to log channel ────────────────────────────────────
    if (settings.transcriptChannelId) {
      const logChannel = guild.channels.cache.get(settings.transcriptChannelId) as
        | TextChannel
        | undefined;
      if (logChannel?.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`🗂️ Ticket Closed — #${String(meta.ticketId).padStart(4, "0")}`)
          .setColor(0x5865f2)
          .addFields(
            { name: "👤 Opened By", value: `<@${meta.ownerId}>`, inline: true },
            {
              name: "🏷️ Type",
              value:
                settings.types.find((t) => t.id === meta.typeId)?.name ??
                "General Support",
              inline: true,
            },
            {
              name: "👷 Closed By",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            {
              name: "📅 Opened",
              value: `<t:${Math.floor(new Date(meta.openedAt).getTime() / 1000)}:R>`,
              inline: true,
            },
            ...(webUrl
              ? [{ name: "🔗 Web Transcript", value: webUrl, inline: false }]
              : []),
          )
          .setTimestamp();

        await logChannel
          .send({ embeds: [logEmbed.toJSON()], files: [attachment] })
          .catch((err) =>
            moduleManager.logger.error(
              "Failed to post transcript to log channel",
              guildId,
              err,
              "tickets",
            ),
          );
      }
    }

    // ── DM transcript to opener ────────────────────────────────────────────
    if (settings.dmTranscript) {
      try {
        const opener = await guild.members.fetch(meta.ownerId).catch(() => null);
        if (opener) {
          const dmAttachment = new AttachmentBuilder(transcriptBuffer, { name: filename });
          const dmContent = webUrl
            ? `Your ticket **${thread.name}** was closed. View online: ${webUrl}\n\nMarkdown copy attached below.`
            : `Your ticket **${thread.name}** was closed. Here is your transcript:`;
          await opener.send({ content: dmContent, files: [dmAttachment] }).catch(() => {
            // Silently ignore — user may have DMs disabled
          });
        }
      } catch {
        // Non-fatal
      }
    }

    // ── Lock and archive the thread ───────────────────────────────────────
    await thread.setLocked(true, "Ticket closed").catch(() => {});
    await thread.setArchived(true, "Ticket closed").catch(() => {});

    moduleManager.logger.info(
      `Ticket #${meta.ticketId} (${thread.name}) closed by ${interaction.user.tag}`,
      guildId,
      "tickets",
    );
  } catch (err) {
    moduleManager.logger.error("Error during ticket close", guildId, err, "tickets");
    await safeReply(
      interaction,
      "⚠️ Ticket closed, but an error occurred generating the transcript.",
    );
  }
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
