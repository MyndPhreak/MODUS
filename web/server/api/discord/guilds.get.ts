/**
 * Fetch the current user's Discord guilds.
 *
 * Pull the access token from the sealed session (silent refresh near
 * expiry) and call Discord once. 401 triggers a forced refresh + retry;
 * if that also fails, surface `discord_token_expired` so the client
 * can prompt the user to re-authenticate.
 */
import {
  getDiscordAccessToken,
  refreshNativeTokens,
} from "../../utils/session";

export default defineEventHandler(async (event) => {
  const token = await getDiscordAccessToken(event);
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: no Discord session.",
    });
  }

  try {
    return await $fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err: any) {
    if (err.status === 401 || err.statusCode === 401) {
      const refreshed = await refreshNativeTokens(event);
      if (refreshed) {
        try {
          return await $fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${refreshed.accessToken}` },
          });
        } catch {
          // fall through
        }
      }
    }
    throw createError({
      statusCode: 401,
      statusMessage: "discord_token_expired",
      data: {
        code: "discord_token_expired",
        message:
          "Your Discord connection has expired. Please re-authenticate with Discord.",
      },
    });
  }
});
