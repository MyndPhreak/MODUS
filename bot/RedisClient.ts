/**
 * Redis client factory.
 *
 * Two connections per process: a normal command client plus a dedicated
 * subscriber. ioredis requires the subscriber to be in pub/sub mode, which
 * blocks regular commands — hence the split.
 *
 * Feature-flagged via `REDIS_URL`. When unset, `createRedisClients()` returns
 * null and every downstream primitive (CacheService, LeaderElection,
 * EventBus) gracefully degrades to in-process behavior.
 */
import Redis, { RedisOptions } from "ioredis";

export interface RedisClients {
  /** For SET / GET / pub / EVAL — anything that isn't a blocking subscribe. */
  primary: Redis;
  /** Dedicated subscriber. Only use for `subscribe` / `psubscribe`. */
  subscriber: Redis;
}

/**
 * Build both connections. Returns null when REDIS_URL is empty so callers
 * can branch without try/catch noise.
 */
export function createRedisClients(
  overrides: RedisOptions = {},
): RedisClients | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  // Opts chosen for a long-running bot: reconnect forever, don't drop commands
  // during transient outages, and keep auto-pipelining on for throughput.
  const opts: RedisOptions = {
    maxRetriesPerRequest: null,
    enableAutoPipelining: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    reconnectOnError: (err) =>
      /READONLY|ECONNRESET|ETIMEDOUT/.test(err.message),
    ...overrides,
  };

  const primary = new Redis(url, opts);
  const subscriber = new Redis(url, { ...opts, enableAutoPipelining: false });

  for (const [name, client] of [
    ["primary", primary],
    ["subscriber", subscriber],
  ] as const) {
    client.on("error", (err) => {
      // ioredis surfaces transient connection errors that it already handles
      // via retryStrategy — log at warn so operators see flapping without
      // treating every disconnect as fatal.
      console.warn(`[redis:${name}] ${err.message}`);
    });
  }

  return { primary, subscriber };
}

/** Best-effort quiesce of both clients. Safe to call repeatedly. */
export async function closeRedisClients(
  clients: RedisClients | null,
): Promise<void> {
  if (!clients) return;
  await Promise.allSettled([
    clients.primary.quit().catch(() => clients.primary.disconnect()),
    clients.subscriber.quit().catch(() => clients.subscriber.disconnect()),
  ]);
}
