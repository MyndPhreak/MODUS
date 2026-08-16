import { describe, expect, it } from "vitest";
import { MusicRepository } from "@modus/db";

interface FakeSession {
  id: string;
  revision: number;
  currentEntryId: string | null;
  checkpointPositionMs: number;
  checkpointedAt: Date | null;
  volume?: number;
  repeatMode?: "off" | "track" | "queue";
  filters?: Record<string, unknown>;
}

interface FakeOperation {
  guildId: string;
  operationId: string;
  resultingRevision: number;
}

class FakeCheckpointDatabase {
  constructor(
    public readonly session: FakeSession,
    private readonly updateAllowed: boolean,
  ) {}

  update(): unknown {
    return {
      set: (patch: Partial<FakeSession>) => ({
        where: () => ({
          returning: async () => {
            if (!this.updateAllowed) return [];
            Object.assign(this.session, patch);
            return [{ id: this.session.id }];
          },
        }),
      }),
    };
  }

  insert(): unknown {
    return {
      values: (values: Partial<FakeSession>) => ({
        onConflictDoUpdate: async ({ set }: { set: Partial<FakeSession> }) => {
          Object.assign(this.session, values, set);
        },
        onConflictDoNothing: () => ({
          returning: async () => [],
        }),
      }),
    };
  }
}

class FakeCheckpointOperationDatabase {
  readonly operations = new Map<string, FakeOperation>();

  constructor(public readonly session: Required<FakeSession>) {}

  async transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  select(selection?: unknown): unknown {
    return {
      from: () => ({
        where: () => selection
          ? {
              limit: async () => {
                const operationId = this.pendingOperationId;
                const operation = operationId ? this.operations.get(operationId) : undefined;
                return operation ? [{ resultingRevision: operation.resultingRevision }] : [];
              },
            }
          : { for: async () => [this.session] },
      }),
    };
  }

  private pendingOperationId: string | null = null;

  insert(): unknown {
    return {
      values: (values: Partial<Required<FakeSession>> & Partial<FakeOperation>) => {
        if (values.operationId) {
          this.pendingOperationId = values.operationId;
          const commit = () => {
            const operation = values as FakeOperation;
            this.operations.set(`${operation.guildId}:${operation.operationId}`, operation);
          };
          return { then: (resolve: (value?: unknown) => void) => Promise.resolve(commit()).then(resolve) };
        }

        return {
          onConflictDoNothing: async () => undefined,
        };
      },
    };
  }

  update(): unknown {
    return {
      set: (patch: Partial<Required<FakeSession>>) => ({
        where: async () => {
          Object.assign(this.session, patch);
        },
      }),
    };
  }

  setOperationLookup(guildId: string, operationId: string): void {
    this.pendingOperationId = `${guildId}:${operationId}`;
  }
}

describe("MusicRepository.checkpoint", () => {
  it("does not let a stale checkpoint resurrect an entry removed by a newer revision", async () => {
    const removedAt = new Date("2026-08-15T16:00:00.000Z");
    const state: FakeSession = {
      id: "session-1",
      revision: 5,
      currentEntryId: null,
      checkpointPositionMs: 0,
      checkpointedAt: removedAt,
    };
    const db = new FakeCheckpointDatabase(state, false);
    const repository = new MusicRepository(db as never);

    const applied = await repository.checkpoint({
      guildId: "guild-1",
      expectedRevision: 4,
      currentEntryId: "deleted-entry",
      positionMs: 42_000,
      checkpointedAt: new Date("2026-08-15T15:59:00.000Z"),
    });

    expect(applied).toBe(false);
    expect(state).toEqual({
      id: "session-1",
      revision: 5,
      currentEntryId: null,
      checkpointPositionMs: 0,
      checkpointedAt: removedAt,
    });
  });

  it("records checkpoint setters transactionally so a delayed replay after restart cannot overwrite newer settings", async () => {
    const state: Required<FakeSession> = {
      id: "session-1",
      revision: 4,
      currentEntryId: "entry-1",
      checkpointPositionMs: 25_000,
      checkpointedAt: new Date("2026-08-15T16:00:00.000Z"),
      volume: 100,
      repeatMode: "off",
      filters: {},
    };
    const db = new FakeCheckpointOperationDatabase(state);
    const firstProcess = new MusicRepository(db as never);

    db.setOperationLookup("guild-1", "volume-64");
    const first = await firstProcess.applyCheckpointOperation({
      guildId: "guild-1",
      operationId: "volume-64",
      expectedRevision: 4,
      checkpoint: {
        currentEntryId: "entry-1",
        positionMs: 25_000,
        volume: 64,
      },
    });
    db.setOperationLookup("guild-1", "volume-80");
    const newer = await firstProcess.applyCheckpointOperation({
      guildId: "guild-1",
      operationId: "volume-80",
      expectedRevision: 5,
      checkpoint: {
        currentEntryId: "entry-1",
        positionMs: 26_000,
        volume: 80,
      },
    });

    const restartedProcess = new MusicRepository(db as never);
    db.setOperationLookup("guild-1", "volume-64");
    const delayedReplay = await restartedProcess.applyCheckpointOperation({
      guildId: "guild-1",
      operationId: "volume-64",
      expectedRevision: 4,
      checkpoint: {
        currentEntryId: "entry-1",
        positionMs: 25_000,
        volume: 64,
      },
    });

    expect(first).toEqual({ revision: 5, replayed: false });
    expect(newer).toEqual({ revision: 6, replayed: false });
    expect(delayedReplay).toEqual({ revision: 5, replayed: true });
    expect(state).toMatchObject({ revision: 6, volume: 80, checkpointPositionMs: 26_000 });
  });
});
