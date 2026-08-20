// Proxy: GET /api/music/lyrics?guild_id=...&query=...
import { requireModuleAccess } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;
  const songQuery = query.query as string | undefined;

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id",
    });
  }

  await requireModuleAccess(event, guildId, "music");

  const config = useRuntimeConfig();
  const botUrl = (config.public.botUrl as string) || "http://localhost:3005";
  const botSecret = config.botApiSecret as string;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const headers: Record<string, string> = {};
    if (botSecret) headers["X-Bot-Secret"] = botSecret;

    const url = new URL(`${botUrl}/music/lyrics/${guildId}`);
    if (songQuery) url.searchParams.set("query", songQuery);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: data.error || "Lyrics not found",
      });
    }

    return data;
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error("[music/lyrics] Error:", err.message);
    throw createError({
      statusCode: 502,
      statusMessage: "Could not reach bot",
    });
  }
});
