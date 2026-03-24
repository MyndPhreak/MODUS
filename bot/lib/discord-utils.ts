/**
 * bot/lib/discord-utils.ts
 *
 * Shared Discord utility helpers used across multiple MODUS modules.
 *
 * Guidelines:
 *  - Keep exports small, pure, and dependency-free (discord.js types only).
 *  - Do NOT import from individual module files — this is a low-level lib.
 *  - Add a function here only when it is needed by ≥2 modules.
 */

import type {
  ChatInputCommandInteraction,
  TextChannel,
  MessagePayload,
  MessageEditOptions,
  MessageCreateOptions,
} from "discord.js";

// ── Color Parsing ─────────────────────────────────────────────────────────────

/**
 * Parses a hex color string (with or without leading `#`) into a Discord-
 * compatible integer.  Returns `null` for invalid / out-of-range values.
 *
 * @example
 * parseHexColor("#5865F2") // → 5793266
 * parseHexColor("5865f2")  // → 5793266
 * parseHexColor("nope")    // → null
 */
export function parseHexColor(hex: string): number | null {
  if (!hex || !hex.trim()) return null;
  const cleaned = hex.trim().replace("#", "");
  const parsed = parseInt(cleaned, 16);
  if (isNaN(parsed) || parsed < 0 || parsed > 0xffffff) return null;
  return parsed;
}

// ── Snowflake Utilities ───────────────────────────────────────────────────────

/**
 * Extracts a Unix-millisecond timestamp from a Discord snowflake string.
 * Uses the Discord epoch: 2015-01-01T00:00:00.000Z = 1420070400000 ms.
 *
 * Useful for deriving message/thread age without an extra API call.
 */
export function snowflakeToMs(snowflake: string): number {
  return Number(BigInt(snowflake) >> 22n) + 1_420_070_400_000;
}

// ── Panel Deploy / Update ─────────────────────────────────────────────────────

/**
 * Posts OR edits-in-place a Discord panel message in `channel`.
 *
 * Behaviour:
 *  - If `existingMessageId` is provided it attempts to fetch + edit the
 *    existing message.  If the fetch fails (deleted, no perms) it falls
 *    back to sending a new message.
 *  - If `existingChannelId` is supplied it fetches from that channel instead
 *    of `channel`; if they differ a new message is always posted to `channel`.
 *
 * Returns the final message ID so the caller can persist it.
 */
export async function deployOrUpdateMessage(
  channel: TextChannel,
  payload: MessageCreateOptions & MessageEditOptions,
  existingMessageId?: string | null,
  existingChannelId?: string | null,
): Promise<string> {
  // Only attempt edit if both IDs are present and channel hasn't changed
  if (existingMessageId && existingChannelId && existingChannelId === channel.id) {
    try {
      const prevChannel = channel.guild.channels.cache.get(
        existingChannelId,
      ) as TextChannel | undefined;
      if (prevChannel) {
        const existing = await prevChannel.messages.fetch(existingMessageId);
        await existing.edit(payload as MessageEditOptions);
        return existing.id;
      }
    } catch {
      // Message gone or permissions changed — fall through to send new
    }
  }

  const msg = await channel.send(payload as MessageCreateOptions);
  return msg.id;
}

// ── Permission Helpers ────────────────────────────────────────────────────────

import { GuildMember, PermissionsBitField } from "discord.js";

/**
 * Returns true if the member has Administrator or ManageGuild permissions.
 * Use this as the baseline staff check in modules that don't have their own
 * role-based configuration (e.g., for quick guard-rails).
 */
export function isAdminOrManageGuild(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

/**
 * Returns true if the member holds at least one of the supplied role IDs.
 * Suitable for module-specific role-gated checks (e.g., custom staff roles).
 */
export function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some((id) => member.roles.cache.has(id));
}

// ── Interaction Guards ────────────────────────────────────────────────────────

/**
 * Ensures the interaction originates from a guild.
 * Replies with a user-facing error and returns `null` if not in a guild,
 * so callers can do an early return with a single null-check.
 *
 * NOTE: Only call this on interactions that have already been deferred.
 */
export async function requireGuildId(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  if (!interaction.guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return null;
  }
  return interaction.guildId;
}
