/**
 * Redis subscriber for the Nitro SSE bridge.
 *
 * Lazily spins up two ioredis connections (primary for diagnostic PINGs,
 * subscriber for the long-lived SUBSCRIBE). Handlers are registered per
 * channel and invoked with the deserialized payload. Drops malformed
 * messages with a warning so one bad publisher can't kill an SSE stream.
 *
 * Mirrors the bot-side EventBus surface enough that the SSE endpoints
 * don't need to know ioredis specifics. Feature-flagged by `REDIS_URL`
 * (shared env between bot and web) — callers fall back to "no realtime"
 * when unset.
 *
 * Channel names are duplicated from bot/EventBus.ts because this package
 * doesn't import from bot. Keep them in sync.
 */
import Redis, { type RedisOptions } from "ioredis";

export const CHANNEL_LOGS = "modus:realtime:logs";
export const CHANNEL_MODULES = "modus:realtime:modules";
export const CHANNEL_GUILD_CONFIGS = "modus:realtime:guild-configs";

export interface Envelope<T = unknown> {
  origin: string;
  ts: number;
  payload: T;
}

export type Handler<T = unknown> = (
  payload: T,
  envelope: Envelope<T>,
) => void;

interface Clients {
  primary: Redis;
  subscriber: Redis;
}

let clients: Clients | null = null;
const handlers = new Map<string, Set<Handler>>();
const subscribedChannels = new Set<string>();

function getClients(): Clients | null {
  if (clients) return clients;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  const opts: RedisOptions = {
    maxRetriesPerRequest: null,
    enableAutoPipelining: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  };

  const primary = new Redis(url, opts);
  const subscriber = new Redis(url, { ...opts, enableAutoPipelining: false });

  for (const [name, c] of [
    ["primary", primary],
    ["subscriber", subscriber],
  ] as const) {
    c.on("error", (err) => {
      console.warn(`[web-eventbus:${name}] ${err.message}`);
    });
  }

  subscriber.on("message", (channel, raw) => {
    const set = handlers.get(channel);
    if (!set || set.size === 0) return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw);
    } catch (err) {
      console.warn(
        `[web-eventbus] Dropping malformed message on ${channel}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return;
    }

    for (const handler of set) {
      try {
        handler(envelope.payload, envelope);
      } catch (err) {
        console.warn(
          `[web-eventbus] handler threw on ${channel}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
  });

  clients = { primary, subscriber };
  return clients;
}

/** True when REDIS_URL is configured. SSE endpoints early-return when not. */
export function isRealtimeAvailable(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Subscribe to a channel. Returns an unsubscribe function. Safe to call
 * with the same channel from multiple handlers — only the first
 * triggers the underlying Redis SUBSCRIBE.
 */
export async function subscribe<T = unknown>(
  channel: string,
  handler: Handler<T>,
): Promise<() => Promise<void>> {
  const c = getClients();
  if (!c) {
    return async () => {};
  }

  let set = handlers.get(channel);
  if (!set) {
    set = new Set();
    handlers.set(channel, set);
  }
  set.add(handler as Handler);

  if (!subscribedChannels.has(channel)) {
    subscribedChannels.add(channel);
    await c.subscriber.subscribe(channel);
  }

  return async () => {
    set!.delete(handler as Handler);
    if (set!.size === 0) {
      handlers.delete(channel);
      subscribedChannels.delete(channel);
      await c.subscriber.unsubscribe(channel).catch(() => {});
    }
  };
}
