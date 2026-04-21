/**
 * Server-side endpoint to fetch the current user's Discord profile + guilds.
 *
 * Native path (NUXT_USE_NATIVE_AUTH=true):
 *   - Both calls go through the session's access token. Token refresh
 *     is handled by getDiscordAccessToken.
 *
 * Legacy path preserved verbatim — multi-step fallback through Appwrite
 * Identity store + bot token because Appwrite's OAuth token storage
 * isn't always accessible on the session object.
 */
import { Client, Query, Users } from "node-appwrite";
import {
  getDiscordAccessToken,
  isNativeAuthEnabled,
  refreshNativeTokens,
} from "../../utils/session";

async function fetchDiscordUserViaBot(
  botToken: string,
  discordUserId: string,
): Promise<any | null> {
  try {
    return await $fetch(`https://discord.com/api/v10/users/${discordUserId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;
  const botToken = config.discordBotToken as string;

  // ── Native path ────────────────────────────────────────────────────────
  if (isNativeAuthEnabled()) {
    const token = await getDiscordAccessToken(event);
    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized: no Discord session.",
      });
    }

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
            // fall through to 401
          }
        }
      }
      throw createError({
        statusCode: 401,
        statusMessage: "discord_token_expired",
        data: { code: "discord_token_expired" },
      });
    }
  }

  // ── Legacy Appwrite path ───────────────────────────────────────────────
  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret || !userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: No Appwrite session found.",
    });
  }

  const discordToken = getCookie(event, `discord_token_${projectId}`);
  const discordExpiry = getCookie(event, `discord_token_expiry_${projectId}`);
  const discordUidCookie = getCookie(event, `discord_uid_${projectId}`);

  const isExpired = discordExpiry
    ? new Date(discordExpiry).getTime() < Date.now()
    : false;

  try {
    if (discordToken && !isExpired) {
      try {
        const [profile, guilds] = await Promise.all([
          $fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${discordToken}` },
          }),
          $fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${discordToken}` },
          }),
        ]);
        return { profile, guilds };
      } catch (discordError: any) {
        if (discordError.status === 401 || discordError.statusCode === 401) {
          const refreshed = await refreshDiscordToken(event, config);
          if (refreshed) {
            try {
              const [profile, guilds] = await Promise.all([
                $fetch("https://discord.com/api/users/@me", {
                  headers: { Authorization: `Bearer ${refreshed.token}` },
                }),
                $fetch("https://discord.com/api/users/@me/guilds", {
                  headers: { Authorization: `Bearer ${refreshed.token}` },
                }),
              ]);
              return { profile, guilds };
            } catch {
              // fall through
            }
          }
        }
      }
    }

    if (!discordToken || isExpired) {
      try {
        const idClient = new Client()
          .setEndpoint(config.public.appwriteEndpoint as string)
          .setProject(projectId)
          .setKey(config.appwriteApiKey as string);

        const idUsers = new Users(idClient);
        const identities = await idUsers.listIdentities([
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
            const identityToken = discordIdentity.providerAccessToken;
            try {
              const [profile, guilds] = await Promise.all([
                $fetch("https://discord.com/api/users/@me", {
                  headers: { Authorization: `Bearer ${identityToken}` },
                }),
                $fetch("https://discord.com/api/users/@me/guilds", {
                  headers: { Authorization: `Bearer ${identityToken}` },
                }),
              ]);
              return { profile, guilds };
            } catch {
              // fall through
            }
          } else {
            const refreshed = await refreshDiscordToken(event, config);
            if (refreshed) {
              try {
                const [profile, guilds] = await Promise.all([
                  $fetch("https://discord.com/api/users/@me", {
                    headers: { Authorization: `Bearer ${refreshed.token}` },
                  }),
                  $fetch("https://discord.com/api/users/@me/guilds", {
                    headers: { Authorization: `Bearer ${refreshed.token}` },
                  }),
                ]);
                return { profile, guilds };
              } catch {
                // fall through
              }
            }
          }
        }
      } catch (idErr: any) {
        console.warn(
          "[Discord Me API] Failed to query Appwrite Identity:",
          idErr.message,
        );
      }
    }

    // Bot-token fallback (profile only, no guilds).
    let discordUid = discordUidCookie;
    if (!discordUid) {
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
      if (discordIdentity) discordUid = discordIdentity.providerUid;
    }

    if (!discordUid) {
      throw createError({
        statusCode: 404,
        statusMessage: "No Discord identity found for this user.",
      });
    }

    let profile: any = null;
    if (botToken) profile = await fetchDiscordUserViaBot(botToken, discordUid);

    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(projectId)
      .setKey(config.appwriteApiKey as string);

    const users = new Users(client);
    const user = await users.get(userId);

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

    return { profile: finalProfile, guilds: [] as any[] };
  } catch (error: any) {
    console.error("[Discord Me API] Error:", error.message || error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to fetch Discord data",
    });
  }
});
