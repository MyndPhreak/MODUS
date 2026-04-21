/**
 * Session helpers for the native Discord OAuth flow.
 *
 * Cookie-sealed sessions via nuxt-auth-utils (which wraps h3's session
 * primitives). No DB round-trip on every request — the session payload
 * is encrypted into the cookie itself and validated in-memory.
 *
 * Public surface:
 *   - Session shape (user + secureTokens)
 *   - getResolvedUserId(event)       → best-effort user ID across backends
 *   - getDiscordAccessToken(event)   → fresh token, refreshing if needed
 *   - refreshNativeTokens(event)     → manual refresh entry point
 *   - clearNativeSession(event)      → logout
 *
 * Feature flag: NUXT_USE_NATIVE_AUTH. When off, `resolve*` helpers ignore
 * the native session entirely and callers fall back to Appwrite cookies.
 */
import type { H3Event } from "h3";

// ── Session shape ────────────────────────────────────────────────────────

export interface SessionUser {
  /** Discord user ID — canonical identifier in native mode. */
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  globalName?: string | null;
}

export interface DiscordTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when accessToken stops being valid. */
  expiresAt: number;
  /** Scopes granted during the OAuth exchange — used for diagnostics. */
  scopes: string[];
}

declare module "#auth-utils" {
  interface User extends SessionUser {}
  interface SecureSessionData {
    tokens: DiscordTokens;
  }
}

// ── Resolvers ────────────────────────────────────────────────────────────

/**
 * True when native auth is the active flow for this deployment. Callers
 * still check for a session on each request — this only gates the flow
 * selection.
 */
export function isNativeAuthEnabled(): boolean {
  const config = useRuntimeConfig();
  return String(config.useNativeAuth) === "true";
}

/**
 * Best-effort user ID that works regardless of which auth flow wrote the
 * session. Native mode → Discord UID. Legacy Appwrite mode → Appwrite user
 * ID cookie. Null when neither is present.
 *
 * Note: these two ID spaces are NOT interchangeable for data lookups —
 * callers should be aware of which backend owns the records they're
 * filtering. Stored `owner_id` / `admin_user_ids` values follow whichever
 * flow was active when the row was written.
 */
export async function getResolvedUserId(event: H3Event): Promise<string | null> {
  if (isNativeAuthEnabled()) {
    const session = await getUserSession(event);
    if (session.user?.id) return session.user.id;
  }
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;
  return getCookie(event, `a_user_${projectId}`) || null;
}

/**
 * Best-effort Discord UID. In native mode, this is the session user ID.
 * Legacy mode reads the `discord_uid_<projectId>` cookie.
 */
export async function getResolvedDiscordId(
  event: H3Event,
): Promise<string | null> {
  if (isNativeAuthEnabled()) {
    const session = await getUserSession(event);
    if (session.user?.id) return session.user.id;
  }
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;
  return getCookie(event, `discord_uid_${projectId}`) || null;
}

// ── Discord OAuth token helpers ──────────────────────────────────────────

const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
/** Refresh if fewer than this many ms remain on the access token. */
const REFRESH_THRESHOLD_MS = 60_000;

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Exchange an authorization `code` for access + refresh tokens. Used by
 * the callback handler on initial login.
 */
export async function exchangeDiscordCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<DiscordTokens> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const res = (await $fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })) as DiscordTokenResponse;

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: Date.now() + res.expires_in * 1000,
    scopes: res.scope.split(" ").filter(Boolean),
  };
}

/**
 * Use a refresh token to obtain a fresh access token. Throws if Discord
 * rejects the refresh (typically because the user revoked the app).
 */
export async function refreshDiscordTokens(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<DiscordTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = (await $fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })) as DiscordTokenResponse;

  return {
    accessToken: res.access_token,
    // Discord sometimes omits refresh_token in the rotation response; keep
    // the existing one when that happens.
    refreshToken: res.refresh_token || refreshToken,
    expiresAt: Date.now() + res.expires_in * 1000,
    scopes: res.scope.split(" ").filter(Boolean),
  };
}

/**
 * Return a valid Discord access token for the current session, refreshing
 * silently if it's near expiry. Returns null when there's no native
 * session (legacy Appwrite flow) or when refresh fails.
 */
export async function getDiscordAccessToken(
  event: H3Event,
): Promise<string | null> {
  if (!isNativeAuthEnabled()) return null;

  const session = await getUserSession(event);
  const tokens = session.secure?.tokens;
  if (!tokens) return null;

  if (tokens.expiresAt - Date.now() > REFRESH_THRESHOLD_MS) {
    return tokens.accessToken;
  }

  const refreshed = await refreshAndPersist(event, tokens.refreshToken);
  return refreshed?.accessToken ?? null;
}

/**
 * Force a token refresh and persist the new values into the session.
 * Used when a Discord call returns 401 despite the local expiry hint
 * looking fresh (can happen if the user revoked the app).
 */
export async function refreshNativeTokens(
  event: H3Event,
): Promise<DiscordTokens | null> {
  if (!isNativeAuthEnabled()) return null;
  const session = await getUserSession(event);
  const tokens = session.secure?.tokens;
  if (!tokens) return null;
  return refreshAndPersist(event, tokens.refreshToken);
}

async function refreshAndPersist(
  event: H3Event,
  refreshToken: string,
): Promise<DiscordTokens | null> {
  const config = useRuntimeConfig();
  const clientId = config.public.discordClientId as string;
  const clientSecret = config.discordClientSecret as string;

  if (!clientId || !clientSecret) {
    console.warn(
      "[session] Cannot refresh Discord tokens: client id or secret missing.",
    );
    return null;
  }

  try {
    const tokens = await refreshDiscordTokens(
      refreshToken,
      clientId,
      clientSecret,
    );
    // setUserSession merges — passing only `secure` preserves `user` from
    // the existing session so callers don't lose their identity.
    await setUserSession(event, { secure: { tokens } });
    return tokens;
  } catch (err: any) {
    console.warn(
      `[session] Discord token refresh failed: ${
        err?.data?.error_description || err?.message || err
      }`,
    );
    return null;
  }
}

export async function clearNativeSession(event: H3Event): Promise<void> {
  await clearUserSession(event);
}

// ── Auth guard helper ────────────────────────────────────────────────────

export interface AuthedIdentity {
  /** The userId governing data ownership checks (Discord UID in native mode,
   *  Appwrite user ID in legacy mode). */
  userId: string;
  backend: "native" | "appwrite";
}

/**
 * Require an authenticated request. Throws 401 when neither a native
 * session nor a valid Appwrite session pair is present.
 *
 * Consolidates the cookie-wrangling that every server endpoint used to
 * repeat. Callers get a tagged identity so they can tell which backend
 * produced the userId (useful for audit logs and for interpreting data
 * written by the other flow — see the note on the server records key
 * space in .env.example).
 */
export async function requireAuthedUserId(
  event: H3Event,
): Promise<AuthedIdentity> {
  if (isNativeAuthEnabled()) {
    const session = await getUserSession(event);
    if (session.user?.id) {
      return { userId: session.user.id, backend: "native" };
    }
  }

  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;
  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  const appwriteUserId = getCookie(event, `a_user_${projectId}`);
  if (sessionSecret && appwriteUserId) {
    return { userId: appwriteUserId, backend: "appwrite" };
  }

  throw createError({
    statusCode: 401,
    statusMessage: "Unauthorized: No session found.",
  });
}

/** Same as `requireAuthedUserId` but returns null instead of throwing. */
export async function tryAuthedUserId(
  event: H3Event,
): Promise<AuthedIdentity | null> {
  try {
    return await requireAuthedUserId(event);
  } catch {
    return null;
  }
}
