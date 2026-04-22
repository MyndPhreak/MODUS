/**
 * Fetch the current user's Discord profile + guilds.
 *
 * Both calls go through the session's access token. Token refresh is
 * handled by getDiscordAccessToken; 401 retries once after a forced
 * refresh.
 */
import {
  getDiscordAccessToken,
  refreshNativeTokens,
} from "../../utils/session";

async function fetchPair(accessToken: string) {
  return Promise.all([
    $fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    $fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);
}

export default defineEventHandler(async (event) => {
  const token = await getDiscordAccessToken(event);
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: no Discord session.",
    });
  }

  try {
    const [profile, guilds] = await fetchPair(token);
    return { profile, guilds };
  } catch (err: any) {
    if (err.status === 401 || err.statusCode === 401) {
      const refreshed = await refreshNativeTokens(event);
      if (refreshed) {
        try {
          const [profile, guilds] = await fetchPair(refreshed.accessToken);
          return { profile, guilds };
        } catch {
          // fall through
        }
      }
    }
    throw createError({
      statusCode: 401,
      statusMessage: "discord_token_expired",
      data: { code: "discord_token_expired" },
    });
  }
});
