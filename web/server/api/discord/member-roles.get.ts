/**
 * Server-side endpoint to fetch a user's roles in a given guild.
 * Uses the bot token to access guild member data directly.
 *
 * Query params:
 *   - guild_id: The Discord guild ID
 *   - discord_uid: The Discord user ID
 */
import { isNativeAuthEnabled } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // Auth guard: accept either a native session or the legacy Appwrite cookie.
  let authenticated = false;
  if (isNativeAuthEnabled()) {
    const session = await getUserSession(event);
    if (session.user?.id) authenticated = true;
  }
  if (!authenticated) {
    authenticated = !!getCookie(event, `a_session_${projectId}`);
  }
  if (!authenticated) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: No session found.",
    });
  }

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
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      },
    );

    return {
      roles: member.roles || [],
    };
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
