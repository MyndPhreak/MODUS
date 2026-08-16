import type { RecoverableMusicSession } from "@modus/db";
import { describe, expect, it } from "vitest";
import { recoverDormantSessions } from "./index";
import type { RecoverGuildInput } from "./MusicRecovery";
import { NodeRegistry, type LavalinkNodeConfig } from "./NodeRegistry";

const config = (id: string): LavalinkNodeConfig => ({
  id,
  url: `https://${id}.lavalink.internal:2333`,
  password: "secret",
  region: "us-east",
  capabilities: ["youtube"],
  maxPlayers: 100,
});

const session = (guildId: string, overrides: Partial<RecoverableMusicSession> = {}): RecoverableMusicSession => ({
  guildId,
  revision: 8,
  currentEntryId: "entry-1",
  assignedNodeId: "primary",
  checkpointPositionMs: 73_000,
  checkpointedAt: new Date("2026-08-15T12:01:13.000Z"),
  ...overrides,
});

function guild(voiceChannelId: string | null) {
  return { members: { me: { voice: { channelId: voiceChannelId } } } };
}

function setup(options: {
  sessions?: RecoverableMusicSession[];
  guilds?: Map<string, unknown>;
  available?: boolean;
  results?: Array<{ guildId: string; ok: boolean; errorCode?: string }>;
  listError?: Error;
} = {}) {
  const nodeRegistry = new NodeRegistry([config("primary")]);
  if (options.available !== false) nodeRegistry.update("primary", { available: true });

  const recoverCalls: RecoverGuildInput[][] = [];
  const logs: Array<{ level: string; message: string }> = [];

  const context = {
    client: { guilds: { cache: options.guilds ?? new Map([["guild-1", guild("voice-1")]]) } } as never,
    repository: {
      async listRecoverableSessions(): Promise<RecoverableMusicSession[]> {
        if (options.listError) throw options.listError;
        return options.sessions ?? [session("guild-1")];
      },
    },
    musicService: {
      async recoverOnStartup(inputs: readonly RecoverGuildInput[]) {
        recoverCalls.push([...inputs]);
        return (options.results ?? inputs.map(({ guildId }) => ({ guildId, ok: true }))) as never;
      },
    } as never,
    nodeRegistry,
    shardId: 2,
    logger: {
      info: (message: string) => logs.push({ level: "info", message }),
      warn: (message: string) => logs.push({ level: "warn", message }),
      error: (message: string) => logs.push({ level: "error", message }),
    },
    sleep: async () => undefined,
    nodeWaitTimeoutMs: 20,
  };

  return { context, logs, nodeRegistry, recoverCalls };
}

describe("recoverDormantSessions", () => {
  it("recovers only guilds this process owns and never reports the node as failed", async () => {
    const { context, nodeRegistry, recoverCalls } = setup({
      sessions: [session("guild-1"), session("guild-2")],
      guilds: new Map([["guild-1", guild("voice-1")]]),
    });

    await recoverDormantSessions(context as never);

    expect(recoverCalls).toEqual([[{
      guildId: "guild-1",
      failedNodeId: "primary",
      markNodeFailed: false,
      operationId: "recover:startup:8",
      voiceChannelId: "voice-1",
      shardId: 2,
    }]]);
    expect(nodeRegistry.snapshot("primary").available).toBe(true);
  });

  it("omits the voice channel when the bot is no longer connected", async () => {
    const { context, recoverCalls } = setup({
      guilds: new Map([["guild-1", guild(null)]]),
    });

    await recoverDormantSessions(context as never);

    expect(recoverCalls[0]![0]).toEqual({
      guildId: "guild-1",
      failedNodeId: "primary",
      markNodeFailed: false,
      operationId: "recover:startup:8",
    });
  });

  it("does nothing when no session is recoverable", async () => {
    const { context, logs, recoverCalls } = setup({ sessions: [] });

    await recoverDormantSessions(context as never);

    expect(recoverCalls).toEqual([]);
    expect(logs).toEqual([]);
  });

  it("keeps the queue and warns when no node becomes available", async () => {
    const { context, logs, recoverCalls } = setup({ available: false });

    await recoverDormantSessions(context as never);

    expect(recoverCalls).toEqual([]);
    expect(logs).toEqual([
      { level: "warn", message: expect.stringContaining("No Lavalink node became available") },
    ]);
  });

  it("logs every failed recovery with its guild and stable error code", async () => {
    const { context, logs } = setup({
      results: [{ guildId: "guild-1", ok: false, errorCode: "MUSIC_RELAY_OFFLINE" }],
    });

    await recoverDormantSessions(context as never);

    expect(logs).toContainEqual({
      level: "error",
      message: "Startup music recovery failed for guild guild-1: MUSIC_RELAY_OFFLINE",
    });
  });

  it("logs and continues when the recoverable session query fails", async () => {
    const { context, logs, recoverCalls } = setup({ listError: new Error("db down") });

    await recoverDormantSessions(context as never);

    expect(recoverCalls).toEqual([]);
    expect(logs).toEqual([
      { level: "error", message: "Failed to read recoverable music sessions" },
    ]);
  });
});
