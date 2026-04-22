/**
 * Return the currently-authenticated user.
 *
 * The Pinia store polls this on app startup. Shape:
 *   { user: SessionUser | null, tokenExpiresAt: number | null }
 *
 * `tokenExpiresAt` lets the client schedule a proactive re-auth before
 * Discord invalidates the access token (usually ~1 week on `identify`).
 */

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session.user) {
    return { user: null, tokenExpiresAt: null };
  }
  return {
    user: session.user,
    tokenExpiresAt: session.secure?.tokens?.expiresAt ?? null,
  };
});
