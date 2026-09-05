/**
 * Clear the user session.
 */
import { clearNativeSession } from "../../utils/session";
import { forgetDiscordUser } from "../../utils/discord-user-cache";

export default defineEventHandler(async (event) => {
  // Drop the cached Discord profile/guilds too, so signing back in (as
  // anyone) can't be served the previous session's copy.
  const session = await getUserSession(event);
  if (session.user?.id) forgetDiscordUser(session.user.id);

  await clearNativeSession(event);
  return { success: true };
});
