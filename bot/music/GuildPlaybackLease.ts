import type { RedisClients } from "../RedisClient";

const DEFAULT_TTL_MS = 15_000;
const MIN_TTL_MS = 250;
const MAX_TTL_MS = 300_000;
const KEY_PREFIX = "modus:music:guild-playback";

const ACQUIRE_SCRIPT = `-- modus:guild-playback:acquire
local currentJson = redis.call("GET", KEYS[1])
if currentJson then
  local current = cjson.decode(currentJson)
  return { 0, tostring(current.fencingToken) }
end

local fencingToken = redis.call("INCR", KEYS[2])
local lease = {
  ownerId = ARGV[1],
  nodeId = ARGV[2],
  queueRevision = tonumber(ARGV[3]),
  fencingToken = fencingToken
}
redis.call("SET", KEYS[1], cjson.encode(lease), "PX", ARGV[4])
return { 1, tostring(fencingToken) }`;

const RENEW_SCRIPT = `-- modus:guild-playback:renew
local currentJson = redis.call("GET", KEYS[1])
if not currentJson then
  return { 0, "0" }
end

local current = cjson.decode(currentJson)
if current.ownerId ~= ARGV[1] or current.fencingToken ~= tonumber(ARGV[2]) then
  return { 0, tostring(current.fencingToken) }
end

current.nodeId = ARGV[3]
current.queueRevision = tonumber(ARGV[4])
redis.call("SET", KEYS[1], cjson.encode(current), "PX", ARGV[5])
return { 1, tostring(current.fencingToken) }`;

const RELEASE_SCRIPT = `-- modus:guild-playback:release
local currentJson = redis.call("GET", KEYS[1])
if not currentJson then
  return { 0, "0" }
end

local current = cjson.decode(currentJson)
if current.ownerId ~= ARGV[1] or current.fencingToken ~= tonumber(ARGV[2]) then
  return { 0, tostring(current.fencingToken) }
end

redis.call("DEL", KEYS[1])
return { 1, tostring(current.fencingToken) }`;

const FENCE_AND_ACQUIRE_SCRIPT = `-- modus:guild-playback:fence-and-acquire
local currentJson = redis.call("GET", KEYS[1])
local currentToken = 0
if currentJson then
  local current = cjson.decode(currentJson)
  currentToken = tonumber(current.fencingToken) or 0
end

local fencingToken = redis.call("INCR", KEYS[2])
if fencingToken <= currentToken then
  redis.call("SET", KEYS[2], currentToken)
  fencingToken = redis.call("INCR", KEYS[2])
end

local lease = {
  ownerId = ARGV[1],
  nodeId = ARGV[2],
  queueRevision = tonumber(ARGV[3]),
  fencingToken = fencingToken
}
redis.call("SET", KEYS[1], cjson.encode(lease), "PX", ARGV[4])
return { 1, tostring(fencingToken) }`;

const ASSERT_OWNER_SCRIPT = `-- modus:guild-playback:assert-owner
local currentJson = redis.call("GET", KEYS[1])
if not currentJson then
  return { 0, "0" }
end

local current = cjson.decode(currentJson)
if current.ownerId ~= ARGV[1] or current.fencingToken ~= tonumber(ARGV[2]) then
  return { 0, tostring(current.fencingToken) }
end

return { 1, tostring(current.fencingToken) }`;

interface InMemoryLeaseRecord {
  ownerId: string;
  nodeId: string;
  queueRevision: number;
  fencingToken: number;
  expiresAt: number;
}

const inMemoryLeases = new Map<string, InMemoryLeaseRecord>();
const inMemoryFencingTokens = new Map<string, number>();

export interface GuildPlaybackLeaseOptions {
  redisClients: RedisClients | null;
  ownerId: string;
  ttlMs?: number;
  /** Override the Discord sharding environment for custom process managers. */
  multiProcess?: boolean;
  /** Injectable monotonic-enough wall clock used only by the in-process backend. */
  now?: () => number;
}

export class GuildPlaybackLeaseOwnershipError extends Error {
  constructor(readonly guildId: string) {
    super(`Playback lease ownership was lost for guild ${guildId}.`);
    this.name = "GuildPlaybackLeaseOwnershipError";
  }
}

/**
 * Serializes Lavalink player ownership per guild. Call assertOwner immediately
 * before every player mutation and carry its returned fencing token through
 * the dispatch path so stale work cannot be mistaken for the current owner.
 */
export class GuildPlaybackLease {
  private readonly redis: RedisClients["primary"] | null;
  private readonly ownerId: string;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: GuildPlaybackLeaseOptions) {
    if (!options.ownerId.trim()) {
      throw new Error("Guild playback lease ownerId must not be empty.");
    }

    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (!Number.isInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
      throw new Error(`Guild playback lease TTL must be between ${MIN_TTL_MS} and ${MAX_TTL_MS} milliseconds.`);
    }

    const multiProcess = options.multiProcess ?? isProcessShardedDeployment(process.env);
    if (!options.redisClients && multiProcess) {
      throw new Error("Redis is required for guild playback leases when multiple bot processes are configured.");
    }

    this.redis = options.redisClients?.primary ?? null;
    this.ownerId = options.ownerId;
    this.ttlMs = ttlMs;
    this.now = options.now ?? Date.now;
  }

  async acquire(guildId: string, nodeId: string, queueRevision: number): Promise<number> {
    this.validateLeaseState(guildId, nodeId, queueRevision);
    if (!this.redis) return this.acquireInMemory(guildId, nodeId, queueRevision, false);

    const result = await this.redis.eval(
      ACQUIRE_SCRIPT,
      2,
      this.leaseKey(guildId),
      this.fencingKey(guildId),
      this.ownerId,
      nodeId,
      queueRevision,
      this.ttlMs,
    );
    return this.requireOwnership(guildId, result);
  }

  async renew(
    guildId: string,
    fencingToken: number,
    nodeId: string,
    queueRevision: number,
  ): Promise<number> {
    this.validateLeaseState(guildId, nodeId, queueRevision);
    this.validateFencingToken(fencingToken);
    if (!this.redis) return this.renewInMemory(guildId, fencingToken, nodeId, queueRevision);

    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      this.leaseKey(guildId),
      this.ownerId,
      fencingToken,
      nodeId,
      queueRevision,
      this.ttlMs,
    );
    return this.requireOwnership(guildId, result);
  }

  async release(guildId: string, fencingToken: number): Promise<number> {
    this.validateGuildId(guildId);
    this.validateFencingToken(fencingToken);
    if (!this.redis) return this.releaseInMemory(guildId, fencingToken);

    const result = await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      this.leaseKey(guildId),
      this.ownerId,
      fencingToken,
    );
    return this.requireOwnership(guildId, result);
  }

  async fenceAndAcquire(guildId: string, nodeId: string, queueRevision: number): Promise<number> {
    this.validateLeaseState(guildId, nodeId, queueRevision);
    if (!this.redis) return this.acquireInMemory(guildId, nodeId, queueRevision, true);

    const result = await this.redis.eval(
      FENCE_AND_ACQUIRE_SCRIPT,
      2,
      this.leaseKey(guildId),
      this.fencingKey(guildId),
      this.ownerId,
      nodeId,
      queueRevision,
      this.ttlMs,
    );
    return this.requireOwnership(guildId, result);
  }

  async assertOwner(guildId: string, fencingToken: number): Promise<number> {
    this.validateGuildId(guildId);
    this.validateFencingToken(fencingToken);
    if (!this.redis) return this.assertOwnerInMemory(guildId, fencingToken);

    const result = await this.redis.eval(
      ASSERT_OWNER_SCRIPT,
      1,
      this.leaseKey(guildId),
      this.ownerId,
      fencingToken,
    );
    return this.requireOwnership(guildId, result);
  }

  private acquireInMemory(
    guildId: string,
    nodeId: string,
    queueRevision: number,
    fence: boolean,
  ): number {
    const current = this.currentInMemoryLease(guildId);
    if (!fence && current) {
      throw new GuildPlaybackLeaseOwnershipError(guildId);
    }

    const fencingToken = fence || !current
      ? this.nextInMemoryFencingToken(guildId, current?.fencingToken ?? 0)
      : current.fencingToken;
    inMemoryLeases.set(guildId, {
      ownerId: this.ownerId,
      nodeId,
      queueRevision,
      fencingToken,
      expiresAt: this.now() + this.ttlMs,
    });
    return fencingToken;
  }

  private renewInMemory(
    guildId: string,
    fencingToken: number,
    nodeId: string,
    queueRevision: number,
  ): number {
    this.assertOwnerInMemory(guildId, fencingToken);
    inMemoryLeases.set(guildId, {
      ownerId: this.ownerId,
      nodeId,
      queueRevision,
      fencingToken,
      expiresAt: this.now() + this.ttlMs,
    });
    return fencingToken;
  }

  private releaseInMemory(guildId: string, fencingToken: number): number {
    this.assertOwnerInMemory(guildId, fencingToken);
    inMemoryLeases.delete(guildId);
    return fencingToken;
  }

  private assertOwnerInMemory(guildId: string, fencingToken: number): number {
    const current = this.currentInMemoryLease(guildId);
    if (!current || current.ownerId !== this.ownerId || current.fencingToken !== fencingToken) {
      throw new GuildPlaybackLeaseOwnershipError(guildId);
    }
    return fencingToken;
  }

  private currentInMemoryLease(guildId: string): InMemoryLeaseRecord | null {
    const current = inMemoryLeases.get(guildId);
    if (!current) return null;
    if (current.expiresAt <= this.now()) {
      inMemoryLeases.delete(guildId);
      return null;
    }
    return current;
  }

  private nextInMemoryFencingToken(guildId: string, floor: number): number {
    const next = Math.max(inMemoryFencingTokens.get(guildId) ?? 0, floor) + 1;
    inMemoryFencingTokens.set(guildId, next);
    return next;
  }

  private requireOwnership(guildId: string, value: unknown): number {
    if (!Array.isArray(value) || value.length < 2) {
      throw new Error("Redis returned an invalid guild playback lease result.");
    }

    const acquired = Number(value[0]);
    const fencingToken = Number(value[1]);
    if (acquired !== 1) throw new GuildPlaybackLeaseOwnershipError(guildId);
    if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
      throw new Error("Redis returned an invalid guild playback fencing token.");
    }
    return fencingToken;
  }

  private validateLeaseState(guildId: string, nodeId: string, queueRevision: number): void {
    this.validateGuildId(guildId);
    if (!nodeId.trim()) throw new Error("Guild playback lease nodeId must not be empty.");
    if (!Number.isSafeInteger(queueRevision) || queueRevision < 0) {
      throw new Error("Guild playback lease queueRevision must be a non-negative integer.");
    }
  }

  private validateGuildId(guildId: string): void {
    if (!guildId.trim()) throw new Error("Guild playback lease guildId must not be empty.");
  }

  private validateFencingToken(fencingToken: number): void {
    if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
      throw new Error("Guild playback fencing token must be a positive integer.");
    }
  }

  private leaseKey(guildId: string): string {
    return `${KEY_PREFIX}:lease:${guildId}`;
  }

  private fencingKey(guildId: string): string {
    return `${KEY_PREFIX}:fencing:${guildId}`;
  }
}

function isProcessShardedDeployment(env: NodeJS.ProcessEnv): boolean {
  if (env.SHARDING_MANAGER !== "true" || env.SHARDING_MANAGER_MODE !== "process") {
    return false;
  }

  const shardCount = Number(env.SHARD_COUNT);
  return Number.isInteger(shardCount) && shardCount > 1;
}
