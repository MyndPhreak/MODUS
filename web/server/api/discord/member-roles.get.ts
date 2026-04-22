/**
 * Fetch a user's roles in a given guild via the bot token.
 *
 * Query params:
 *   - guild_id: The Discord guild ID
 *   - discord_uid: The Discord user ID
 */
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const config = useRuntimeConfig();
  const query = getQuery(event);
  const guildId = query.guild_id as string;
  const discordUid = query.discord_uid as string;

  if (!guildId || !discordUid) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id or discord_uid parameter.",
    });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  try {
    const member: any = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUid}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    );

    return { roles: member.roles || [] };
  } catch (error: any) {
    // 404 = user not in guild, 403 = bot not in guild
    if (error?.status === 404 || error?.statusCode === 404) {
      return { roles: [] };
    }
    console.error(
      `[Member Roles API] Error fetching member ${discordUid} in guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage:
        error?.message ||
        "Failed to fetch member roles. Is the bot in this server?",
    });
  }
});
