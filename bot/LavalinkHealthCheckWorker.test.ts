import { describe, expect, it, vi } from "vitest";
import { LavalinkHealthCheckWorker, type HealthCheckMusicRuntime } from "./LavalinkHealthCheckWorker";
import type { MusicResult } from "./music/types";

function makeRuntime(results: MusicResult<unknown>[]): HealthCheckMusicRuntime {
  let call = 0;
  return {
    engine: {
      async loadTracks() {
        const result = results[Math.min(call, results.length - 1)]!;
        call += 1;
        return result as MusicResult<never>;
      },
    },
    metrics: {
      nodeLoads: () => [{ nodeId: "node-a", available: true, administrativeState: "enabled" as const }],
    },
  };
}

function makeDb(initialEnabled = true) {
  let enabled = initialEnabled;
  let reason: string | null = null;
  const calls: Array<{ enabled: boolean; reason: string }> = [];
  return {
    calls,
    async isMusicEnabled() {
      return { enabled, reason };
    },
    async setMusicEnabled(next: boolean, nextReason: string) {
      enabled = next;
      reason = nextReason;
      calls.push({ enabled: next, reason: nextReason });
    },
  };
}

function makeClient(sentDms: string[]) {
  return {
    users: {
      async fetch(id: string) {
        return {
          async send(message: string) {
            sentDms.push(`${id}:${message}`);
          },
        };
      },
    },
  } as any;
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const failure: MusicResult<unknown> = {
  ok: false,
  error: { code: "MUSIC_SOURCE_UNAVAILABLE" } as any,
};
const success: MusicResult<unknown> = { ok: true, value: {} };

describe("LavalinkHealthCheckWorker", () => {
  it("does not disable after a single failed tick", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const runtime = makeRuntime([failure]);
    const db = makeDb();
    const sentDms: string[] = [];
    const worker = new LavalinkHealthCheckWorker(makeClient(sentDms), runtime, db, logger());

    await worker.runOnce();

    expect(db.calls).toHaveLength(0);
    expect(sentDms).toHaveLength(0);
  });

  it("disables music after two consecutive fleet-wide failures and DMs admins", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const runtime = makeRuntime([failure, failure]);
    const db = makeDb();
    const sentDms: string[] = [];
    const worker = new LavalinkHealthCheckWorker(makeClient(sentDms), runtime, db, logger());

    await worker.runOnce();
    await worker.runOnce();

    expect(db.calls).toEqual([{ enabled: false, reason: "lavalink-health-check" }]);
    expect(sentDms).toHaveLength(1);
    expect(sentDms[0]).toContain("disabled fleet-wide");
  });

  it("resets the failure count after a success in between", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const runtime = makeRuntime([failure, success, failure, failure]);
    const db = makeDb();
    const sentDms: string[] = [];
    const worker = new LavalinkHealthCheckWorker(makeClient(sentDms), runtime, db, logger());

    await worker.runOnce(); // fail (1/2)
    await worker.runOnce(); // success -> resets to 0
    await worker.runOnce(); // fail (1/2)
    expect(db.calls).toHaveLength(0);

    await worker.runOnce(); // fail (2/2) -> disables
    expect(db.calls).toEqual([{ enabled: false, reason: "lavalink-health-check" }]);
  });

  it("sends a one-time recovery DM after disabling, without re-enabling the flag", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const runtime = makeRuntime([failure, failure, success, success]);
    const db = makeDb();
    const sentDms: string[] = [];
    const worker = new LavalinkHealthCheckWorker(makeClient(sentDms), runtime, db, logger());

    await worker.runOnce(); // fail (1/2)
    await worker.runOnce(); // fail (2/2) -> disables, DM #1
    await worker.runOnce(); // success while disabled -> recovery DM #2
    await worker.runOnce(); // success again -> no repeat DM

    expect(await db.isMusicEnabled()).toEqual({ enabled: false, reason: "lavalink-health-check" });
    expect(sentDms).toHaveLength(2);
    expect(sentDms[1]).toContain("looks healthy again");
  });

  it("treats zero available nodes as healthy (not this feature's concern)", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const runtime: HealthCheckMusicRuntime = {
      engine: { async loadTracks() { throw new Error("should not be called"); } },
      metrics: { nodeLoads: () => [] },
    };
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce();
    await worker.runOnce();

    expect(db.calls).toHaveLength(0);
  });

  it("only disables when every available node fails, not just one of several", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    let calls = 0;
    const runtime: HealthCheckMusicRuntime = {
      engine: {
        async loadTracks(request) {
          calls += 1;
          return request.nodeId === "node-bad" ? failure as MusicResult<never> : success as MusicResult<never>;
        },
      },
      metrics: {
        nodeLoads: () => [
          { nodeId: "node-bad", available: true, administrativeState: "enabled" as const },
          { nodeId: "node-good", available: true, administrativeState: "enabled" as const },
        ],
      },
    };
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce();
    await worker.runOnce();

    expect(db.calls).toHaveLength(0);
    expect(calls).toBeGreaterThan(0);
  });

  it("does not count MUSIC_RELAY_OFFLINE as an extraction failure", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const relayOffline: MusicResult<unknown> = {
      ok: false,
      error: { code: "MUSIC_RELAY_OFFLINE" } as any,
    };
    const runtime = makeRuntime([relayOffline, relayOffline]);
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce();
    await worker.runOnce();

    expect(db.calls).toHaveLength(0);
  });

  it("does not count MUSIC_NODE_CAPACITY as an extraction failure, but a genuine extraction error still counts", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const nodeCapacity: MusicResult<unknown> = {
      ok: false,
      error: { code: "MUSIC_NODE_CAPACITY" } as any,
    };
    const runtime = makeRuntime([nodeCapacity, nodeCapacity, failure, failure]);
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce(); // MUSIC_NODE_CAPACITY -> skipped, treated as healthy
    await worker.runOnce(); // MUSIC_NODE_CAPACITY -> skipped, treated as healthy
    expect(db.calls).toHaveLength(0);

    await worker.runOnce(); // genuine failure (1/2)
    await worker.runOnce(); // genuine failure (2/2) -> disables
    expect(db.calls).toEqual([{ enabled: false, reason: "lavalink-health-check" }]);
  });

  it("takes 2 fresh consecutive failures to re-disable after a manual re-enable, not 1", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    const runtime = makeRuntime([failure, failure, failure, failure]);
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce(); // fail (1/2)
    await worker.runOnce(); // fail (2/2) -> disables
    expect(db.calls).toHaveLength(1);

    // A bot admin manually re-enables from the dashboard, bypassing the
    // worker entirely — this must not carry over any stale failure count.
    await db.setMusicEnabled(true, "manual");
    expect(db.calls).toHaveLength(2);

    await worker.runOnce(); // one failed tick right after re-enable
    expect(db.calls).toHaveLength(2); // must NOT re-disable on a single failed tick

    await worker.runOnce(); // second consecutive failure since re-enable -> re-disables
    expect(db.calls).toHaveLength(3);
    expect(db.calls[2]).toEqual({ enabled: false, reason: "lavalink-health-check" });
  });

  it("does not re-disable on a single failed tick after a long outage plus manual re-enable", async () => {
    process.env.BOT_ADMIN_IDS = "admin-1";
    // 2 failures to disable, then 3 more failures while still disabled (simulating
    // an outage that continues for many more 5-minute ticks after the auto-disable),
    // then a manual re-enable, then 1 failure (must not re-disable), then a 2nd
    // fresh consecutive failure (must re-disable).
    const runtime = makeRuntime([failure, failure, failure, failure, failure, failure, failure]);
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce(); // fail (1/2)
    await worker.runOnce(); // fail (2/2) -> disables
    expect(db.calls).toHaveLength(1);

    // Outage continues for 3 more ticks while music is already disabled. None
    // of these should cause another setMusicEnabled call, and — this is the
    // crux of the bug — they must not leave consecutiveFailures accumulated
    // past what matters once a human re-enables the flag.
    await worker.runOnce();
    await worker.runOnce();
    await worker.runOnce();
    expect(db.calls).toHaveLength(1); // still just the one disable call

    // A bot admin manually re-enables from the dashboard, bypassing the
    // worker entirely, well after the outage has been ongoing.
    await db.setMusicEnabled(true, "manual");
    expect(db.calls).toHaveLength(2);

    await worker.runOnce(); // one failed tick right after re-enable
    expect(db.calls).toHaveLength(2); // must NOT re-disable on a single failed tick

    await worker.runOnce(); // second consecutive failure since re-enable -> re-disables
    expect(db.calls).toHaveLength(3);
    expect(db.calls[2]).toEqual({ enabled: false, reason: "lavalink-health-check" });
  });
});
