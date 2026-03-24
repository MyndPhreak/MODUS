import { GuildMember, PermissionsBitField } from "discord.js";
import type { TicketsSettingsType } from "../../../lib/schemas";

/**
 * Returns true when the member is allowed to perform staff actions
 * (claim, close, add/remove users, set priority, etc.).
 *
 * Priority order:
 *  1. Server Administrator or ManageGuild → always staff
 *  2. Type-specific staffRoleIds (if a typeId is supplied)
 *  3. Global staffRoleIds from settings
 */
export function isStaff(
  member: GuildMember,
  settings: TicketsSettingsType,
  typeId?: string | null,
): boolean {
  if (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }

  // Type-specific override
  if (typeId) {
    const type = settings.types.find((t) => t.id === typeId);
    if (type?.staffRoleIds?.some((r) => member.roles.cache.has(r))) return true;
  }

  // Global staff roles
  return settings.staffRoleIds.some((r) => member.roles.cache.has(r));
}
