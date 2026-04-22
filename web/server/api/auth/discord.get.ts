/**
 * Discord OAuth initiation.
 *
 * Builds a Discord authorize URL directly (client_id + redirect_uri +
 * identify/guilds scopes + CSRF state cookie) and redirects. The session
 * is sealed into a cookie by /api/auth/callback once Discord sends the
 * user back with a code.
 */
import { randomBytes } from "crypto";

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const STATE_COOKIE = "discord_oauth_state";
const STATE_COOKIE_MAX_AGE_SEC = 600; // 10 min — long enough for a slow user

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.baseUrl as string;

  const clientId = config.public.discordClientId as string;
  if (!clientId) {
    console.error(
      "[Auth] NUXT_PUBLIC_DISCORD_CLIENT_ID is unset — OAuth cannot start.",
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
  });
  return sendRedirect(
    event,
    `${DISCORD_AUTHORIZE_URL}?${params.toString()}`,
    302,
  );
});
