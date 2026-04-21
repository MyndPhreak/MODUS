/**
 * Server-side endpoint to fetch the current user's Discord guilds.
 *
 * Native path (NUXT_USE_NATIVE_AUTH=true):
 *   - Pull the access token from the sealed session, refreshing silently
 *     via refresh_token if near expiry.
 *   - One call to Discord. 401 triggers a retry after forced refresh.
 *   - No Appwrite round-trips.
 *
 * Legacy path: the original cascade — cookie token → Appwrite Identity
 * store → updateSession refresh → bot-token fallback (for profile only,
 * never for guilds).
 */
import { Client, Query, Users } from "node-appwrite";
import {
  getDiscordAccessToken,
  isNativeAuthEnabled,
  refreshNativeTokens,
} from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // ── Native path ────────────────────────────────────────────────────────
  if (isNativeAuthEnabled()) {
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
    } catch (discordError: any) {
      if (
        discordError.status === 401 ||
        discordError.statusCode === 401
      ) {
        const refreshed = await refreshNativeTokens(event);
        if (refreshed) {
          try {
            return await $fetch(
              "https://discord.com/api/users/@me/guilds",
              {
                headers: { Authorization: `Bearer ${refreshed.accessToken}` },
              },
            );
          } catch {
            // fall through to 401
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
  }

  // ── Legacy Appwrite path ───────────────────────────────────────────────
  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret) {
    throw createError({
      statusCode: 401,
      statusMessage:
        "Unauthorized: No Appwrite session found. Please log in again.",
    });
  }

  let discordToken = getCookie(event, `discord_token_${projectId}`) || null;
  const discordExpiry = getCookie(event, `discord_token_expiry_${projectId}`);
  let tokenExpired = discordExpiry
    ? new Date(discordExpiry).getTime() < Date.now()
    : false;

  if ((!discordToken || tokenExpired) && userId) {
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
        } else {
          const refreshed = await refreshDiscordToken(event, config);
          if (refreshed) {
            discordToken = refreshed.token;
            tokenExpired = false;
          }
        }
      }
    } catch (err: any) {
      console.warn(
        "[Guilds API] Failed to query Appwrite Identity:",
        err.message,
      );
    }
  }

  if (discordToken && !tokenExpired) {
    try {
      return await $fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${discordToken}` },
      });
    } catch (discordError: any) {
      if (
        (discordError.status === 401 || discordError.statusCode === 401) &&
        userId
      ) {
        const refreshed = await refreshDiscordToken(event, config);
        if (refreshed) {
          try {
            return await $fetch(
              "https://discord.com/api/users/@me/guilds",
              {
                headers: { Authorization: `Bearer ${refreshed.token}` },
              },
            );
          } catch {
            // fall through
          }
        }
      }
    }
  }

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
