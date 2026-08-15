import type { MusicQueueEntry, MusicQueueSnapshot } from "./types";

interface QueueMutationBase {
  operationId: string;
  expectedRevision: number;
}

export type QueueMutation =
  | (QueueMutationBase & {
      type: "insert";
      entry: MusicQueueEntry;
      position: number;
    })
  | (QueueMutationBase & {
      type: "remove";
      entryId: string;
    })
  | (QueueMutationBase & {
      type: "move";
      entryId: string;
      position: number;
    })
  | (QueueMutationBase & { type: "clear" })
  | (QueueMutationBase & {
      type: "reorder";
      entryIds: string[];
    });

export interface QueueStateSnapshot extends MusicQueueSnapshot {
  appliedOperations: Record<string, number>;
}

export class QueueRevisionConflictError extends Error {
  constructor(
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
  ) {
    super(
      `Music queue revision conflict: expected ${expectedRevision}, actual ${actualRevision}.`,
    );
    this.name = "QueueRevisionConflictError";
  }
}

export function applyQueueMutation(
  snapshot: MusicQueueSnapshot | QueueStateSnapshot,
  mutation: QueueMutation,
): QueueStateSnapshot {
  const appliedOperations = "appliedOperations" in snapshot
    ? snapshot.appliedOperations
    : {};
  const replayRevision = appliedOperations[mutation.operationId];

  if (replayRevision !== undefined) {
    return {
      ...snapshot,
      revision: replayRevision,
      entries: snapshot.entries.map((entry) => ({ ...entry })),
      appliedOperations: { ...appliedOperations },
    };
  }

  if (mutation.expectedRevision !== snapshot.revision) {
    throw new QueueRevisionConflictError(
      mutation.expectedRevision,
      snapshot.revision,
    );
  }

  let entries = snapshot.entries
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((entry) => ({ ...entry }));
  let currentEntryId = snapshot.currentEntryId;

  switch (mutation.type) {
    case "insert": {
      const position = clampPosition(mutation.position, entries.length);
      entries.splice(position, 0, { ...mutation.entry });
      break;
    }
    case "remove": {
      entries = entries.filter((entry) => entry.id !== mutation.entryId);
      if (currentEntryId === mutation.entryId) currentEntryId = null;
      break;
    }
    case "move": {
      const source = entries.findIndex((entry) => entry.id === mutation.entryId);
      if (source >= 0) {
        const [moved] = entries.splice(source, 1);
        if (moved) {
          entries.splice(clampPosition(mutation.position, entries.length), 0, moved);
        }
      }
      break;
    }
    case "clear":
      entries = [];
      currentEntryId = null;
      break;
    case "reorder": {
      const positions = new Map(
        mutation.entryIds.map((entryId, position) => [entryId, position]),
      );
      entries.sort((left, right) => {
        const leftPosition = positions.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightPosition = positions.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftPosition - rightPosition;
      });
      break;
    }
  }

  const revision = snapshot.revision + 1;
  return {
    ...snapshot,
    revision,
    entries: entries.map((entry, position) => ({ ...entry, position })),
    currentEntryId,
    appliedOperations: {
      ...appliedOperations,
      [mutation.operationId]: revision,
    },
  };
}

function clampPosition(position: number, maximum: number): number {
  if (!Number.isFinite(position)) return maximum;
  return Math.max(0, Math.min(Math.trunc(position), maximum));
}
