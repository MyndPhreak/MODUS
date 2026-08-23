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
      snapshot: () => ({
        nodes: [{ nodeId: "node-a", available: true, administrativeState: "enabled" as const }],
      }),
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
      metrics: { snapshot: () => ({ nodes: [] }) },
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
        snapshot: () => ({
          nodes: [
            { nodeId: "node-bad", available: true, administrativeState: "enabled" as const },
            { nodeId: "node-good", available: true, administrativeState: "enabled" as const },
          ],
        }),
      },
    };
    const db = makeDb();
    const worker = new LavalinkHealthCheckWorker(makeClient([]), runtime, db, logger());

    await worker.runOnce();
    await worker.runOnce();

    expect(db.calls).toHaveLength(0);
    expect(calls).toBeGreaterThan(0);
  });
});
