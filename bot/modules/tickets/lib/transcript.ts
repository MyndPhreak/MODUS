import { ThreadChannel, Message } from "discord.js";
import { META_PREFIX } from "./types";

/**
 * Fetches all messages from a thread (paginated, up to 500 messages)
 * and renders them as a Markdown document suitable for attachment.
 *
 * - Skips system pin messages and the pinned info-embed (ticket-meta footer)
 * - Renders embeds, attachments, and standard message content
 * - Sorted oldest → newest
 */
export async function generateMarkdownTranscript(
  thread: ThreadChannel,
): Promise<Buffer> {
  // Paginate backwards through history
  const allMessages: Message[] = [];
  let lastId: string | undefined;

  for (let page = 0; page < 50; page++) {
    const batch = await thread.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    const arr = [...batch.values()];
    allMessages.push(...arr);
    lastId = arr[arr.length - 1]?.id;
    if (batch.size < 100) break;
  }

  // Sort ascending (oldest first)
  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const userMessageCount = allMessages.filter((m) => !m.author.bot).length;

  const header = [
    `# Ticket Transcript: \`${thread.name}\``,
    "",
    `| | |`,
    `|---|---|`,
    `| **Server** | ${thread.guild.name} |`,
    `| **Thread** | ${thread.name} |`,
    `| **Created** | ${thread.createdAt?.toUTCString() ?? "Unknown"} |`,
    `| **Exported** | ${new Date().toUTCString()} |`,
    `| **Messages** | ${userMessageCount} user messages |`,
    "",
    "---",
    "",
  ].join("\n");

  const lines: string[] = [];

  for (const msg of allMessages) {
    // Skip Discord system messages (pins, thread joins, etc.)
    if (msg.system) continue;

    // Skip the internal ticket info embed
    if (msg.author.bot && msg.embeds[0]?.footer?.text?.startsWith(META_PREFIX)) {
      continue;
    }

    const ts = msg.createdAt.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });

    lines.push(`**[${ts}] ${msg.author.tag}${msg.author.bot ? " 🤖" : ""}:**`);

    if (msg.content) lines.push(msg.content);

    for (const embed of msg.embeds) {
      if (embed.footer?.text?.startsWith(META_PREFIX)) continue;
      const embedLines: string[] = [];
      if (embed.title) embedLines.push(`> **${embed.title}**`);
      if (embed.description) {
        embedLines.push(`> ${embed.description.replace(/\n/g, "\n> ")}`);
      }
      for (const field of embed.fields) {
        embedLines.push(`> **${field.name}:** ${field.value}`);
      }
      if (embedLines.length) lines.push(embedLines.join("\n"));
    }

    for (const att of msg.attachments.values()) {
      lines.push(`> 📎 [${att.name ?? "attachment"}](${att.url})`);
    }

    lines.push(""); // blank line between messages
  }

  return Buffer.from(header + lines.join("\n"), "utf-8");
}
