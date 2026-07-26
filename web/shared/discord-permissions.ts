/**
 * Shared (isomorphic) Discord permission-bit helper — usable from both
 * `app/` (client) and `server/` (Nitro) since it has no side effects.
 */
const ADMINISTRATOR_BIT = BigInt(0x8);
const MANAGE_GUILD_BIT = BigInt(0x20);

/**
 * True when a Discord permissions bitfield (as returned by the OAuth
 * `/users/@me/guilds` or guild-member endpoints, always a string on the
 * wire) includes ADMINISTRATOR.
 */
export function hasAdministratorPermission(
  permissions: string | bigint | null | undefined,
): boolean {
  if (permissions == null) return false;
  try {
    const bits = typeof permissions === "bigint" ? permissions : BigInt(permissions);
    return (bits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT;
  } catch {
    return false;
  }
}

/**
 * True when the bitfield includes ADMINISTRATOR or MANAGE_GUILD. This is
 * the dashboard-access gate: Discord itself only requires Manage Server
 * to invite a bot, so anyone who can add the bot can also connect the
 * guild to the dashboard.
 */
export function canManageGuild(
  permissions: string | bigint | null | undefined,
): boolean {
  if (permissions == null) return false;
  try {
    const bits = typeof permissions === "bigint" ? permissions : BigInt(permissions);
    return (
      (bits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT ||
      (bits & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT
    );
  } catch {
    return false;
  }
}
