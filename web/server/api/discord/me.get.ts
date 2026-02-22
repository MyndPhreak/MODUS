import { Client, Query, Users } from "node-appwrite";

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
 * Server-side endpoint to fetch the current user's Discord profile and guilds.
 *
 * Strategy:
 * 1. Read the Discord OAuth token from the cookie (set during login callback)
 *    — gives us the user's full guild list including non-bot guilds
 * 2. If the token is unavailable or expired, check Appwrite Identity store
 * 3. If the Identity store token is also expired, attempt to refresh via
 *    Appwrite's updateSession() which uses the stored refresh_token
 * 4. If all OAuth paths fail, use the Bot token for profile (no guilds)
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

  // Read Discord OAuth token from cookies (set during login callback)
  const discordToken = getCookie(event, `discord_token_${projectId}`);
  const discordExpiry = getCookie(event, `discord_token_expiry_${projectId}`);
  const discordUidCookie = getCookie(event, `discord_uid_${projectId}`);

  const isExpired = discordExpiry
    ? new Date(discordExpiry).getTime() < Date.now()
    : false;

  console.log(
    `[Discord Me API] Token cookie: present=${!!discordToken}, length=${discordToken?.length || 0}, uid=${discordUidCookie || "none"}, expired=${isExpired}`,
  );

  try {
    // ── Strategy 1: Use the user's OAuth token from cookie ─────────────
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

        console.log(
          `[Discord Me API] OAuth token succeeded — avatar: ${(profile as any)?.avatar}, guilds: ${(guilds as any[])?.length}`,
        );
        return { profile, guilds };
      } catch (discordError: any) {
        console.warn(
          `[Discord Me API] Discord OAuth API call failed (${discordError.status || discordError.statusCode}), falling back`,
        );

        // If Discord rejected the token (401), try refreshing
        if (discordError.status === 401 || discordError.statusCode === 401) {
          console.log(
            "[Discord Me API] Token rejected by Discord, attempting refresh...",
          );
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
              console.log(
                `[Discord Me API] Retry after refresh succeeded — avatar: ${(profile as any)?.avatar}, guilds: ${(guilds as any[])?.length}`,
              );
              return { profile, guilds };
            } catch (retryErr: any) {
              console.warn(
                `[Discord Me API] Retry after refresh also failed (${retryErr.status || retryErr.statusCode})`,
              );
            }
          }
        }
      }
    }

    // ── Strategy 2: Appwrite Identity store token fallback ─────────────
    if (!discordToken || isExpired) {
      console.log(
        "[Discord Me API] Cookie token unavailable, trying Appwrite Identity store...",
      );
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
            console.log(
              `[Discord Me API] Got token from Identity store (length=${identityToken.length}), fetching profile+guilds...`,
            );

            try {
              const [profile, guilds] = await Promise.all([
                $fetch("https://discord.com/api/users/@me", {
                  headers: { Authorization: `Bearer ${identityToken}` },
                }),
                $fetch("https://discord.com/api/users/@me/guilds", {
                  headers: { Authorization: `Bearer ${identityToken}` },
                }),
              ]);

              console.log(
                `[Discord Me API] Identity token succeeded — avatar: ${(profile as any)?.avatar}, guilds: ${(guilds as any[])?.length}`,
              );
              return { profile, guilds };
            } catch (identityFetchErr: any) {
              console.warn(
                `[Discord Me API] Identity token Discord fetch failed (${identityFetchErr.status || identityFetchErr.statusCode}), falling back`,
              );
            }
          } else {
            console.warn(
              "[Discord Me API] Identity store token is also expired",
            );

            // ── Strategy 3: Refresh the expired token ──────────────────
            console.log(
              "[Discord Me API] Attempting to refresh expired Discord token...",
            );
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
                console.log(
                  `[Discord Me API] Refresh succeeded — avatar: ${(profile as any)?.avatar}, guilds: ${(guilds as any[])?.length}`,
                );
                return { profile, guilds };
              } catch (refreshFetchErr: any) {
                console.warn(
                  `[Discord Me API] Refresh token Discord fetch failed (${refreshFetchErr.status || refreshFetchErr.statusCode}), continuing to bot fallback`,
                );
              }
            }
          }
        } else {
          console.warn(
            "[Discord Me API] No providerAccessToken in Appwrite Identity",
          );
        }
      } catch (idErr: any) {
        console.warn(
          "[Discord Me API] Failed to query Appwrite Identity:",
          idErr.message,
        );
      }
    }

    // ── Strategy 4: Bot token fallback (profile only, no guilds) ────────
    console.log("[Discord Me API] Using Bot token fallback for user profile");

    // Try to resolve the Discord user ID from cookie or Appwrite identity
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

      if (discordIdentity) {
        discordUid = discordIdentity.providerUid;
      }
    }

    if (!discordUid) {
      console.error(
        "[Discord Me API] No Discord UID found in cookie or identity",
      );
      throw createError({
        statusCode: 404,
        statusMessage: "No Discord identity found for this user.",
      });
    }

    console.log(
      `[Discord Me API] Found Discord UID: ${discordUid}, fetching via Bot token...`,
    );

    let profile: any = null;
    // IMPORTANT: Do NOT fetch bot guilds as a fallback for user guilds.
    // Bot guilds lack user-specific permission data and would leak across users.
    const guilds: any[] = [];

    if (botToken) {
      profile = await fetchDiscordUserViaBot(botToken, discordUid);

      console.log(
        `[Discord Me API] Bot token result — profile avatar: ${profile?.avatar}, guilds: [] (bot guilds intentionally excluded)`,
      );
    } else {
      console.warn(
        "[Discord Me API] No bot token configured (NUXT_DISCORD_BOT_TOKEN), cannot fetch Discord data",
      );
    }

    // Build profile from Bot API data or Appwrite fallback
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

    return { profile: finalProfile, guilds };
  } catch (error: any) {
    console.error("[Discord Me API] Error:", error.message || error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to fetch Discord data",
    });
  }
});
