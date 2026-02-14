import { Client, Users } from "node-appwrite";

/**
 * Helper: find the best Discord/OAuth2 session — prefer the one with the
 * latest providerAccessTokenExpiry so we don't use a stale expired token.
 */
function findBestDiscordSession(sessions: any[]) {
  const oauthSessions = sessions.filter(
    (s) => s.provider === "discord" || s.provider === "oauth2",
  );

  if (oauthSessions.length === 0) return null;
  if (oauthSessions.length === 1) return oauthSessions[0];

  // Sort by expiry descending — newest/freshest first
  return oauthSessions.sort((a, b) => {
    const expiryA = a.providerAccessTokenExpiry
      ? new Date(a.providerAccessTokenExpiry).getTime()
      : 0;
    const expiryB = b.providerAccessTokenExpiry
      ? new Date(b.providerAccessTokenExpiry).getTime()
      : 0;
    return expiryB - expiryA;
  })[0];
}

/**
 * Server-side endpoint to fetch the current user's Discord guilds.
 *
 * Strategy:
 * 1. Try the user's OAuth access token (returns user's own guild list)
 * 2. Fall back to Bot token (returns guilds the bot is in)
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;
  const botToken = config.discordBotToken as string;

  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret || !userId) {
    throw createError({
      statusCode: 401,
      statusMessage:
        "Unauthorized: No Appwrite session found. Please log in again.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(projectId)
    .setKey(config.appwriteApiKey as string);

  const users = new Users(client);

  try {
    const sessions = await users.listSessions(userId);
    console.log(
      `[Guilds API] Found ${sessions.sessions.length} session(s) for user ${userId}`,
    );

    const discordSession = findBestDiscordSession(sessions.sessions);

    if (discordSession) {
      const token = discordSession.providerAccessToken;
      const expiry = discordSession.providerAccessTokenExpiry;
      const isExpired = expiry
        ? new Date(expiry).getTime() < Date.now()
        : false;

      console.log(
        `[Guilds API] Best session: Has token: ${!!token}, Token length: ${token?.length || 0}, Expiry: ${expiry}, Expired: ${isExpired}`,
      );

      // Try user's OAuth token first
      if (token && !isExpired) {
        console.log("[Guilds API] Fetching guilds via user OAuth token...");
        try {
          const response = await $fetch(
            "https://discord.com/api/users/@me/guilds",
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          return response;
        } catch (discordError: any) {
          console.warn(
            `[Guilds API] OAuth token failed (${discordError.status || discordError.statusCode}), falling back to Bot token`,
          );
        }
      }
    } else {
      console.warn(
        "[Guilds API] No Discord/OAuth2 session found. Available providers:",
        sessions.sessions.map((s: any) => s.provider),
      );
    }

    // Fallback: Use Bot token to fetch the bot's guilds
    if (botToken) {
      console.log("[Guilds API] Fetching guilds via Bot token fallback...");
      try {
        const botGuilds = await $fetch<any[]>(
          "https://discord.com/api/v10/users/@me/guilds",
          {
            headers: {
              Authorization: `Bot ${botToken}`,
            },
          },
        );
        console.log(
          `[Guilds API] Bot token returned ${botGuilds?.length || 0} guilds`,
        );
        return botGuilds || [];
      } catch (botError: any) {
        console.warn(
          `[Guilds API] Bot token guild fetch failed:`,
          botError.status || botError.statusCode || botError.message,
        );
      }
    } else {
      console.warn("[Guilds API] No bot token configured, cannot fetch guilds");
    }

    // If all methods fail, return empty array
    return [];
  } catch (error: any) {
    console.error("[Guilds API] Error:", error.message || error);
    throw createError({
      statusCode: error.statusCode || error.code || 500,
      statusMessage: error.message || "Internal Server Error",
    });
  }
});
