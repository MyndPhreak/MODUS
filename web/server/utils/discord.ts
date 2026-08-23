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

export interface DiscordMemberIdentity {
  id: string;
  displayName: string;
  username: string | null;
}

/** Resolve guild-aware Discord names without allowing a large giveaway to burst the REST API. */
export async function fetchGuildMemberIdentities(
  guildId: string,
  discordUids: string[],
): Promise<Map<string, DiscordMemberIdentity>> {
  const config = useRuntimeConfig();
  const botToken = config.discordBotToken as string;
  const uniqueIds = Array.from(new Set(discordUids.filter(Boolean)));
  const identities = new Map<string, DiscordMemberIdentity>();
  if (!botToken || uniqueIds.length === 0) return identities;

  const resolveIdentity = async (id: string) => {
    try {
      const member: any = await $fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${id}`,
        { headers: { Authorization: `Bot ${botToken}` } },
      );
      const username = member?.user?.username || null;
      identities.set(id, {
        id,
        displayName: member?.nick || member?.user?.global_name || username || id,
        username,
      });
    } catch {
      // The caller retains the raw ID when the member has left the guild
      // or Discord rejects the lookup.
    }
  };

  const concurrency = 10;
  for (let index = 0; index < uniqueIds.length; index += concurrency) {
    await Promise.allSettled(uniqueIds.slice(index, index + concurrency).map(resolveIdentity));
  }
  return identities;
}
