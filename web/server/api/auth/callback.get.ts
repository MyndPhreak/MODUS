/**
 * OAuth callback handler.
 *
 * Auto-detects which flow is completing based on the query parameters:
 *   - Native: `?code=…&state=…`       → Discord authorization-code exchange
 *   - Legacy: `?userId=…&secret=…`    → Appwrite OAuth2Token exchange
 *
 * Either flow ends with a redirect to /auth/callback (the client-side page
 * that hydrates the Pinia user store).
 */
import { Client, Account, Users, Query } from "node-appwrite";
import {
  exchangeDiscordCode,
  isNativeAuthEnabled,
  type DiscordTokens,
} from "../../utils/session";

const STATE_COOKIE = "discord_oauth_state";

interface DiscordUserResponse {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name?: string | null;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const baseUrl = config.public.baseUrl as string;

  // ── Native flow (Discord authorization code) ──────────────────────────
  // Triggered when `code` is present, regardless of the useNativeAuth flag.
  // This means an operator can flip the flag mid-flight without stranding
  // a user who already redirected to Discord with the legacy path.
  if (query.code) {
    if (!isNativeAuthEnabled()) {
      console.warn(
        "[Auth Callback] Received `code` but NUXT_USE_NATIVE_AUTH is off — rejecting.",
      );
      return sendRedirect(event, `${baseUrl}/login?error=native_auth_disabled`);
    }
    return handleNativeCallback(event, baseUrl);
  }

  // ── Legacy Appwrite flow (userId + secret) ─────────────────────────────
  return handleAppwriteCallback(event, baseUrl);
});

// ── Native ────────────────────────────────────────────────────────────────

async function handleNativeCallback(event: any, baseUrl: string) {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  const code = query.code as string;
  const state = query.state as string | undefined;
  const error = query.error as string | undefined;

  if (error) {
    console.warn(`[Auth Callback] Discord returned error: ${error}`);
    return sendRedirect(event, `${baseUrl}/login?error=discord_${error}`);
  }

  const expectedState = getCookie(event, STATE_COOKIE);
  // Clear the state cookie regardless of outcome.
  setCookie(event, STATE_COOKIE, "", { path: "/", maxAge: 0 });

  if (!state || !expectedState || state !== expectedState) {
    console.warn(
      `[Auth Callback] OAuth state mismatch (got="${state}", expected="${expectedState}")`,
    );
    return sendRedirect(event, `${baseUrl}/login?error=oauth_state_mismatch`);
  }

  const clientId = config.public.discordClientId as string;
  const clientSecret = config.discordClientSecret as string;
  if (!clientId || !clientSecret) {
    console.error(
      "[Auth Callback] Missing Discord OAuth credentials for native flow.",
    );
    return sendRedirect(event, `${baseUrl}/login?error=oauth_misconfigured`);
  }

  let tokens: DiscordTokens;
  try {
    tokens = await exchangeDiscordCode({
      code,
      clientId,
      clientSecret,
      redirectUri: `${baseUrl}/api/auth/callback`,
    });
  } catch (err: any) {
    console.error(
      "[Auth Callback] Discord code exchange failed:",
      err?.data?.error_description || err?.message || err,
    );
    return sendRedirect(event, `${baseUrl}/login?error=code_exchange_failed`);
  }

  // Fetch the user's Discord profile so the session has the fields the UI
  // needs without a follow-up round-trip on every page.
  let profile: DiscordUserResponse;
  try {
    profile = (await $fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })) as DiscordUserResponse;
  } catch (err: any) {
    console.error(
      "[Auth Callback] Failed to fetch Discord profile:",
      err?.message || err,
    );
    return sendRedirect(event, `${baseUrl}/login?error=profile_fetch_failed`);
  }

  await setUserSession(event, {
    user: {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator ?? "0",
      avatar: profile.avatar ?? null,
      globalName: profile.global_name ?? null,
    },
    secure: { tokens },
  });

  return sendRedirect(event, `${baseUrl}/auth/callback`);
}

// ── Legacy Appwrite (unchanged behavior, preserved for fallback) ──────────

async function handleAppwriteCallback(event: any, baseUrl: string) {
  const config = useRuntimeConfig();
  const query = getQuery(event);
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
    const session = await account.createSession(userId, secret);

    try {
      const users = new Users(client);
      const allSessions = await users.listSessions(userId);
      const staleSessions = allSessions.sessions.filter(
        (s) => s.$id !== session.$id,
      );
      if (staleSessions.length > 0) {
        await Promise.allSettled(
          staleSessions.map((s) => users.deleteSession(userId, s.$id)),
        );
      }
    } catch (cleanupError) {
      console.warn("[Auth Callback] Session cleanup failed:", cleanupError);
    }

    const isSecure = !baseUrl.startsWith("http://localhost");
    const cookieOpts = {
      path: "/",
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 365,
    };

    setCookie(event, `a_session_${projectId}`, session.secret, cookieOpts);
    setCookie(event, `a_user_${projectId}`, userId, cookieOpts);

    let discordAccessToken = session.providerAccessToken || null;
    let discordTokenExpiry = session.providerAccessTokenExpiry || null;
    let discordUid = session.providerUid || null;

    if (!discordAccessToken) {
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
        }
      } catch (identityErr: any) {
        console.warn(
          "[Auth Callback] Failed to query Identity store:",
          identityErr.message,
        );
      }
    }

    if (discordAccessToken) {
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
    }

    return sendRedirect(event, `${baseUrl}/auth/callback`);
  } catch (error: any) {
    console.error(
      "[Auth Callback] Session creation failed:",
      error.message || error,
    );
    return sendRedirect(event, `${baseUrl}/login?error=session_failed`);
  }
}
