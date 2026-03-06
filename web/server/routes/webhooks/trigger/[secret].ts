/**
 * Webhook Trigger Proxy
 *
 * Proxies incoming POST requests from external services (GitHub, Twitch,
 * generic webhooks) through the public Nuxt host (modus.ppo.gg) to the
 * bot's internal HTTP server (modus-bot.ppo.gg / http://bot:3005 in Docker).
 *
 * External services send to:
 *   POST https://modus.ppo.gg/webhooks/trigger/<secret>
 *
 * This handler forwards the request to:
 *   POST http://bot:3005/webhooks/trigger/<secret>   (Docker internal)
 *   or   https://modus-bot.ppo.gg/...               (set via NUXT_BOT_WEBHOOK_URL)
 *
 * Also handles the Twitch webhook verification challenge (GET + query params)
 * and OPTIONS CORS preflight.
 *
 * Environment:
 *   NUXT_BOT_WEBHOOK_URL  — Base URL of the bot's HTTP server.
 *                           Defaults to http://bot:3005 (Docker internal network).
 */

export default defineEventHandler(async (event) => {
  const secret = getRouterParam(event, "secret");

  if (!secret) {
    throw createError({ statusCode: 400, statusMessage: "Missing secret" });
  }

  // ── CORS preflight ────────────────────────────────────────────────
  if (event.method === "OPTIONS") {
    setResponseHeaders(event, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Hub-Signature-256, X-GitHub-Event, X-Twitch-Eventsub-Message-Type",
    });
    event.node.res.writeHead(204);
    event.node.res.end();
    return;
  }

  // ── Resolve the bot's base URL ────────────────────────────────────
  // Private runtime config so it's never exposed to the client bundle.
  const config = useRuntimeConfig();
  const botWebhookBase =
    (config.botWebhookUrl as string | undefined) || "http://bot:3005";

  const targetUrl = `${botWebhookBase.replace(/\/$/, "")}/webhooks/trigger/${secret}`;

  // ── Forward the request ───────────────────────────────────────────
  // Pass through all original headers (GitHub signature, Twitch event type, etc.)
  // minus hop-by-hop headers that must not be forwarded.
  const incomingHeaders = getRequestHeaders(event);
  const forwardHeaders: HeadersInit = {};
  const skipHeaders = new Set(["host", "connection", "transfer-encoding"]);
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (!skipHeaders.has(key.toLowerCase()) && value !== undefined) {
      forwardHeaders[key] = value;
    }
  }

  // Read raw body (preserves signature verification on the bot side)
  const body = await readRawBody(event);

  try {
    const botResponse = await fetch(targetUrl, {
      method: event.method,
      headers: forwardHeaders,
      body: body ?? undefined,
    });

    // Mirror the bot's status code and JSON response back to the caller
    const responseBody = await botResponse.text();

    setResponseStatus(event, botResponse.status);
    setResponseHeader(
      event,
      "Content-Type",
      botResponse.headers.get("Content-Type") || "application/json",
    );
    setResponseHeader(event, "Access-Control-Allow-Origin", "*");

    return responseBody;
  } catch (err: any) {
    console.error("[Webhook Proxy] Failed to reach bot:", err?.message || err);
    throw createError({
      statusCode: 502,
      statusMessage: "Bot unreachable. The webhook could not be delivered.",
    });
  }
});
