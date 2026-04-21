/**
 * Thin JSON-framed pub/sub over Redis.
 *
 * Used for cross-shard cache invalidation today; future consumers include
 * dashboard realtime (SSE fan-out) and cross-shard music queue handoff.
 *
 * Each `publish()` serializes the payload to JSON; each subscriber parses
 * on receipt. Malformed messages are logged and dropped so one bad publisher
 * can't take a subscriber down.
 *
 * An `originId` is attached to every message so subscribers can ignore
 * their own publishes — useful for cache invalidation where the publisher
 * already did the local delete.
 */
import { randomUUID } from "crypto";
import type { RedisClients } from "./RedisClient";

export interface Envelope<T = unknown> {
  origin: string;
  ts: number;
  payload: T;
}

export type Handler<T = unknown> = (payload: T, envelope: Envelope<T>) => void;

export class EventBus {
  readonly originId: string;
  private handlers = new Map<string, Set<Handler>>();
  private subscribedChannels = new Set<string>();

  constructor(
    private clients: RedisClients,
    originId?: string,
  ) {
    this.originId = originId ?? randomUUID();

    this.clients.subscriber.on("message", (channel, raw) => {
      const set = this.handlers.get(channel);
      if (!set || set.size === 0) return;

      let envelope: Envelope;
      try {
        envelope = JSON.parse(raw);
      } catch (err) {
        console.warn(
          `[EventBus] Dropping malformed message on ${channel}: ${
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
            `[EventBus] Handler threw on ${channel}: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
    });
  }

  async publish<T>(channel: string, payload: T): Promise<void> {
    const envelope: Envelope<T> = {
      origin: this.originId,
      ts: Date.now(),
      payload,
    };
    await this.clients.primary.publish(channel, JSON.stringify(envelope));
  }

  /**
   * Register a handler. Multiple handlers per channel are supported. The
   * Redis SUBSCRIBE call happens lazily on the first handler.
   */
  async subscribe<T>(
    channel: string,
    handler: Handler<T>,
  ): Promise<() => Promise<void>> {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler as Handler);

    if (!this.subscribedChannels.has(channel)) {
      this.subscribedChannels.add(channel);
      await this.clients.subscriber.subscribe(channel);
    }

    return async () => {
      set!.delete(handler as Handler);
      if (set!.size === 0) {
        this.handlers.delete(channel);
        this.subscribedChannels.delete(channel);
        await this.clients.subscriber.unsubscribe(channel).catch(() => {});
      }
    };
  }
}
