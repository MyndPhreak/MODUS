// Proxy: POST /api/music/action
// Forwards control actions (skip, pause, resume, stop, shuffle, play, volume, remove, reorder, search)
// to the bot's HTTP API
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { guild_id, action, ...params } = body || {};

  if (!guild_id || !action) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id or action",
    });
  }

  const validActions = [
    "skip",
    "pause",
    "resume",
    "stop",
    "shuffle",
    "play",
    "volume",
    "remove",
    "reorder",
    "search",
    "prequeue-add",
    "prequeue-remove",
    "prequeue-reorder",
    "prequeue-clear",
  ];

  if (!validActions.includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid action: ${action}`,
    });
  }

  const config = useRuntimeConfig();
  const botUrl = (config.public.botUrl as string) || "http://localhost:3005";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${botUrl}/music/${action}/${guild_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: data.error || "Bot API error",
      });
    }

    return data;
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error(`[music/action] Error (${action}):`, err.message);
    throw createError({
      statusCode: 502,
      statusMessage: "Could not reach bot",
    });
  }
});
