/**
 * Return the currently-authenticated user.
 *
 * The Pinia store polls this on app startup to hydrate itself. Shape is
 * stable across both auth flows so the client doesn't need to branch:
 *   { user: { id, username, avatar, ... } | null, backend: "native" | "appwrite" | null }
 *
 * The native response also carries a `tokenExpiresAt` hint so the client
 * can schedule a proactive re-auth before Discord invalidates the token
 * (1 week on `identify` scope — users notice a dead dashboard otherwise).
 */
import { isNativeAuthEnabled } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // Native session: sealed cookie, readable via nuxt-auth-utils.
  if (isNativeAuthEnabled()) {
    const session = await getUserSession(event);
    if (session.user) {
      return {
        backend: "native" as const,
        user: session.user,
        tokenExpiresAt: session.secure?.tokens?.expiresAt ?? null,
      };
    }
  }

  // Legacy Appwrite: just report the `a_user_<projectId>` cookie presence.
  // The Pinia store's existing flow still calls Appwrite directly via
  // the client SDK to flesh out the user object; we don't duplicate it
  // server-side here.
  const projectId = config.public.appwriteProjectId as string;
  const userId = getCookie(event, `a_user_${projectId}`);
  const sessionSecret = getCookie(event, `a_session_${projectId}`);

  if (userId && sessionSecret) {
    return {
      backend: "appwrite" as const,
      user: { id: userId },
      tokenExpiresAt: null,
    };
  }

  return { backend: null, user: null, tokenExpiresAt: null };
});
