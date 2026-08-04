/**
 * GET /api/docs/modules
 *
 * Public proxy to the bot's module/command catalog (GET /api/docs) for the
 * public /docs pages. No auth — same sensitivity as /help in Discord.
 */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig();
  const botUrl = (config.public.botUrl as string) || "http://localhost:3005";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${botUrl}/api/docs`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      throw createError({
        statusCode: 502,
        statusMessage: body || "Bot returned an error.",
      });
    }

    return await response.json();
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error("[docs/modules] Error:", err.message);
    throw createError({
      statusCode: 503,
      statusMessage: "Could not reach bot.",
    });
  }
});
