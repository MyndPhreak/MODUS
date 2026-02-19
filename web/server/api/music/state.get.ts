// Proxy: GET /api/music/state?guild_id=...
// Fetches the current player state from the bot's HTTP API
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id" });
  }

  const config = useRuntimeConfig();
  const botUrl = (config.public.botUrl as string) || "http://localhost:3005";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${botUrl}/music/state/${guildId}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      throw createError({
        statusCode: response.status,
        statusMessage: body || "Bot API error",
      });
    }

    return await response.json();
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error("[music/state] Error:", err.message);
    throw createError({
      statusCode: 502,
      statusMessage: "Could not reach bot",
    });
  }
});
