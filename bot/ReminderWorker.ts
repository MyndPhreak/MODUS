/**
 * ReminderWorker — Dispatches due reminders across Discord channels or DMs.
 * Cadence: Every 15 seconds.
 *
 * Gated by LeaderElection in bot/index.ts so only one shard processes reminders.
 */
import { EmbedBuilder, type Client } from "discord.js";
import type { DatabaseService } from "./DatabaseService";
import type { Logger } from "./Logger";

const POLL_INTERVAL_MS = 15_000;

export class ReminderWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private client: Client,
    private db: DatabaseService,
    private logger: Logger,
  ) {}

  start(): void {
    // Initial run immediately, then recurring
    this.runSweep().catch((err) => {
      this.logger.error("Initial reminder sweep failed", undefined, err, "reminders");
    });

    this.timer = setInterval(() => {
      this.runSweep().catch((err) => {
        this.logger.error("Reminder sweep failed", undefined, err, "reminders");
      });
    }, POLL_INTERVAL_MS);

    this.logger.info("Reminder worker started (15s interval)", undefined, "reminders");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSweep(): Promise<void> {
    const now = new Date();
    const dueReminders = await this.db.reminders.getDueReminders(now, 100);

    if (dueReminders.length === 0) {
      return;
    }

    for (const reminder of dueReminders) {
      try {
        await this.dispatchReminder(reminder);
      } catch (err) {
        this.logger.error(
          `Failed to dispatch reminder ${reminder.id} for user ${reminder.userId}`,
          reminder.guildId ?? undefined,
          err,
          "reminders",
        );
      } finally {
        await this.db.reminders.markCompleted(reminder.id).catch((err) => {
          this.logger.error(
            `Failed to mark reminder ${reminder.id} completed`,
            reminder.guildId ?? undefined,
            err,
            "reminders",
          );
        });
      }
    }
  }

  private async dispatchReminder(reminder: {
    id: string;
    userId: string;
    channelId: string;
    guildId: string | null;
    reminder: string;
    remindAt: Date;
    messageUrl: string | null;
    quotedContent: string | null;
  }): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle("⏰ Reminder")
      .setDescription(reminder.reminder)
      .setColor(0x5865f2)
      .setTimestamp(reminder.remindAt);

    if (reminder.quotedContent || reminder.messageUrl) {
      const parts: string[] = [];
      if (reminder.quotedContent) {
        parts.push(`> ${reminder.quotedContent.replace(/\n/g, "\n> ")}`);
      }
      if (reminder.messageUrl) {
        parts.push(`[Jump to Original Message](${reminder.messageUrl})`);
      }
      embed.addFields({ name: "Quoted Context", value: parts.join("\n\n") });
    }

    let sent = false;

    // Try sending to the original channel first
    if (reminder.channelId) {
      const channel = await this.client.channels
        .fetch(reminder.channelId)
        .catch(() => null);

      if (channel && channel.isTextBased() && "send" in channel) {
        try {
          await channel.send({
            content: `<@${reminder.userId}>`,
            embeds: [embed],
          });
          sent = true;
        } catch {
          // Channel send failed (e.g. missing permissions)
        }
      }
    }

    // Fallback: DM user directly if channel send failed or channel lost
    if (!sent) {
      const user = await this.client.users
        .fetch(reminder.userId)
        .catch(() => null);

      if (user) {
        await user.send({
          content: `<@${reminder.userId}> Here is your scheduled reminder:`,
          embeds: [embed],
        }).catch(() => null);
      }
    }
  }
}
