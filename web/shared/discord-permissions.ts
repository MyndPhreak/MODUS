/**
 * Shared (isomorphic) Discord permission-bit helper — usable from both
 * `app/` (client) and `server/` (Nitro) since it has no side effects.
 */
const ADMINISTRATOR_BIT = BigInt(0x8);

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
