/**
 * Server-Sent Events bridge.
 *
 * Subscribes to a whitelisted Redis channel and streams every event back
 * to the client as an SSE `data:` frame. Replaces the Appwrite Realtime
 * websocket that the dashboard used to maintain directly.
 *
 * Route: GET /api/events/:channel
 *   channel ∈ { logs, modules, guild-configs, poll-votes }
 *
 * Auth: requires any valid session. The `logs` channel carries log entries
 * across every guild, so it is additionally restricted to bot admins.
 * The `poll-votes` channel carries per-guild data (including which Discord
 * user voted) across every guild the bot serves, so it requires a
 * `guild_id` query param and guild-manager access, and every published
 * payload is filtered server-side to that guild before being written to
 * the stream — it is never a fleet-wide firehose to the client.
 *
 * Heartbeat comments every 25s keep the connection alive through proxy
 * idle timeouts. The client (EventSource) reconnects automatically if
 * the stream drops.
 */
import {
  CHANNEL_GUILD_CONFIGS,
  CHANNEL_LOGS,
  CHANNEL_MODULES,
  CHANNEL_POLL_VOTES,
  isRealtimeAvailable,
  subscribe,
} from "../../utils/eventbus";
import {
  requireAuthedUserId,
  requireBotAdmin,
  requireModuleAccess,
} from "../../utils/session";

const HEARTBEAT_MS = 25_000;

const ROUTES: Record<string, string> = {
  logs: CHANNEL_LOGS,
  modules: CHANNEL_MODULES,
  "guild-configs": CHANNEL_GUILD_CONFIGS,
  "poll-votes": CHANNEL_POLL_VOTES,
};

// Channels whose payloads span all guilds — bot admins only.
const ADMIN_ONLY_CHANNELS = new Set(["logs"]);

// Channels whose payloads span all guilds but are meant to be visible to
// guild managers of the specific guild the payload belongs to — requires
// a guild_id query param and per-payload filtering (see below).
const GUILD_SCOPED_CHANNELS = new Set(["poll-votes"]);

export default defineEventHandler(async (event) => {
  const channelName = getRouterParam(event, "channel");
  if (!channelName || !ROUTES[channelName]) {
    throw createError({
      statusCode: 404,
      statusMessage: "Unknown event channel",
    });
  }

  let scopedGuildId: string | null = null;
  if (ADMIN_ONLY_CHANNELS.has(channelName)) {
    await requireBotAdmin(event);
  } else if (GUILD_SCOPED_CHANNELS.has(channelName)) {
    const guildId = getQuery(event).guild_id as string | undefined;
    if (!guildId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing guild_id query parameter.",
      });
    }
    await requireModuleAccess(event, guildId, "events");
    scopedGuildId = guildId;
  } else {
    await requireAuthedUserId(event);
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
    if (
      scopedGuildId &&
      (payload as { guildId?: string } | null)?.guildId !== scopedGuildId
    ) {
      return;
    }
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
