import { Client, Query, Users } from "node-appwrite";

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
 * Fetch a Discord user's profile using the Bot token.
 * This always works regardless of OAuth token state.
 */
async function fetchDiscordUserViaBot(
  botToken: string,
  discordUserId: string,
): Promise<any | null> {
  try {
    const profile = await $fetch(
      `https://discord.com/api/v10/users/${discordUserId}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
      },
    );
    return profile;
  } catch (err: any) {
    console.warn(
      `[Discord Me API] Bot token user fetch failed:`,
      err.status || err.statusCode || err.message,
    );
    return null;
  }
}

/**
 * Fetch the guilds the bot is in using the Bot token.
 * Returns all guilds the bot has joined.
 */
async function fetchBotGuilds(botToken: string): Promise<any[]> {
  try {
    const guilds = await $fetch<any[]>(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: { Authorization: `Bot ${botToken}` },
      },
    );
    return guilds || [];
  } catch (err: any) {
    console.warn(
      `[Discord Me API] Bot guilds fetch failed:`,
      err.status || err.statusCode || err.message,
    );
    return [];
  }
}

/**
 * Server-side endpoint to fetch the current user's Discord profile and guilds.
 *
 * Strategy:
 * 1. Try to use the Discord OAuth providerAccessToken from the freshest session
 *    (gives us the user's full guild list including non-bot guilds)
 * 2. If the token is unavailable or expired, use the Bot token to fetch the
 *    user's profile (avatar, username, etc.) and the bot's guilds as a fallback
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

    // Debug: Log all sessions and their providers
    console.log(
      `[Discord Me API] User: ${userId}, Total sessions: ${sessions.sessions.length}`,
    );
    sessions.sessions.forEach((s: any, i: number) => {
      console.log(
        `[Discord Me API]   Session ${i}: provider=${s.provider}, hasToken=${!!s.providerAccessToken}, tokenLen=${s.providerAccessToken?.length || 0}, expiry=${s.providerAccessTokenExpiry}`,
      );
    });

    const discordSession = findBestDiscordSession(sessions.sessions);

    const token = discordSession?.providerAccessToken;
    const expiry = discordSession?.providerAccessTokenExpiry;
    const isExpired = expiry ? new Date(expiry).getTime() < Date.now() : false;

    console.log(
      `[Discord Me API] Best session: provider=${discordSession?.provider}, Has token: ${!!token}, Token length: ${token?.length || 0}, Expired: ${isExpired}`,
    );

    // ── Strategy 1: Use the user's own OAuth access token ─────────────────
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

        console.log(
          `[Discord Me API] OAuth token succeeded — avatar: ${(profile as any)?.avatar}, guilds: ${(guilds as any[])?.length}`,
        );
        return { profile, guilds };
      } catch (discordError: any) {
        console.warn(
          `[Discord Me API] Discord OAuth API call failed (${discordError.status || discordError.statusCode}), falling back to Bot token`,
        );
      }
    }

    // ── Strategy 2: Use the Bot token to fetch user profile ───────────────
    // This always works as long as the bot token is valid
    console.log("[Discord Me API] Using Bot token fallback for user profile");

    // Get the Discord user ID from the session or identity
    let discordUid = discordSession?.providerUid;

    if (!discordUid) {
      // Try identities API as last resort
      const identities = await users.listIdentities([
        Query.equal("userId", [userId]),
      ]);
      const discordIdentity = identities.identities.find(
        (i) => i.provider === "discord" || i.provider === "oauth2",
      );

      if (discordIdentity) {
        discordUid = discordIdentity.providerUid;
      }
    }

    if (!discordUid) {
      console.error(
        "[Discord Me API] No Discord UID found in session or identity",
      );
      throw createError({
        statusCode: 404,
        statusMessage: "No Discord identity found for this user.",
      });
    }

    console.log(
      `[Discord Me API] Found Discord UID: ${discordUid}, fetching via Bot token...`,
    );

    // Fetch user profile via Bot token — always returns avatar, banner, etc.
    let profile: any = null;
    let guilds: any[] = [];

    if (botToken) {
      profile = await fetchDiscordUserViaBot(botToken, discordUid);

      // Fetch bot's guilds (these are the guilds the user can manage via the dashboard)
      guilds = await fetchBotGuilds(botToken);

      console.log(
        `[Discord Me API] Bot token result — profile avatar: ${profile?.avatar}, bot guilds: ${guilds.length}`,
      );
    } else {
      console.warn(
        "[Discord Me API] No bot token configured (NUXT_DISCORD_BOT_TOKEN), cannot fetch Discord data",
      );
    }

    // Build profile from Bot API data or Appwrite fallback
    const finalProfile = profile
      ? {
          id: profile.id,
          username: profile.username,
          discriminator: profile.discriminator || "0",
          avatar: profile.avatar,
          global_name: profile.global_name || profile.username,
        }
      : {
          id: discordUid,
          username: user.name || "User",
          discriminator: "0",
          avatar: null,
          global_name: user.name,
        };

    return { profile: finalProfile, guilds };
  } catch (error: any) {
    console.error("[Discord Me API] Error:", error.message || error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to fetch Discord data",
    });
  }
});
