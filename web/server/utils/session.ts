/**
 * Session helpers for Discord OAuth.
 *
 * Cookie-sealed sessions via nuxt-auth-utils (wraps h3's session primitives).
 * No DB round-trip on every request — the session payload is encrypted into
 * the cookie and validated in-memory.
 *
 * Public surface:
 *   - Session shape (user + secureTokens)
 *   - requireAuthedUserId(event)    → { userId } or 401
 *   - getDiscordAccessToken(event)  → fresh token, refreshing if needed
 *   - refreshNativeTokens(event)    → manual refresh entry point
 *   - clearNativeSession(event)     → logout
 */
import type { H3Event } from "h3";
import { getRepos } from "./db";

// ── Session shape ────────────────────────────────────────────────────────

export interface SessionUser {
  /** Discord user ID — canonical identifier. */
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

// ── Auth guards ──────────────────────────────────────────────────────────

export interface AuthedIdentity {
  /** Discord user ID governing data ownership checks. */
  userId: string;
}

/** Throws 401 when no valid session is present. */
export async function requireAuthedUserId(
  event: H3Event,
): Promise<AuthedIdentity> {
  const session = await getUserSession(event);
  if (session.user?.id) {
    return { userId: session.user.id };
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

/**
 * Require the caller to be a MODUS bot admin. Backed by the
 * NUXT_PUBLIC_BOT_ADMIN_IDS env var (comma-separated Discord UIDs);
 * no DB presence for this role. Throws 403 when the caller is
 * authenticated but not on the list.
 */
export async function requireBotAdmin(
  event: H3Event,
): Promise<AuthedIdentity> {
  const identity = await requireAuthedUserId(event);
  const config = useRuntimeConfig();
  const adminIds = (config.public.botAdminIds || "")
    .split(",")
    .map((id: string) => id.trim())
    .filter(Boolean);
  if (!adminIds.includes(identity.userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Bot admin role required.",
    });
  }
  return identity;
}

/**
 * Require the caller to own or be listed as an admin of the given guild
 * in the `servers` table. 403 otherwise. Bot admins implicitly pass.
 *
 * Every endpoint that mutates per-guild config should gate on this so a
 * logged-in user can't write to a guild they don't manage.
 */
export async function requireGuildManager(
  event: H3Event,
  guildId: string,
): Promise<AuthedIdentity> {
  const identity = await requireAuthedUserId(event);

  const config = useRuntimeConfig();
  const botAdminIds = (config.public.botAdminIds || "")
    .split(",")
    .map((id: string) => id.trim())
    .filter(Boolean);
  if (botAdminIds.includes(identity.userId)) return identity;

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }
  const server = await repos.servers.getByGuildId(guildId);
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: "Server not found." });
  }
  const isOwner = server.owner_id === identity.userId;
  const isAdmin = server.admin_user_ids.includes(identity.userId);
  if (!isOwner && !isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "You don't manage this server.",
    });
  }
  return identity;
}

/** Return the Discord UID of the caller, or null when unauthenticated. */
export async function getResolvedDiscordId(
  event: H3Event,
): Promise<string | null> {
  const session = await getUserSession(event);
  return session.user?.id ?? null;
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
 * silently if it's near expiry. Returns null when there's no session or
 * when refresh fails.
 */
export async function getDiscordAccessToken(
  event: H3Event,
): Promise<string | null> {
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
