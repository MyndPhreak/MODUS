/**
 * Discord OAuth initiation.
 *
 * Two paths:
 *   - Native (NUXT_USE_NATIVE_AUTH=true): build a Discord authorize URL
 *     ourselves, stash a CSRF state cookie, and redirect.
 *   - Legacy (default): delegate to Appwrite's createOAuth2Token, which
 *     returns a redirect URL that comes back to /api/auth/callback.
 *
 * The legacy path stays wired so flipping the flag on is reversible — a
 * user who already logged in via Appwrite can still complete flows until
 * their session expires.
 */
import { Client, Account, OAuthProvider } from "node-appwrite";
import { isNativeAuthEnabled } from "../../utils/session";
import { randomBytes } from "crypto";

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const STATE_COOKIE = "discord_oauth_state";
const STATE_COOKIE_MAX_AGE_SEC = 600; // 10 min — long enough for a slow user

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.baseUrl as string;

  if (isNativeAuthEnabled()) {
    const clientId = config.public.discordClientId as string;
    if (!clientId) {
      console.error(
        "[Auth] Native auth enabled but NUXT_PUBLIC_DISCORD_CLIENT_ID is unset.",
      );
      return sendRedirect(event, `${baseUrl}/login?error=oauth_misconfigured`);
    }

    // CSRF defense: random state that must echo back on the callback.
    const state = randomBytes(16).toString("hex");
    const isSecure = !baseUrl.startsWith("http://localhost");
    setCookie(event, STATE_COOKIE, state, {
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: STATE_COOKIE_MAX_AGE_SEC,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: `${baseUrl}/api/auth/callback`,
      scope: "identify guilds",
      state,
      // `prompt=none` would skip consent for returning users; we keep the
      // default so re-authorizing always refreshes the scope set cleanly.
    });
    return sendRedirect(
      event,
      `${DISCORD_AUTHORIZE_URL}?${params.toString()}`,
      302,
    );
  }

  // ── Legacy Appwrite path (unchanged) ────────────────────────────────────
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const account = new Account(client);
  const successUrl = `${baseUrl}/api/auth/callback`;
  const failureUrl = `${baseUrl}/login?error=oauth_failed`;

  try {
    const redirectUrl = await account.createOAuth2Token(
      OAuthProvider.Discord,
      successUrl,
      failureUrl,
      ["identify", "guilds"],
    );
    await sendRedirect(event, redirectUrl);
  } catch (error: any) {
    console.error(
      "[Auth] Discord OAuth token creation failed:",
      error.message || error,
    );
    await sendRedirect(event, `${baseUrl}/login?error=oauth_init_failed`);
  }
});
