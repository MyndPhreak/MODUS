import { Client, Account, Users, Query } from "node-appwrite";
import type { H3Event } from "h3";

export interface RefreshedDiscordToken {
  token: string;
  expiry: string | null;
  uid: string | null;
}

/**
 * Attempt to refresh an expired Discord OAuth token using Appwrite's
 * `account.updateSession()`. This triggers Appwrite to use the stored
 * refresh_token to obtain a new access_token from Discord.
 *
 * Strategy:
 * 1. Create a user-scoped Appwrite client using the session secret
 * 2. Call `account.updateSession('current')` to refresh the OAuth token
 * 3. Read the refreshed token from the Identity store
 * 4. Optionally re-save the token as a cookie for subsequent requests
 *
 * @returns The refreshed token info, or null if refresh failed
 */
export async function refreshDiscordToken(
  event: H3Event,
  config: ReturnType<typeof useRuntimeConfig>,
): Promise<RefreshedDiscordToken | null> {
  const projectId = config.public.appwriteProjectId as string;
  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const userId = getCookie(event, `a_user_${projectId}`);

  if (!sessionSecret || !userId) {
    console.warn(
      "[Token Refresh] Missing session secret or userId — cannot refresh",
    );
    return null;
  }

  try {
    // Step 1: Create a user-scoped client (not admin) and refresh the session
    const userClient = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(projectId)
      .setSession(sessionSecret);

    const account = new Account(userClient);

    console.log(
      `[Token Refresh] Attempting session refresh for user ${userId}...`,
    );
    const refreshedSession = await account.updateSession("current");

    console.log(
      `[Token Refresh] Session refreshed — providerAccessToken present: ${!!refreshedSession.providerAccessToken}, length: ${refreshedSession.providerAccessToken?.length || 0}`,
    );

    // Step 2: If the refreshed session includes the token directly, use it
    if (refreshedSession.providerAccessToken) {
      const result: RefreshedDiscordToken = {
        token: refreshedSession.providerAccessToken,
        expiry: refreshedSession.providerAccessTokenExpiry || null,
        uid: refreshedSession.providerUid || null,
      };
      saveDiscordTokenCookie(event, config, result);
      return result;
    }

    // Step 3: Otherwise, check the Identity store (Appwrite may have
    // refreshed it there even if the session object doesn't expose it)
    const adminClient = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(projectId)
      .setKey(config.appwriteApiKey as string);

    const users = new Users(adminClient);
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
        console.log(
          `[Token Refresh] Identity store has fresh token after refresh (length=${discordIdentity.providerAccessToken.length})`,
        );
        const result: RefreshedDiscordToken = {
          token: discordIdentity.providerAccessToken,
          expiry: discordIdentity.providerAccessTokenExpiry || null,
          uid: discordIdentity.providerUid || null,
        };
        saveDiscordTokenCookie(event, config, result);
        return result;
      } else {
        console.warn(
          "[Token Refresh] Identity store token still expired after refresh attempt",
        );
      }
    } else {
      console.warn(
        "[Token Refresh] No providerAccessToken in Identity store after refresh",
      );
    }

    return null;
  } catch (err: any) {
    console.warn(
      `[Token Refresh] Failed to refresh session: ${err.message || err}`,
    );
    return null;
  }
}

/**
 * Save a refreshed Discord token as cookies so subsequent requests
 * don't need to hit the Identity store or refresh again.
 */
function saveDiscordTokenCookie(
  event: H3Event,
  config: ReturnType<typeof useRuntimeConfig>,
  token: RefreshedDiscordToken,
): void {
  const projectId = config.public.appwriteProjectId as string;
  const baseUrl = config.public.baseUrl as string;
  const isSecure = !baseUrl.startsWith("http://localhost");

  const cookieOpts = {
    path: "/",
    httpOnly: false,
    secure: isSecure,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365,
  };

  setCookie(event, `discord_token_${projectId}`, token.token, cookieOpts);

  if (token.expiry) {
    setCookie(
      event,
      `discord_token_expiry_${projectId}`,
      token.expiry,
      cookieOpts,
    );
  }

  if (token.uid) {
    setCookie(event, `discord_uid_${projectId}`, token.uid, cookieOpts);
  }

  console.log(
    `[Token Refresh] Saved refreshed token cookie (length=${token.token.length}, uid=${token.uid || "none"})`,
  );
}
