import { ThreadChannel } from "discord.js";
import type { TicketMeta } from "./types";
import { META_PREFIX } from "./types";
import type { TicketsSettingsType } from "../../../lib/schemas";

// ── Ticket naming ───────────────────────────────────────────────────────────

/**
 * Builds a Discord thread name from the configured template.
 * Template variables: {count}, {username}, {type}
 * Result is truncated to 96 characters (Discord max for thread names is 100).
 */
export function formatTicketName(
  settings: TicketsSettingsType,
  username: string,
  typeName: string,
  counter: number,
): string {
  const padded = String(counter).padStart(4, "0");
  const safeUsername = username
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .substring(0, 20) || "user";
  const safeType = typeName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .substring(0, 15);

  return (settings.namingTemplate ?? "ticket-{count}-{username}")
    .replace("{count}", padded)
    .replace("{username}", safeUsername)
    .replace("{type}", safeType)
    .substring(0, 96);
}

/**
 * Returns the thread name with a priority prefix emoji prepended,
 * replacing any existing priority prefix if present.
 */
export function applyPriorityPrefix(
  currentName: string,
  priorityEmoji: string,
  priority: string,
): string {
  // Strip any existing leading emoji prefix (one emoji + space)
  const stripped = currentName.replace(/^[🟢🔵🟠🔴]\s*/, "");
  if (priority === "normal") return stripped; // No prefix for normal priority
  return `${priorityEmoji} ${stripped}`.substring(0, 100);
}

// ── Metadata encode / decode ────────────────────────────────────────────────

export function encodeMeta(meta: TicketMeta): string {
  return META_PREFIX + JSON.stringify(meta);
}

export function decodeMeta(footerText: string | null | undefined): TicketMeta | null {
  if (!footerText?.startsWith(META_PREFIX)) return null;
  try {
    return JSON.parse(footerText.slice(META_PREFIX.length)) as TicketMeta;
  } catch {
    return null;
  }
}

// ── Thread metadata helpers ─────────────────────────────────────────────────

/**
 * Finds the pinned info-embed message in a ticket thread and decodes its metadata.
 * Returns null if no metadata embed is found (not a ticket thread, or pins fetch fails).
 */
export async function getThreadMeta(
  thread: ThreadChannel,
): Promise<{ messageId: string; meta: TicketMeta } | null> {
  try {
    const pinned = await thread.messages.fetchPinned();
    for (const msg of pinned.values()) {
      if (!msg.author.bot) continue;
      const meta = decodeMeta(msg.embeds[0]?.footer?.text);
      if (meta) return { messageId: msg.id, meta };
    }
    return null;
  } catch {
    return null;
  }
}
