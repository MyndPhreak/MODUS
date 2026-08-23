/**
 * Periodic probe that resolves a known-stable YouTube video through every
 * currently-available Lavalink node, using the same LavalinkAdapter.loadTracks
 * path `/play` already uses. Two consecutive fleet-wide failures (every
 * available node failing) auto-disable music playback via
 * DatabaseService.setMusicEnabled; a bot admin re-enables it from
 * /dashboard/admin/music-system. Never auto re-enables — on the first
 * successful probe while still disabled, it DMs the bot admins once and
 * leaves the flag untouched.
 *
 * See docs/superpowers/specs/2026-08-22-lavalink-health-check-design.md.
 */
import type { Client } from "discord.js";
import type { LavalinkLoadRequest, LavalinkLoadResult } from "./music/LavalinkAdapter";
import type { MusicResult } from "./music/types";
import type { MusicNodeLoad } from "./music/MusicMetrics";
import type { DatabaseService } from "./DatabaseService";
import type { Logger } from "./Logger";

const TICK_INTERVAL_MS = 5 * 60 * 1000;
const CONSECUTIVE_FAILURES_TO_DISABLE = 2;
const DISABLE_REASON = "lavalink-health-check";

/**
 * "Me at the zoo" — the first video ever uploaded to YouTube. Chosen as the
 * probe target for stability: no age gate, no region lock, no copyright
 * claims, owned by YouTube's co-founder, and YouTube has previously
 * re-uploaded it rather than let it disappear.
 */
const PROBE_VIDEO_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const PROBE_GUILD_ID = "lavalink-health-check";

export interface HealthCheckEngine {
  loadTracks(request: LavalinkLoadRequest): Promise<MusicResult<LavalinkLoadResult>>;
}

export interface HealthCheckMetricsSource {
  nodeLoads(): readonly MusicNodeLoad[];
}

/**
 * `loadTracks` error codes that mean node *selection* failed before any
 * YouTube request was attempted (see `NodeRegistry.selectNode`) — not a
 * genuine extraction verdict. A node returning one of these must not count
 * toward "this node failed to extract".
 */
const NODE_UNAVAILABLE_ERROR_CODES = new Set(["MUSIC_RELAY_OFFLINE", "MUSIC_NODE_CAPACITY"]);

export interface HealthCheckMusicRuntime {
  engine: HealthCheckEngine;
  metrics: HealthCheckMetricsSource;
}

export class LavalinkHealthCheckWorker {
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private recoveryDmSent = false;

  constructor(
    private client: Pick<Client, "users">,
    private musicRuntime: HealthCheckMusicRuntime,
    private db: Pick<DatabaseService, "isMusicEnabled" | "setMusicEnabled">,
    private logger: Pick<Logger, "info" | "warn" | "error">,
  ) {}

  start(): void {
    if (this.timer) return;
    this.runOnce().catch((err) => {
      this.logger.error("Initial Lavalink health check failed", undefined, err, "music");
    });
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        this.logger.error("Lavalink health check failed", undefined, err, "music");
      });
    }, TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One full tick: probe, update the failure count, disable/DM as needed. */
  async runOnce(): Promise<void> {
    const healthy = await this.probeOnce();

    if (healthy) {
      this.consecutiveFailures = 0;
      const { enabled } = await this.db.isMusicEnabled();
      if (!enabled && !this.recoveryDmSent) {
        this.recoveryDmSent = true;
        await this.notifyAdmins(
          "🎵 Lavalink health check: YouTube playback looks healthy again. " +
            "Music is still disabled — re-enable it from /dashboard/admin/music-system when you're ready.",
        );
      }
      return;
    }

    this.recoveryDmSent = false;
    this.consecutiveFailures += 1;
    this.logger.warn(
      `Lavalink health check failed (${this.consecutiveFailures}/${CONSECUTIVE_FAILURES_TO_DISABLE} consecutive)`,
      undefined,
      "music",
    );

    if (this.consecutiveFailures < CONSECUTIVE_FAILURES_TO_DISABLE) return;

    const { enabled } = await this.db.isMusicEnabled();
    if (!enabled) return; // already disabled — don't re-disable or re-DM every tick

    await this.db.setMusicEnabled(false, DISABLE_REASON);
    this.consecutiveFailures = 0;
    await this.notifyAdmins(
      "🚨 Lavalink health check: every available node failed to resolve a known-good " +
        "YouTube video twice in a row. Music has been disabled fleet-wide. Check the " +
        "Lavalink logs, then re-enable from /dashboard/admin/music-system once it's fixed.",
    );
  }

  /**
   * Fleet-wide result: true unless every genuinely-probed node failed
   * extraction. Nodes that never produced a genuine extraction verdict
   * (because `loadTracks` failed on node selection instead — see
   * `NODE_UNAVAILABLE_ERROR_CODES`) are skipped rather than counted as
   * failures; if every node in the tick's list is skipped, the tick is
   * healthy, same as having zero available nodes to begin with.
   */
  private async probeOnce(): Promise<boolean> {
    const nodes = this.musicRuntime.metrics
      .nodeLoads()
      .filter((node) => node.available && node.administrativeState === "enabled");

    if (nodes.length === 0) {
      // No available node at all is a pre-existing MUSIC_RELAY_OFFLINE
      // condition, not this feature's concern — don't also trip the
      // YouTube-extraction flag for it.
      return true;
    }

    let sawGenuineFailure = false;
    for (const node of nodes) {
      const result = await this.musicRuntime.engine.loadTracks({
        guildId: PROBE_GUILD_ID,
        input: PROBE_VIDEO_URL,
        requestedBy: "lavalink-health-check",
        requestType: "url",
        source: "youtube",
        nodeId: node.nodeId,
      });
      if (result.ok) return true;
      if (NODE_UNAVAILABLE_ERROR_CODES.has(result.error.code)) continue; // no genuine verdict — skip
      sawGenuineFailure = true;
    }
    // Every node was skipped (node selection failed, not extraction) — treat
    // as healthy, same as the zero-available-nodes case above.
    return !sawGenuineFailure;
  }

  private async notifyAdmins(message: string): Promise<void> {
    const adminIds = (process.env.BOT_ADMIN_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    for (const id of adminIds) {
      try {
        const user = await this.client.users.fetch(id);
        await user.send(message);
      } catch (err) {
        this.logger.warn(
          `Lavalink health check: failed to DM admin ${id}: ${
            err instanceof Error ? err.message : err
          }`,
          undefined,
          "music",
        );
      }
    }
  }
}
