/**
 * Lease-based leader election over a single Redis key.
 *
 * One shard "wins" a named lease by doing `SET key owner NX PX ttl`. The
 * winner refreshes the lease periodically; if it dies, the TTL expires
 * and any other process can claim it on the next attempt.
 *
 * Release is guarded by a Lua CAS so a slow refresher can't delete a
 * lease that another owner already acquired.
 *
 * Typical use:
 *   const election = new LeaderElection({
 *     redis: clients.primary,
 *     key: "leader:recording-retention",
 *     ownerId: `${process.pid}:shard-${shardId}`,
 *     onAcquired: () => worker.start(),
 *     onLost:     () => worker.stop(),
 *   });
 *   election.start();
 *
 * When no Redis client is available, `start()` is a no-op and `isLeader`
 * stays `false` — callers that need a single-process fallback must check
 * their own flag (e.g. "run on shard 0") and decide what to do.
 */
import type Redis from "ioredis";

export interface LeaderElectionOptions {
  redis: Redis;
  /** Redis key identifying the lease. Globally unique per job. */
  key: string;
  /** Unique owner ID — typically `${pid}:shard-${shardId}` or a UUID. */
  ownerId: string;
  /** Lease TTL in ms. Default 15s. */
  ttlMs?: number;
  /** Refresh interval in ms. Default ttlMs / 3. */
  refreshMs?: number;
  /** Fired once when this process becomes leader. */
  onAcquired?: () => void | Promise<void>;
  /** Fired if the lease is lost (refresh rejected by another owner). */
  onLost?: () => void | Promise<void>;
}

/** DEL the key only if we still own it. Lua guarantees atomicity. */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

/** PEXPIRE only if we still own the key (CAS refresh). Returns 1 on success. */
const REFRESH_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

export class LeaderElection {
  private ttlMs: number;
  private refreshMs: number;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private _isLeader = false;

  constructor(private opts: LeaderElectionOptions) {
    this.ttlMs = opts.ttlMs ?? 15_000;
    this.refreshMs = opts.refreshMs ?? Math.max(1_000, Math.floor(this.ttlMs / 3));
  }

  get isLeader(): boolean {
    return this._isLeader;
  }

  /**
   * Begin competing for the lease. Safe to call repeatedly — additional
   * calls are ignored.
   */
  start(): void {
    if (this.timer || this.stopped) return;
    // Run the first attempt immediately so a fresh process can pick up the
    // lease without waiting a full refresh interval.
    this.tick().catch(() => {});
    this.timer = setInterval(() => this.tick().catch(() => {}), this.refreshMs);
    // Don't keep the event loop alive for this alone.
    this.timer.unref?.();
  }

  /** Release the lease (if we own it) and stop competing. Idempotent. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this._isLeader) {
      try {
        await this.opts.redis.eval(
          RELEASE_SCRIPT,
          1,
          this.opts.key,
          this.opts.ownerId,
        );
      } catch {
        // Best-effort — the TTL will expire the lease anyway.
      }
      this._isLeader = false;
    }
  }

  // ── internals ────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.stopped) return;
    if (this._isLeader) {
      await this.refresh();
      return;
    }
    await this.acquire();
  }

  private async acquire(): Promise<void> {
    try {
      const res = await this.opts.redis.set(
        this.opts.key,
        this.opts.ownerId,
        "PX",
        this.ttlMs,
        "NX",
      );
      if (res === "OK") {
        this._isLeader = true;
        try {
          await this.opts.onAcquired?.();
        } catch (err) {
          console.warn(
            `[LeaderElection:${this.opts.key}] onAcquired threw: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
    } catch (err) {
      // Redis blip — try again next tick.
      console.warn(
        `[LeaderElection:${this.opts.key}] acquire failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  private async refresh(): Promise<void> {
    try {
      const ok = (await this.opts.redis.eval(
        REFRESH_SCRIPT,
        1,
        this.opts.key,
        this.opts.ownerId,
        String(this.ttlMs),
      )) as number;

      if (ok !== 1) {
        // Another process claimed the lease while we were refreshing — a
        // long GC pause, network partition, or a fresh process beating us
        // after a crash. Drop leadership and start competing again.
        this._isLeader = false;
        try {
          await this.opts.onLost?.();
        } catch (err) {
          console.warn(
            `[LeaderElection:${this.opts.key}] onLost threw: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[LeaderElection:${this.opts.key}] refresh failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
