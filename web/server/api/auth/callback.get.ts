import { Client, Account, Users, Query } from "node-appwrite";

/**
 * Server-side OAuth callback handler.
 * Receives userId and secret from Appwrite's OAuth redirect,
 * exchanges them for a session, and sets session cookies on our domain.
 *
 * Also cleans up old stale OAuth sessions to prevent token confusion.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const baseUrl = config.public.baseUrl as string;
  const projectId = config.public.appwriteProjectId as string;

  const userId = query.userId as string;
  const secret = query.secret as string;

  if (!userId || !secret) {
    console.error("[Auth Callback] Missing userId or secret in query params");
    return sendRedirect(event, `${baseUrl}/login?error=missing_params`);
  }

  try {
    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint as string)
      .setProject(projectId)
      .setKey(config.appwriteApiKey as string);

    const account = new Account(client);

    // Exchange the OAuth token for a session
    const session = await account.createSession(userId, secret);

    console.log(
      "[Auth Callback] Session created:",
      session.$id,
      "Provider:",
      session.provider,
      "Has providerAccessToken:",
      !!session.providerAccessToken,
      "Token length:",
      session.providerAccessToken?.length || 0,
    );

    // Clean up old stale sessions for this user (keep only the new one)
    try {
      const users = new Users(client);
      const allSessions = await users.listSessions(userId);
      const staleSessions = allSessions.sessions.filter(
        (s) => s.$id !== session.$id,
      );

      if (staleSessions.length > 0) {
        console.log(
          `[Auth Callback] Cleaning up ${staleSessions.length} old session(s)`,
        );
        await Promise.allSettled(
          staleSessions.map((s) => users.deleteSession(userId, s.$id)),
        );
      }
    } catch (cleanupError) {
      // Non-critical — don't block login if cleanup fails
      console.warn("[Auth Callback] Session cleanup failed:", cleanupError);
    }

    // Set session cookies on our domain so both client and server can use them
    const isSecure = !baseUrl.startsWith("http://localhost");
    const cookieOpts = {
      path: "/",
      httpOnly: false, // Client-side SDK needs to read these
      secure: isSecure,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 365, // 1 year
    };

    setCookie(event, `a_session_${projectId}`, session.secret, cookieOpts);
    setCookie(event, `a_user_${projectId}`, userId, cookieOpts);

    // Persist the Discord OAuth provider token so downstream API endpoints
    // can use it without hitting the Identity store on every request.
    let discordAccessToken = session.providerAccessToken || null;
    let discordTokenExpiry = session.providerAccessTokenExpiry || null;
    let discordUid = session.providerUid || null;

    // The server-side createOAuth2Token + createSession flow often doesn't
    // populate providerAccessToken on the session object. Fall back to
    // Appwrite's Identity store which reliably persists the OAuth token.
    if (!discordAccessToken) {
      console.log(
        "[Auth Callback] No providerAccessToken on session — checking Identity store...",
      );
      try {
        const users = new Users(client);
        const identities = await users.listIdentities([
          Query.equal("userId", [userId]),
        ]);
        const discordIdentity = identities.identities.find(
          (i) => i.provider === "discord" || i.provider === "oauth2",
        );

        if (discordIdentity?.providerAccessToken) {
          discordAccessToken = discordIdentity.providerAccessToken;
          discordTokenExpiry =
            discordIdentity.providerAccessTokenExpiry || null;
          discordUid = discordUid || discordIdentity.providerUid || null;
          console.log(
            `[Auth Callback] Got Discord token from Identity store (length=${discordAccessToken.length}, uid=${discordUid || "none"})`,
          );
        } else {
          console.warn(
            "[Auth Callback] No providerAccessToken in Identity store either",
          );
        }
      } catch (identityErr: any) {
        console.warn(
          "[Auth Callback] Failed to query Identity store:",
          identityErr.message,
        );
      }
    }

    if (discordAccessToken) {
      console.log(
        `[Auth Callback] Saving Discord provider token cookie (length=${discordAccessToken.length}, uid=${discordUid || "none"})`,
      );

      setCookie(
        event,
        `discord_token_${projectId}`,
        discordAccessToken,
        cookieOpts,
      );

      if (discordTokenExpiry) {
        setCookie(
          event,
          `discord_token_expiry_${projectId}`,
          discordTokenExpiry,
          cookieOpts,
        );
      }

      if (discordUid) {
        setCookie(event, `discord_uid_${projectId}`, discordUid, cookieOpts);
      }
    } else {
      console.warn(
        "[Auth Callback] No Discord token available from session or Identity — guilds will rely on Identity fallback per-request",
      );
    }

    // Redirect to the client-side callback page to finalize store hydration
    return sendRedirect(event, `${baseUrl}/auth/callback`);
  } catch (error: any) {
    console.error(
      "[Auth Callback] Session creation failed:",
      error.message || error,
    );
    return sendRedirect(event, `${baseUrl}/login?error=session_failed`);
  }
});
