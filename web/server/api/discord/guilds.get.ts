/**
 * Fetch the current user's Discord guilds.
 */
import { fetchUserDiscordGuilds } from "../../utils/session";

export default defineEventHandler(async (event) => {
  return fetchUserDiscordGuilds(event);
});
