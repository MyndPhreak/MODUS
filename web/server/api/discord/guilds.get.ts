import { Client, Query, Users } from "node-appwrite";

/**
 * Server-side endpoint to fetch the current user's Discord guilds.
 *
 * Strategy:
 * 1. Read the Discord OAuth token from the cookie (set during login callback)
 * 2. If cookie is missing/expired, read the token from Appwrite's Identity store
 * 3. If the Identity store token is also expired, attempt to refresh it via
 *    Appwrite's updateSession() which uses the stored refresh_token
 * 4. If we have a valid token from any source, fetch guilds from Discord
 * 5. If all sources fail, return 401 with discord_token_expired error
 *
 * IMPORTANT: We never fall back to the Bot token for guilds — bot guilds lack
 * user-specific permission flags and would be leaked across all users.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret) {
    throw createError({
      statusCode: 401,
      statusMessage:
        "Unauthorized: No Appwrite session found. Please log in again.",
    });
  }

  // ── Strategy 1: Read Discord OAuth token from cookie ──────────────────
  let discordToken = getCookie(event, `discord_token_${projectId}`) || null;
  const discordExpiry = getCookie(event, `discord_token_expiry_${projectId}`);
  let tokenExpired = discordExpiry
    ? new Date(discordExpiry).getTime() < Date.now()
    : false;

  console.log(
    `[Guilds API] Discord token cookie: present=${!!discordToken}, length=${discordToken?.length || 0}, expiry=${discordExpiry || "none"}, expired=${tokenExpired}`,
  );

  // ── Strategy 2: Fallback to Appwrite Identity store ───────────────────
  if ((!discordToken || tokenExpired) && userId) {
    console.log(
      "[Guilds API] Cookie token unavailable, trying Appwrite Identity store...",
    );
    try {
      const client = new Client()
        .setEndpoint(config.public.appwriteEndpoint as string)
        .setProject(projectId)
        .setKey(config.appwriteApiKey as string);

      const users = new Users(client);
      const identities = await users.listIdentities([
        Query.equal("userId", [userId]),
      ]);

      const discordIdentity = identities.identities.find(
        (i) => i.provider === "discord" || i.provider === "oauth2",
      );

      if (discordIdentity?.providerAccessToken) {
        const identityExpired = discordIdentity.providerAccessTokenExpiry
          ? new Date(discordIdentity.providerAccessTokenExpiry).getTime() <
            Date.now()
          : false;

        if (!identityExpired) {
          discordToken = discordIdentity.providerAccessToken;
          tokenExpired = false;
          console.log(
            `[Guilds API] Retrieved token from Identity store (length=${discordToken.length})`,
          );
        } else {
          console.warn("[Guilds API] Identity store token is also expired");

          // ── Strategy 3: Refresh the expired token via Appwrite ────────
          console.log(
            "[Guilds API] Attempting to refresh expired Discord token...",
          );
          const refreshed = await refreshDiscordToken(event, config);
          if (refreshed) {
            discordToken = refreshed.token;
            tokenExpired = false;
            console.log(
              `[Guilds API] Token refreshed successfully (length=${refreshed.token.length})`,
            );
          }
        }
      } else {
        console.warn(
          "[Guilds API] No providerAccessToken in Appwrite Identity — user may need to re-authenticate",
        );
      }
    } catch (err: any) {
      console.warn(
        "[Guilds API] Failed to query Appwrite Identity:",
        err.message,
      );
    }
  }

  // ── Fetch guilds with whichever valid token we have ───────────────────
  if (discordToken && !tokenExpired) {
    console.log("[Guilds API] Fetching guilds via Discord OAuth token...");
    try {
      const response = await $fetch(
        "https://discord.com/api/users/@me/guilds",
        {
          headers: { Authorization: `Bearer ${discordToken}` },
        },
      );

      console.log(
        `[Guilds API] Success — ${(response as any[])?.length || 0} guilds returned`,
      );
      return response;
    } catch (discordError: any) {
      console.warn(
        `[Guilds API] OAuth token request failed (${discordError.status || discordError.statusCode})`,
      );

      // If the token was rejected by Discord (401), try one last refresh
      if (
        (discordError.status === 401 || discordError.statusCode === 401) &&
        userId
      ) {
        console.log(
          "[Guilds API] Token rejected by Discord, attempting refresh...",
        );
        const refreshed = await refreshDiscordToken(event, config);
        if (refreshed) {
          try {
            const retryResponse = await $fetch(
              "https://discord.com/api/users/@me/guilds",
              {
                headers: { Authorization: `Bearer ${refreshed.token}` },
              },
            );
            console.log(
              `[Guilds API] Retry after refresh succeeded — ${(retryResponse as any[])?.length || 0} guilds`,
            );
            return retryResponse;
          } catch (retryErr: any) {
            console.warn(
              `[Guilds API] Retry after refresh also failed (${retryErr.status || retryErr.statusCode})`,
            );
          }
        }
      }
    }
  }

  // ── No valid token available ──────────────────────────────────────────
  console.warn(
    "[Guilds API] No valid Discord OAuth token — user needs to re-authenticate",
  );
  throw createError({
    statusCode: 401,
    statusMessage: "discord_token_expired",
    data: {
      code: "discord_token_expired",
      message:
        "Your Discord connection has expired. Please re-authenticate with Discord to refresh your server list.",
    },
  });
});
