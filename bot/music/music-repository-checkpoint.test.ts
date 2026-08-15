import { describe, expect, it } from "vitest";
import { MusicRepository } from "@modus/db";

interface FakeSession {
  id: string;
  revision: number;
  currentEntryId: string | null;
  checkpointPositionMs: number;
  checkpointedAt: Date | null;
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
});
