import { Client, Account, Users } from "node-appwrite";

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
