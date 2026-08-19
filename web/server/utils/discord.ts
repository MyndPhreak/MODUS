/**
 * Shared bot-token Discord REST helpers used by session/module-access
 * guards. Requires DISCORD_BOT_TOKEN (config.discordBotToken); returns an
 * empty list rather than throwing when the token is missing or the lookup
 * fails (404 = user not in guild, 403 = bot not in guild) — callers treat
 * "no roles" as "no elevated access", which is the safe default.
 */
export async function fetchGuildMemberRoleIds(
  guildId: string,
  discordUid: string,
): Promise<string[]> {
  const config = useRuntimeConfig();
  const botToken = config.discordBotToken as string;
  if (!botToken) return [];
  try {
    const member: any = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUid}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    );
    return Array.isArray(member?.roles) ? member.roles : [];
  } catch {
    return [];
  }
}
