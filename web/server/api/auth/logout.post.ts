/**
 * Clear every auth artifact — native session cookie AND the Appwrite
 * cookies. Safe to call regardless of which flow wrote them; missing
 * cookies are no-ops.
 *
 * The legacy Appwrite session itself (server-side record) is deleted by
 * the client-side `account.deleteSession("current")` call that precedes
 * this POST. This endpoint just scrubs the cookies on our domain.
 */
import { clearNativeSession } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // Native sealed-cookie session.
  await clearNativeSession(event).catch(() => {});

  // Legacy Appwrite cookies. Explicit MaxAge=0 + matching path ensures
  // the delete actually lands on the client.
  const opts = { path: "/", maxAge: 0 };
  for (const name of [
    `a_session_${projectId}`,
    `a_user_${projectId}`,
    `discord_token_${projectId}`,
    `discord_token_expiry_${projectId}`,
    `discord_uid_${projectId}`,
  ]) {
    setCookie(event, name, "", opts);
  }

  return { success: true };
});
