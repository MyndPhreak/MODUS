/**
 * modules/tickets/lib/inactivity.ts
 *
 * Background sweep that auto-closes ticket threads that have been idle
 * longer than the guild-configured `inactivityHours` threshold.
 *
 * Design notes:
 *  - Runs every SWEEP_INTERVAL_MS (30 min). A first sweep fires after one
 *    interval so the bot has time to warm up after restarts.
 *  - Uses the Discord snowflake encoded in `thread.lastMessageId` to derive
 *    the last-message timestamp with zero extra API calls.
 *  - Only fetches pinned messages (to verify ticket meta) once a thread has
 *    already breached the time threshold — minimising rate-limit pressure.
 *  - Covers all parent channels defined across ticket types, not just the
 *    global defaultParentChannelId.
 */

import { Client, ChannelType, TextChannel, ThreadChannel, AttachmentBuilder, EmbedBuilder } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { TicketsSettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { generateMarkdownTranscript } from "./transcript";
import { getThreadMeta } from "./utils";
import { snowflakeToMs } from "../../../lib/discord-utils";

const SWEEP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// snowflakeToMs is imported from ../../lib/discord-utils

// ── Main sweep ────────────────────────────────────────────────────────────────

async function runSweep(client: Client, moduleManager: ModuleManager): Promise<void> {
  const appwrite = moduleManager.databaseService;

  for (const guild of client.guilds.cache.values()) {
    try {
      // Load and validate settings for this guild
      const rawSettings = await appwrite.getModuleSettings(guild.id, "tickets");
      const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guild.id);
      if (!settings || settings.inactivityHours <= 0) continue;

      // Check module is enabled for this guild
      const isEnabled = await appwrite.isModuleEnabled(guild.id, "tickets");
      if (!isEnabled) continue;

      const cutoffMs = settings.inactivityHours * 60 * 60 * 1000;
      const now = Date.now();

      // Collect all parent channels (global + per-type overrides)
      const parentChannelIds = new Set<string>();
      if (settings.defaultParentChannelId) {
        parentChannelIds.add(settings.defaultParentChannelId);
      }
      for (const type of settings.types) {
        if (type.parentChannelId) parentChannelIds.add(type.parentChannelId);
      }

      if (parentChannelIds.size === 0) continue;

      for (const chId of parentChannelIds) {
        const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
        if (!ch || ch.type !== ChannelType.GuildText) continue;

        const activeThreads = await ch.threads.fetchActive().catch(() => null);
        if (!activeThreads) continue;

        for (const thread of activeThreads.threads.values()) {
          if (thread.archived || thread.locked) continue;
          if (thread.type !== ChannelType.PrivateThread && thread.type !== ChannelType.PublicThread) continue;

          // Derive last-activity time from the lastMessageId snowflake (no API call)
          const lastMsgId = thread.lastMessageId;
          const lastActivityMs = lastMsgId
            ? snowflakeToMs(lastMsgId)
            : (thread.createdTimestamp ?? now);

          if (now - lastActivityMs < cutoffMs) continue;

          // Time threshold breached — confirm it's a managed ticket thread
          const metaResult = await getThreadMeta(thread as ThreadChannel);
          if (!metaResult) continue;

          moduleManager.logger.info(
            `Auto-closing idle ticket #${metaResult.meta.ticketId} (${thread.name}) — ${settings.inactivityHours}h without activity`,
            guild.id,
            "tickets",
          );

          // Post closing notice
          await thread
            .send({
              content: `🕐 This ticket has been automatically closed due to **${settings.inactivityHours} hour(s)** of inactivity.`,
            })
            .catch(() => {});

          // Generate + post transcript (best-effort)
          try {
            const buf = await generateMarkdownTranscript(thread as ThreadChannel);
            const filename = `${thread.name}-transcript.md`;
            const attachment = new AttachmentBuilder(buf, { name: filename });

            // Log to transcript channel if configured
            if (settings.transcriptChannelId) {
              const logCh = guild.channels.cache.get(settings.transcriptChannelId) as
                | TextChannel
                | undefined;
              if (logCh?.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                  .setTitle(`🗂️ Ticket Closed (Inactivity) — #${String(metaResult.meta.ticketId).padStart(4, "0")}`)
                  .setColor(0x5865f2)
                  .addFields(
                    { name: "👤 Opened By", value: `<@${metaResult.meta.ownerId}>`, inline: true },
                    { name: "📅 Opened", value: `<t:${Math.floor(new Date(metaResult.meta.openedAt).getTime() / 1000)}:R>`, inline: true },
                  )
                  .setTimestamp();
                await logCh
                  .send({ embeds: [logEmbed.toJSON()], files: [attachment] })
                  .catch(() => {});
              }
            }

            // DM opener if configured
            if (settings.dmTranscript) {
              const opener = await guild.members.fetch(metaResult.meta.ownerId).catch(() => null);
              if (opener) {
                const dmAttachment = new AttachmentBuilder(buf, { name: filename });
                await opener
                  .send({
                    content: `Your ticket **${thread.name}** was automatically closed due to inactivity. Here is your transcript:`,
                    files: [dmAttachment],
                  })
                  .catch(() => {});
              }
            }
          } catch {
            // Transcript failure is non-fatal
          }

          // Lock and archive
          await (thread as ThreadChannel).setLocked(true, "Auto-closed: inactivity").catch(() => {});
          await (thread as ThreadChannel).setArchived(true, "Auto-closed: inactivity").catch(() => {});
        }
      }
    } catch (err) {
      moduleManager.logger.error(
        "Inactivity sweep error for guild",
        guild.id,
        err,
        "tickets",
      );
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Starts the recurring inactivity sweep.
 * The first sweep fires after one interval (30 min) to let the bot warm up.
 */
export function startInactivitySweep(client: Client, moduleManager: ModuleManager): void {
  setInterval(async () => {
    try {
      await runSweep(client, moduleManager);
    } catch (err) {
      moduleManager.logger.error("Inactivity sweep top-level failure", undefined, err, "tickets");
    }
  }, SWEEP_INTERVAL_MS);

  moduleManager.logger.info(
    `Inactivity sweep scheduled (interval: ${SWEEP_INTERVAL_MS / 60000} min)`,
    undefined,
    "tickets",
  );
}
