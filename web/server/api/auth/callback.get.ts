/**
 * Discord OAuth callback handler.
 *
 * Verifies the CSRF state, exchanges the authorization code for tokens,
 * fetches the user's Discord profile, and seals both into a
 * nuxt-auth-utils session cookie. The client-side /auth/callback page
 * then hydrates the Pinia store from /api/auth/session.
 */
import {
  exchangeDiscordCode,
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

  const code = query.code as string | undefined;
  const state = query.state as string | undefined;
  const error = query.error as string | undefined;

  if (error) {
    console.warn(`[Auth Callback] Discord returned error: ${error}`);
    return sendRedirect(event, `${baseUrl}/login?error=discord_${error}`);
  }

  if (!code) {
    console.warn("[Auth Callback] Missing `code` query param.");
    return sendRedirect(event, `${baseUrl}/login?error=missing_code`);
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
      "[Auth Callback] Missing Discord OAuth credentials (client_id or secret).",
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
});
