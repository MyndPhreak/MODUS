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
 * Server-side endpoint to fetch the current user's Discord profile and guilds.
 *
 * Strategy:
 * 1. Try to use the Discord OAuth providerAccessToken from the freshest session
 * 2. If the token is unavailable or expired, fall back to Appwrite's stored identity data
 *    (which always has the Discord user ID, username, etc.) and skip guilds.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret || !userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: No Appwrite session found.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(projectId)
    .setKey(config.appwriteApiKey as string);

  const users = new Users(client);

  try {
    const [user, sessions] = await Promise.all([
      users.get(userId),
      users.listSessions(userId),
    ]);

    const discordSession = findBestDiscordSession(sessions.sessions);

    const token = discordSession?.providerAccessToken;
    const expiry = discordSession?.providerAccessTokenExpiry;
    const isExpired = expiry ? new Date(expiry).getTime() < Date.now() : false;

    console.log(
      `[Discord Me API] User: ${userId}, Has session: ${!!discordSession}, Has token: ${!!token}, Expired: ${isExpired}`,
    );

    // Try fetching live Discord data if we have a valid, non-expired token
    if (token && !isExpired) {
      try {
        const [profile, guilds] = await Promise.all([
          $fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          $fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        return { profile, guilds };
      } catch (discordError: any) {
        console.warn(
          `[Discord Me API] Discord API call failed (${discordError.status || discordError.statusCode}), falling back to Appwrite identity data`,
        );
      }
    }

    // Fallback: Build profile from Appwrite's stored identity data
    console.log(
      "[Discord Me API] Using Appwrite identity fallback for user profile",
    );

    const discordUid = discordSession?.providerUid;

    if (!discordUid) {
      // Try identities API as last resort
      const identities = await users.listIdentities([
        `equal("userId", ["${userId}"])`,
      ]);
      const discordIdentity = identities.identities.find(
        (i) => i.provider === "discord" || i.provider === "oauth2",
      );

      if (!discordIdentity) {
        throw createError({
          statusCode: 404,
          statusMessage: "No Discord identity found for this user.",
        });
      }

      return {
        profile: {
          id: discordIdentity.providerUid,
          username: user.name || "User",
          discriminator: "0",
          avatar: null,
          global_name: user.name,
        },
        guilds: [],
      };
    }

    return {
      profile: {
        id: discordUid,
        username: user.name || "User",
        discriminator: "0",
        avatar: null,
        global_name: user.name,
      },
      guilds: [],
    };
  } catch (error: any) {
    console.error("[Discord Me API] Error:", error.message || error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to fetch Discord data",
    });
  }
});
