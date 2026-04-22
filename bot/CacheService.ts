/**
 * Per-process TTL cache with cross-shard invalidation over Redis pub/sub.
 *
 * Design: L1-only (no L2 Redis read). Each shard keeps its own in-memory
 * Map so hot-path reads stay synchronous and sub-millisecond. When a shard
 * writes, it publishes an invalidation event; other shards drop the key
 * from their L1 and the next read re-fetches from the source of truth
 * (Postgres / Appwrite). Per-shard TTL still bounds how stale a value can
 * be even if pub/sub is down.
 *
 * Drop-in replacement for the old in-line `TTLCache`: same method shapes
 * so DatabaseService call sites don't change. When constructed without an
 * EventBus, behavior is identical to the old single-process cache.
 */
import type { EventBus } from "./EventBus";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface InvalidateMessage {
  kind: "key" | "prefix" | "all";
  value?: string;
}

export interface CacheServiceOptions {
  /** TTL for new entries, in seconds. Default 60s. */
  ttlSeconds?: number;
  /**
   * EventBus for cross-shard invalidation. When omitted, this cache acts
   * as a single-process TTLCache (identical to the previous behavior).
   */
  eventBus?: EventBus | null;
  /**
   * Pub/sub channel. Defaults to "modus:cache:invalidate". Override only
   * when running multiple isolated caches on the same Redis instance.
   */
  channel?: string;
}

export class CacheService<T = any> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly eventBus: EventBus | null;
  private readonly channel: string;
  private unsubscribe: (() => Promise<void>) | null = null;

  constructor(options: CacheServiceOptions = {}) {
    this.ttlMs = (options.ttlSeconds ?? 60) * 1000;
    this.eventBus = options.eventBus ?? null;
    this.channel = options.channel ?? "modus:cache:invalidate";

    if (this.eventBus) {
      // subscribe() is async; fire-and-forget with a caught promise so
      // construction stays synchronous. The subscription is established
      // on the next tick — a small window where we may miss invalidations
      // on startup, which is acceptable given the TTL ceiling.
      this.eventBus
        .subscribe<InvalidateMessage>(this.channel, (payload, envelope) => {
          if (envelope.origin === this.eventBus!.originId) return; // our own publish
          this.applyInvalidation(payload);
        })
        .then((unsub) => {
          this.unsubscribe = unsub;
        })
        .catch((err) => {
          console.warn(
            `[CacheService] Failed to subscribe to ${this.channel}: ${
              err instanceof Error ? err.message : err
            }`,
          );
        });
    }
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  /** Invalidate one key locally and fanout to other shards. */
  invalidate(key: string): void {
    this.store.delete(key);
    this.broadcast({ kind: "key", value: key });
  }

  /** Invalidate every key starting with `prefix` locally and on other shards. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    this.broadcast({ kind: "prefix", value: prefix });
  }

  /** Clear every entry locally and on other shards. */
  invalidateAll(): void {
    this.store.clear();
    this.broadcast({ kind: "all" });
  }

  get size(): number {
    return this.store.size;
  }

  async close(): Promise<void> {
    if (this.unsubscribe) {
      await this.unsubscribe().catch(() => {});
      this.unsubscribe = null;
    }
  }

  // ── internals ────────────────────────────────────────────────────────

  private applyInvalidation(msg: InvalidateMessage): void {
    switch (msg.kind) {
      case "key":
        if (msg.value) this.store.delete(msg.value);
        return;
      case "prefix":
        if (!msg.value) return;
        for (const key of this.store.keys()) {
          if (key.startsWith(msg.value)) this.store.delete(key);
        }
        return;
      case "all":
        this.store.clear();
        return;
    }
  }

  private broadcast(msg: InvalidateMessage): void {
    if (!this.eventBus) return;
    // Fire-and-forget: an invalidation publish failure must not block the
    // write path. The per-shard TTL bounds how long a stale value can live.
    this.eventBus.publish(this.channel, msg).catch((err) => {
      console.warn(
        `[CacheService] Invalidation publish failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    });
  }
}
