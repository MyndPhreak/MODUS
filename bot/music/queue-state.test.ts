import { describe, expect, it } from "vitest";
import {
  applyQueueMutation,
  QueueRevisionConflictError,
} from "./queue-state";
import type {
  CanonicalTrack,
  MusicQueueEntry,
  MusicQueueSnapshot,
} from "./types";

const track = (id: string): CanonicalTrack => ({
  id: `track-${id}`,
  requestedInput: id,
  requestType: "search",
  title: `Track ${id}`,
  artists: ["Artist"],
  requestedBy: "user-1",
  requestedAt: "2026-08-15T12:00:00.000Z",
  requestedSource: { name: "youtube" },
});

const entry = (id: string, position: number): MusicQueueEntry => ({
  id,
  track: track(id),
  position,
  status: "ready",
});

const snapshot = (
  entries: MusicQueueEntry[] = [entry("a", 0), entry("b", 1)],
): MusicQueueSnapshot => ({
  guildId: "guild-1",
  revision: 3,
  entries,
  currentEntryId: entries[0]?.id ?? null,
  repeatMode: "off",
  volume: 100,
  filters: {},
});

describe("applyQueueMutation", () => {
  it("inserts an entry at the requested position and preserves queue order", () => {
    const result = applyQueueMutation(snapshot(), {
      type: "insert",
      operationId: "insert-c",
      expectedRevision: 3,
      entry: entry("c", 99),
      position: 1,
    });

    expect(result.revision).toBe(4);
    expect(result.entries.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("removes an entry and compacts the remaining positions", () => {
    const result = applyQueueMutation(snapshot(), {
      type: "remove",
      operationId: "remove-a",
      expectedRevision: 3,
      entryId: "a",
    });

    expect(result.entries.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: "b", position: 0 },
    ]);
    expect(result.currentEntryId).toBeNull();
  });

  it("moves an entry and normalizes every queue position", () => {
    const result = applyQueueMutation(snapshot(), {
      type: "move",
      operationId: "move-b",
      expectedRevision: 3,
      entryId: "b",
      position: 0,
    });

    expect(result.entries.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("rejects a mutation based on a stale revision", () => {
    expect(() => applyQueueMutation(snapshot(), {
      type: "remove",
      operationId: "stale-remove",
      expectedRevision: 2,
      entryId: "a",
    })).toThrowError(expect.objectContaining<Partial<QueueRevisionConflictError>>({
      expectedRevision: 2,
      actualRevision: 3,
    }));
  });

  it("returns the existing revision when an operation is replayed", () => {
    const mutation = {
      type: "insert" as const,
      operationId: "insert-once",
      expectedRevision: 3,
      entry: entry("c", 0),
      position: 2,
    };
    const first = applyQueueMutation(snapshot(), mutation);
    const replay = applyQueueMutation(first, mutation);

    expect(replay.revision).toBe(4);
    expect(replay.entries.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(replay.appliedOperations).toEqual({ "insert-once": 4 });
  });

  it("preserves the current snapshot revision when an older operation is replayed", () => {
    const insert = {
      type: "insert" as const,
      operationId: "insert-c",
      expectedRevision: 3,
      entry: entry("c", 0),
      position: 2,
    };
    const afterInsert = applyQueueMutation(snapshot(), insert);
    const afterRemove = applyQueueMutation(afterInsert, {
      type: "remove",
      operationId: "remove-a",
      expectedRevision: 4,
      entryId: "a",
    });

    const replay = applyQueueMutation(afterRemove, insert);

    expect(replay.revision).toBe(5);
    expect(replay.entries.map(({ id }) => id)).toEqual(["b", "c"]);
  });
});
