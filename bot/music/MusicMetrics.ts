import { CHANNEL_MUSIC_STATE } from "../EventBus";
import type { MusicErrorCode } from "./errors";
import type { MusicStateEvent } from "./MusicRecovery";
import type { NodeSnapshot, NodeAdministrativeState } from "./NodeRegistry";
import type { MusicPlayerStatus } from "./types";

/**
 * Aggregate music subsystem health.
 *
 * `unavailable` means no enabled Lavalink node can accept playback; it is a
 * subsystem verdict, never the bot's liveness verdict — see botHealthResponse.
 */
export type MusicHealth = "healthy" | "degraded" | "unavailable";

/**
 * The label set every music counter is keyed by. Cardinality is bounded on
 * purpose: `operation` is the *class* of operation rather than the raw
 * operation ID (which is a per-command UUID), so a busy guild produces one
 * series per outcome instead of one per command.
 */
export interface MusicMetricKey {
  guildId: string;
  shardId: number;
  nodeId: string | null;
  queueRevision: number;
  operation: string;
  source: string;
  errorCode: MusicErrorCode | null;
}

export interface MusicCounter {
  key: MusicMetricKey;
  count: number;
}

export interface MusicLatencySummary {
  count: number;
  totalMs: number;
  maxMs: number;
  averageMs: number;
}

export interface MusicNodeLoad {
  nodeId: string;
  available: boolean;
  administrativeState: NodeAdministrativeState;
  activePlayers: number;
  maxPlayers: number;
  playerUtilization: number;
  cpuLoad: number;
  frameLoss: number;
  lavalinkPenalty: number;
}

export interface MusicMetricsSnapshot {
  health: MusicHealth;
  shardId: number;
  activePlayers: number;
  playersByStatus: Record<MusicPlayerStatus, number>;
  counters: {
    /** Every observed operation, command and playback alike. */
    commands: MusicCounter[];
    /** Operations that returned a stable error code. */
    failures: MusicCounter[];
    /** Optimistic-concurrency losses (`MUSIC_CONFLICT`). */
    queueConflicts: MusicCounter[];
    /** Track resolution that produced no usable candidate. */
    resolutionFailures: MusicCounter[];
    /** Recovery operations, each of which fences the guild lease. */
    recoveryAttempts: MusicCounter[];
    /** Recoveries that lost the fence to a newer owner or revision. */
    leaseFencings: MusicCounter[];
  };
  /** Command acknowledgement → the node reporting audio started. */
  commandToAudioLatencyMs: MusicLatencySummary;
  /** Audio loss → audio playing again on any node. */
  recoveryGapMs: MusicLatencySummary;
  /**
   * Not instrumented. Resolution *failures* are observable through the stable
   * error codes above, but resolution duration is only known inside
   * `LavalinkAdapter.loadTracks`, which publishes nothing. Populating this
   * requires emitting a resolution timing signal from that adapter.
   */
  resolutionLatencyMs: MusicLatencySummary;
  nodes: MusicNodeLoad[];
}

/** The subset of `EventBus` this aggregator needs. */
export interface MusicMetricsEventSource {
  subscribe(
    channel: string,
    handler: (event: MusicStateEvent) => void,
  ): Promise<() => Promise<void>>;
}

export interface MusicMetricsOptions {
  shardId: number;
  /** Live Lavalink node health, read on demand rather than polled. */
  nodes: () => readonly NodeSnapshot[];
  now?: () => number;
  /** How long a failure keeps the subsystem `degraded`. */
  failureWindowMs?: number;
}

const DEFAULT_FAILURE_WINDOW_MS = 60_000;

const RESOLUTION_FAILURE_CODES: readonly MusicErrorCode[] = [
  "MUSIC_NO_MATCH",
  "MUSIC_SOURCE_UNAVAILABLE",
];

const PLAYER_STATUSES: readonly MusicPlayerStatus[] = [
  "idle",
  "connecting",
  "playing",
  "paused",
  "unavailable",
];

const AUDIBLE_STATUSES: readonly MusicPlayerStatus[] = ["playing", "paused"];

interface GuildObservation {
  status: MusicPlayerStatus | null;
  /** When the last non-playback command for this guild was acknowledged. */
  commandStartedAt: number | null;
  /** When this guild last lost audio, if it has not regained it yet. */
  audioLostAt: number | null;
}

class LatencySeries {
  private count = 0;
  private totalMs = 0;
  private maxMs = 0;

  observe(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    this.count += 1;
    this.totalMs += milliseconds;
    if (milliseconds > this.maxMs) this.maxMs = milliseconds;
  }

  summary(): MusicLatencySummary {
    return {
      count: this.count,
      totalMs: this.totalMs,
      maxMs: this.maxMs,
      averageMs: this.count === 0 ? 0 : this.totalMs / this.count,
    };
  }
}

/**
 * Aggregates the music control plane's observable signals into structured
 * counters and a health rollup.
 *
 * Everything here is derived from signals the control plane already emits:
 * the durable `MusicStateEvent` stream on `CHANNEL_MUSIC_STATE` (published on
 * every command result, playback event, and recovery outcome) plus the live
 * `NodeRegistry` snapshots used for placement. Nothing in this class reaches
 * into the dispatch path, so metrics can never change a playback outcome.
 */
export class MusicMetrics {
  private readonly shardId: number;
  private readonly nodes: () => readonly NodeSnapshot[];
  private readonly now: () => number;
  private readonly failureWindowMs: number;

  private readonly counters = new Map<string, MusicCounter>();
  private readonly failures = new Map<string, MusicCounter>();
  private readonly queueConflicts = new Map<string, MusicCounter>();
  private readonly resolutionFailures = new Map<string, MusicCounter>();
  private readonly recoveryAttempts = new Map<string, MusicCounter>();
  private readonly leaseFencings = new Map<string, MusicCounter>();
  private readonly guilds = new Map<string, GuildObservation>();
  private readonly commandToAudio = new LatencySeries();
  private readonly recoveryGap = new LatencySeries();
  private lastFailureAt: number | null = null;

  constructor(options: MusicMetricsOptions) {
    if (!Number.isSafeInteger(options.shardId) || options.shardId < 0) {
      throw new Error("Music metrics shardId must be a non-negative integer.");
    }

    this.shardId = options.shardId;
    this.nodes = options.nodes;
    this.now = options.now ?? Date.now;
    this.failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
  }

  /**
   * Starts aggregating the cross-shard music state stream. Returns the
   * unsubscribe handle; without Redis there is no stream to subscribe to and
   * callers simply never call this.
   */
  async observe(eventSource: MusicMetricsEventSource): Promise<() => Promise<void>> {
    return eventSource.subscribe(CHANNEL_MUSIC_STATE, (event) => {
      this.recordStateEvent(event);
    });
  }

  /**
   * Folds one durable state event into the rollup. Malformed payloads are
   * dropped: this stream crosses a Redis boundary, and one bad publisher must
   * not corrupt the health verdict.
   */
  recordStateEvent(event: MusicStateEvent): void {
    if (!isStateEvent(event)) return;

    const at = this.now();
    const operation = classifyOperation(event.operationId);
    const errorCode = event.errorCode ?? null;
    const key: MusicMetricKey = {
      guildId: event.guildId,
      shardId: this.shardId,
      nodeId: event.nodeId ?? null,
      queueRevision: event.queueRevision,
      operation,
      // Not instrumented: `MusicStateEvent` carries no track source today.
      // Publishers that add one are picked up here without further changes.
      source: readSource(event),
      errorCode,
    };

    increment(this.counters, key);
    if (errorCode) {
      increment(this.failures, key);
      this.lastFailureAt = at;
      if (errorCode === "MUSIC_CONFLICT") increment(this.queueConflicts, key);
      if (RESOLUTION_FAILURE_CODES.includes(errorCode)) {
        increment(this.resolutionFailures, key);
      }
    }

    if (operation === "recovery") {
      // Every recovery fences the guild lease before it touches a node, so a
      // recovery is the observable unit of fencing. A conflict on that path is
      // a lost fence: a newer owner or revision won.
      increment(this.recoveryAttempts, key);
      if (errorCode === "MUSIC_CONFLICT") increment(this.leaseFencings, key);
    }

    this.trackGuildTransition(event, operation, at);
  }

  /** Aggregate music subsystem verdict. */
  health(): MusicHealth {
    const enabled = this.nodes().filter((node) => node.administrativeState === "enabled");
    if (enabled.length === 0) return "unavailable";

    const available = enabled.filter((node) => node.available);
    if (available.length === 0) return "unavailable";
    if (available.length < enabled.length) return "degraded";
    if (available.some((node) => node.frameLoss > 0 || node.activePlayers >= node.maxPlayers)) {
      return "degraded";
    }
    if (
      this.lastFailureAt !== null
      && this.now() - this.lastFailureAt <= this.failureWindowMs
    ) {
      return "degraded";
    }

    return "healthy";
  }

  snapshot(): MusicMetricsSnapshot {
    const playersByStatus = emptyStatusCounts();
    for (const observation of this.guilds.values()) {
      if (observation.status) playersByStatus[observation.status] += 1;
    }

    return {
      health: this.health(),
      shardId: this.shardId,
      activePlayers: AUDIBLE_STATUSES.reduce((total, status) => total + playersByStatus[status], 0),
      playersByStatus,
      counters: {
        commands: series(this.counters),
        failures: series(this.failures),
        queueConflicts: series(this.queueConflicts),
        resolutionFailures: series(this.resolutionFailures),
        recoveryAttempts: series(this.recoveryAttempts),
        leaseFencings: series(this.leaseFencings),
      },
      commandToAudioLatencyMs: this.commandToAudio.summary(),
      recoveryGapMs: this.recoveryGap.summary(),
      resolutionLatencyMs: { count: 0, totalMs: 0, maxMs: 0, averageMs: 0 },
      nodes: this.nodes().map(toNodeLoad),
    };
  }

  /** One-line rollup for the periodic status sweep. */
  statusLine(): string {
    const snapshot = this.snapshot();
    const nodes = snapshot.nodes.filter((node) => node.available).length;
    const failures = snapshot.counters.failures.reduce((total, entry) => total + entry.count, 0);
    return `music=${snapshot.health} shard=${snapshot.shardId} nodes=${nodes}/${snapshot.nodes.length}`
      + ` players=${snapshot.activePlayers} failures=${failures}`
      + ` conflicts=${total(snapshot.counters.queueConflicts)}`
      + ` recoveries=${total(snapshot.counters.recoveryAttempts)}`
      + ` fenced=${total(snapshot.counters.leaseFencings)}`;
  }

  /**
   * Command-to-audio latency and recovery gaps are both derived from a guild's
   * status transitions, so they are folded in one pass.
   */
  private trackGuildTransition(
    event: MusicStateEvent,
    operation: string,
    at: number,
  ): void {
    const observation = this.guilds.get(event.guildId)
      ?? { status: null, commandStartedAt: null, audioLostAt: null };
    const previous = observation.status;
    const status = isPlayerStatus(event.status) ? event.status : previous;

    if (operation === "command") {
      observation.commandStartedAt = at;
    } else if (event.operationId === "playback:track.start") {
      if (observation.commandStartedAt !== null) {
        this.commandToAudio.observe(at - observation.commandStartedAt);
        observation.commandStartedAt = null;
      }
    }

    const audible = status !== null && AUDIBLE_STATUSES.includes(status);
    const wasAudible = previous !== null && AUDIBLE_STATUSES.includes(previous);

    if (wasAudible && status === "unavailable") {
      observation.audioLostAt = at;
    } else if (audible && observation.audioLostAt !== null) {
      this.recoveryGap.observe(at - observation.audioLostAt);
      observation.audioLostAt = null;
    }

    observation.status = status;
    this.guilds.set(event.guildId, observation);
  }
}

/**
 * The bot's health probe. Music is one subsystem among many — recording,
 * tickets, reminders and the dashboard API all keep working when Lavalink is
 * gone — so an unavailable control plane is reported in the body and never
 * turns the probe itself into a failure.
 */
export function botHealthResponse(
  shardId: number | string,
  musicHealth: MusicHealth | null,
): { statusCode: number; body: string } {
  return {
    statusCode: 200,
    body: `OK (Shard ${shardId}) music=${musicHealth ?? "unavailable"}`,
  };
}

function classifyOperation(operationId: string): string {
  if (operationId.startsWith("playback:")) return operationId;
  if (operationId.startsWith("recover:")) return "recovery";
  if (operationId.startsWith("advance:")) return "advance";
  return "command";
}

/**
 * Track source is not on `MusicStateEvent` yet; reading it defensively keeps
 * the key shape stable for whichever publisher adds it first.
 */
function readSource(event: MusicStateEvent): string {
  const source = (event as { source?: unknown }).source;
  return typeof source === "string" && source.trim().length > 0 ? source : "unknown";
}

function isStateEvent(event: MusicStateEvent): boolean {
  if (!event || typeof event !== "object") return false;
  if (typeof event.guildId !== "string" || event.guildId.trim().length === 0) return false;
  if (typeof event.operationId !== "string" || event.operationId.trim().length === 0) return false;
  if (!Number.isFinite(event.queueRevision)) return false;
  if (event.nodeId !== null && event.nodeId !== undefined && typeof event.nodeId !== "string") {
    return false;
  }
  return true;
}

function isPlayerStatus(status: unknown): status is MusicPlayerStatus {
  return typeof status === "string" && (PLAYER_STATUSES as readonly string[]).includes(status);
}

function keyOf(key: MusicMetricKey): string {
  return [
    key.guildId,
    key.shardId,
    key.nodeId ?? "-",
    key.queueRevision,
    key.operation,
    key.source,
    key.errorCode ?? "-",
  ].join("|");
}

function increment(series: Map<string, MusicCounter>, key: MusicMetricKey): void {
  const id = keyOf(key);
  const existing = series.get(id);
  if (existing) {
    existing.count += 1;
    return;
  }
  series.set(id, { key: { ...key }, count: 1 });
}

function series(counters: Map<string, MusicCounter>): MusicCounter[] {
  return [...counters.values()].map((entry) => ({ key: { ...entry.key }, count: entry.count }));
}

function total(counters: MusicCounter[]): number {
  return counters.reduce((sum, entry) => sum + entry.count, 0);
}

function emptyStatusCounts(): Record<MusicPlayerStatus, number> {
  return { idle: 0, connecting: 0, playing: 0, paused: 0, unavailable: 0 };
}

function toNodeLoad(node: NodeSnapshot): MusicNodeLoad {
  return {
    nodeId: node.id,
    available: node.available,
    administrativeState: node.administrativeState,
    activePlayers: node.activePlayers,
    maxPlayers: node.maxPlayers,
    playerUtilization: node.maxPlayers > 0 ? node.activePlayers / node.maxPlayers : 0,
    cpuLoad: node.cpuLoad,
    frameLoss: node.frameLoss,
    lavalinkPenalty: node.lavalinkPenalty,
  };
}
