import { afterEach, describe, expect, it, vi } from "vitest";
import type { RedisClients } from "../RedisClient";
import {
  GuildPlaybackLease,
  GuildPlaybackLeaseOwnershipError,
} from "./GuildPlaybackLease";

interface StoredValue {
  value: string;
  expiresAt?: number;
}

interface StoredLease {
  ownerId: string;
  nodeId: string;
  queueRevision: number;
  fencingToken: number;
}

class FakeRedis {
  private readonly values = new Map<string, StoredValue>();
  private readonly counters = new Map<string, number>();
  private time = 1_000;

  advance(milliseconds: number): void {
    this.time += milliseconds;
  }

  async eval(
    script: string,
    numberOfKeys: number,
    ...input: Array<string | number>
  ): Promise<[number, string]> {
    const args = input.map(String);
    const keys = args.slice(0, numberOfKeys);
    const argv = args.slice(numberOfKeys);

    if (script.includes("modus:guild-playback:acquire")) {
      const [leaseKey, counterKey] = keys;
      const [ownerId, nodeId, queueRevision, ttlMs] = argv;
      const current = this.readLease(leaseKey!);
      if (current) {
        return [0, String(current.fencingToken)];
      }

      const fencingToken = this.increment(counterKey!);
      this.writeLease(leaseKey!, {
        ownerId: ownerId!,
        nodeId: nodeId!,
        queueRevision: Number(queueRevision),
        fencingToken,
      }, Number(ttlMs));
      return [1, String(fencingToken)];
    }

    if (script.includes("modus:guild-playback:renew")) {
      const [ownerId, fencingToken, nodeId, queueRevision, ttlMs] = argv;
      const current = this.readLease(keys[0]!);
      if (!current || current.ownerId !== ownerId || current.fencingToken !== Number(fencingToken)) {
        return [0, current ? String(current.fencingToken) : "0"];
      }

      this.writeLease(keys[0]!, {
        ownerId: ownerId!,
        nodeId: nodeId!,
        queueRevision: Number(queueRevision),
        fencingToken: Number(fencingToken),
      }, Number(ttlMs));
      return [1, fencingToken!];
    }

    if (script.includes("modus:guild-playback:release")) {
      const [ownerId, fencingToken] = argv;
      const current = this.readLease(keys[0]!);
      if (!current || current.ownerId !== ownerId || current.fencingToken !== Number(fencingToken)) {
        return [0, current ? String(current.fencingToken) : "0"];
      }

      this.values.delete(keys[0]!);
      return [1, fencingToken!];
    }

    if (script.includes("modus:guild-playback:fence-and-acquire")) {
      const [leaseKey, counterKey] = keys;
      const [ownerId, nodeId, queueRevision, ttlMs] = argv;
      const fencingToken = this.increment(counterKey!);
      this.writeLease(leaseKey!, {
        ownerId: ownerId!,
        nodeId: nodeId!,
        queueRevision: Number(queueRevision),
        fencingToken,
      }, Number(ttlMs));
      return [1, String(fencingToken)];
    }

    if (script.includes("modus:guild-playback:assert-owner")) {
      const [ownerId, fencingToken] = argv;
      const current = this.readLease(keys[0]!);
      if (!current || current.ownerId !== ownerId || current.fencingToken !== Number(fencingToken)) {
        return [0, current ? String(current.fencingToken) : "0"];
      }
      return [1, fencingToken!];
    }

    throw new Error("Unexpected lease script");
  }

  private increment(key: string): number {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  private readLease(key: string): StoredLease | null {
    const stored = this.values.get(key);
    if (!stored) return null;
    if (stored.expiresAt !== undefined && stored.expiresAt <= this.time) {
      this.values.delete(key);
      return null;
    }
    return JSON.parse(stored.value) as StoredLease;
  }

  private writeLease(key: string, lease: StoredLease, ttlMs: number): void {
    this.values.set(key, {
      value: JSON.stringify(lease),
      expiresAt: this.time + ttlMs,
    });
  }
}

const redisClients = (redis: FakeRedis): RedisClients => ({
  primary: redis,
  subscriber: redis,
}) as unknown as RedisClients;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GuildPlaybackLease", () => {
  it("allows only one owner to acquire a guild lease", async () => {
    const redis = new FakeRedis();
    const first = new GuildPlaybackLease({ redisClients: redisClients(redis), ownerId: "owner-a" });
    const second = new GuildPlaybackLease({ redisClients: redisClients(redis), ownerId: "owner-b" });

    const token = await first.acquire("guild-exclusive", "node-a", 4);

    expect(token).toBe(1);
    await expect(second.acquire("guild-exclusive", "node-b", 4))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
    await expect(first.assertOwner("guild-exclusive", token)).resolves.toBe(token);
  });

  it("renews a lease for the same owner without changing its fencing token", async () => {
    const redis = new FakeRedis();
    const lease = new GuildPlaybackLease({
      redisClients: redisClients(redis),
      ownerId: "renewing-owner",
      ttlMs: 1_000,
    });
    const token = await lease.acquire("guild-renew", "node-a", 6);

    redis.advance(900);
    await expect(lease.renew("guild-renew", token, "node-a", 7)).resolves.toBe(token);
    redis.advance(900);

    await expect(lease.assertOwner("guild-renew", token)).resolves.toBe(token);
  });

  it("requires a fencing token to renew and raises the token after release", async () => {
    const redis = new FakeRedis();
    const lease = new GuildPlaybackLease({
      redisClients: redisClients(redis),
      ownerId: "release-owner",
    });
    const firstToken = await lease.acquire("guild-release", "node-a", 2);

    await expect(lease.acquire("guild-release", "node-a", 3))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
    await expect(lease.release("guild-release", firstToken)).resolves.toBe(firstToken);
    await expect(lease.assertOwner("guild-release", firstToken))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);

    const nextToken = await lease.acquire("guild-release", "node-a", 3);
    expect(nextToken).toBeGreaterThan(firstToken);
  });

  it("lets another owner take over an expired lease with a higher fencing token", async () => {
    const redis = new FakeRedis();
    const first = new GuildPlaybackLease({
      redisClients: redisClients(redis),
      ownerId: "expired-owner",
      ttlMs: 1_000,
    });
    const second = new GuildPlaybackLease({
      redisClients: redisClients(redis),
      ownerId: "replacement-owner",
      ttlMs: 1_000,
    });
    const staleToken = await first.acquire("guild-expiry", "node-a", 8);

    redis.advance(1_001);
    const replacementToken = await second.acquire("guild-expiry", "node-b", 8);

    expect(replacementToken).toBeGreaterThan(staleToken);
    await expect(first.renew("guild-expiry", staleToken, "node-a", 8))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
  });

  it("explicitly fences an active owner and rejects every stale token mutation", async () => {
    const redis = new FakeRedis();
    const first = new GuildPlaybackLease({ redisClients: redisClients(redis), ownerId: "old-owner" });
    const replacement = new GuildPlaybackLease({ redisClients: redisClients(redis), ownerId: "new-owner" });
    const staleToken = await first.acquire("guild-fence", "node-a", 10);

    const replacementToken = await replacement.fenceAndAcquire("guild-fence", "node-b", 11);

    expect(replacementToken).toBeGreaterThan(staleToken);
    await expect(first.assertOwner("guild-fence", staleToken))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
    await expect(first.renew("guild-fence", staleToken, "node-a", 12))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
    await expect(first.release("guild-fence", staleToken))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
    await expect(replacement.assertOwner("guild-fence", replacementToken))
      .resolves.toBe(replacementToken);
  });

  it("uses a shared in-process backend for a single bot process", async () => {
    let now = 5_000;
    const first = new GuildPlaybackLease({
      redisClients: null,
      ownerId: "local-a",
      multiProcess: false,
      ttlMs: 1_000,
      now: () => now,
    });
    const second = new GuildPlaybackLease({
      redisClients: null,
      ownerId: "local-b",
      multiProcess: false,
      ttlMs: 1_000,
      now: () => now,
    });
    const staleToken = await first.acquire("guild-local-fallback", "node-a", 1);

    await expect(second.acquire("guild-local-fallback", "node-b", 1))
      .rejects.toBeInstanceOf(GuildPlaybackLeaseOwnershipError);
    now += 1_001;
    const replacementToken = await second.acquire("guild-local-fallback", "node-b", 2);

    expect(replacementToken).toBeGreaterThan(staleToken);
  });

  it("fails closed without Redis when multiple bot processes are configured", () => {
    expect(() => new GuildPlaybackLease({
      redisClients: null,
      ownerId: "unsafe-owner",
      multiProcess: true,
    })).toThrowError(/Redis is required/);
  });

  it("detects the repository's process-sharding environment without guessing from shard count alone", () => {
    vi.stubEnv("SHARDING_MANAGER", "true");
    vi.stubEnv("SHARDING_MANAGER_MODE", "process");
    vi.stubEnv("SHARD_COUNT", "2");

    expect(() => new GuildPlaybackLease({
      redisClients: null,
      ownerId: "process-sharded-owner",
    })).toThrowError(/Redis is required/);

    vi.stubEnv("SHARDING_MANAGER", "");
    expect(() => new GuildPlaybackLease({
      redisClients: null,
      ownerId: "single-process-multi-shard-owner",
    })).not.toThrow();
  });
});
