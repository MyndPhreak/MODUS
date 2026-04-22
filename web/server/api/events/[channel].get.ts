/**
 * Server-Sent Events bridge.
 *
 * Subscribes to a whitelisted Redis channel and streams every event back
 * to the client as an SSE `data:` frame. Replaces the Appwrite Realtime
 * websocket that the dashboard used to maintain directly.
 *
 * Route: GET /api/events/:channel
 *   channel ∈ { logs, modules, guild-configs }
 *
 * Auth: requires any valid session (native or legacy). Consider tightening
 * to admin-only if the channel carries sensitive data.
 *
 * Heartbeat comments every 25s keep the connection alive through proxy
 * idle timeouts. The client (EventSource) reconnects automatically if
 * the stream drops.
 */
import {
  CHANNEL_GUILD_CONFIGS,
  CHANNEL_LOGS,
  CHANNEL_MODULES,
  isRealtimeAvailable,
  subscribe,
} from "../../utils/eventbus";
import { requireAuthedUserId } from "../../utils/session";

const HEARTBEAT_MS = 25_000;

const ROUTES: Record<string, string> = {
  logs: CHANNEL_LOGS,
  modules: CHANNEL_MODULES,
  "guild-configs": CHANNEL_GUILD_CONFIGS,
};

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const channelName = getRouterParam(event, "channel");
  if (!channelName || !ROUTES[channelName]) {
    throw createError({
      statusCode: 404,
      statusMessage: "Unknown event channel",
    });
  }

  if (!isRealtimeAvailable()) {
    throw createError({
      statusCode: 503,
      statusMessage:
        "Realtime unavailable: REDIS_URL is not configured on the server.",
    });
  }

  const redisChannel = ROUTES[channelName];
  const res = event.node.res;

  setResponseHeader(event, "Content-Type", "text/event-stream");
  setResponseHeader(event, "Cache-Control", "no-cache, no-transform");
  setResponseHeader(event, "Connection", "keep-alive");
  // Prevents nginx (and compatible proxies) from buffering the response.
  setResponseHeader(event, "X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Opening comment so clients recognize the stream immediately.
  res.write(`: connected\n\n`);

  const unsubscribe = await subscribe(redisChannel, (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Connection is closing; the cleanup handler below will tear down.
    }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_MS);
  // Don't keep the event loop alive waiting on this timer.
  heartbeat.unref?.();

  const cleanup = async () => {
    clearInterval(heartbeat);
    await unsubscribe().catch(() => {});
    try {
      res.end();
    } catch {
      // already closed
    }
  };

  event.node.req.on("close", cleanup);
  event.node.req.on("aborted", cleanup);

  // Return the unresolved promise so Nitro keeps the handler alive until
  // the client disconnects. `cleanup` resolves it.
  return new Promise<void>((resolve) => {
    event.node.req.on("close", () => resolve());
  });
});
