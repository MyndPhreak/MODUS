/**
 * Server-side endpoint to fetch the current user's Discord guilds.
 *
 * Strategy:
 * 1. Read the Discord OAuth token from the cookie (set during login callback)
 * 2. If the token is present and not expired, use it to fetch the user's guilds
 * 3. Fall back to Bot token (returns only guilds the bot is in)
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;
  const botToken = config.discordBotToken as string;

  const sessionSecret = getCookie(event, `a_session_${projectId}`);
  if (!sessionSecret) {
    throw createError({
      statusCode: 401,
      statusMessage:
        "Unauthorized: No Appwrite session found. Please log in again.",
    });
  }

  // ── Strategy 1: Read Discord OAuth token from cookie ──────────────────
  const discordToken = getCookie(event, `discord_token_${projectId}`);
  const discordExpiry = getCookie(event, `discord_token_expiry_${projectId}`);
  const isExpired = discordExpiry
    ? new Date(discordExpiry).getTime() < Date.now()
    : false;

  console.log(
    `[Guilds API] Discord token cookie: present=${!!discordToken}, length=${discordToken?.length || 0}, expiry=${discordExpiry || "none"}, expired=${isExpired}`,
  );

  if (discordToken && !isExpired) {
    console.log(
      "[Guilds API] Fetching guilds via user OAuth token (cookie)...",
    );
    try {
      const response = await $fetch(
        "https://discord.com/api/users/@me/guilds",
        {
          headers: {
            Authorization: `Bearer ${discordToken}`,
          },
        },
      );

      console.log(
        `[Guilds API] User OAuth token returned ${(response as any[])?.length || 0} guilds`,
      );
      return response;
    } catch (discordError: any) {
      console.warn(
        `[Guilds API] OAuth token failed (${discordError.status || discordError.statusCode}), falling back to Bot token`,
      );
    }
  }

  // ── No valid user token — return empty ─────────────────────────────────
  // IMPORTANT: Do NOT fall back to Bot token here. The Bot token returns
  // the bot's own guilds, not the user's guilds. Those guilds lack
  // user-specific permission flags and would be leaked across all users.
  console.warn(
    "[Guilds API] No valid Discord OAuth token — returning empty guilds list",
  );
  return [];
});
