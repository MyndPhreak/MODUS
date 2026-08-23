import type { LogDoc } from '@modus/db'

export type ClientLogDoc = Omit<LogDoc, 'timestamp'> & {
  timestamp: string | Date
}

export interface AdminLiveLogState {
  visible: ClientLogDoc[]
  pending: ClientLogDoc[]
  paused: boolean
  pendingCount?: number
}

function timestampValue(timestamp: ClientLogDoc['timestamp']): number {
  const value = timestamp instanceof Date ? timestamp.getTime() : Date.parse(timestamp)
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

function compareNewestFirst(a: ClientLogDoc, b: ClientLogDoc): number {
  const aTimestamp = timestampValue(a.timestamp)
  const bTimestamp = timestampValue(b.timestamp)
  if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp
  if (a.$id === b.$id) return 0
  return a.$id < b.$id ? 1 : -1
}

/**
 * Merges serialized API and live log records without mutating either input.
 * Incoming records replace current records with the same ID. Invalid timestamps
 * are retained after valid timestamps and use descending ID order as a stable tie-breaker.
 */
export function mergeLogItems(
  current: readonly ClientLogDoc[],
  incoming: readonly ClientLogDoc[],
  max: number,
): ClientLogDoc[] {
  if (max <= 0) return []

  const byId = new Map<string, ClientLogDoc>()
  for (const item of current) byId.set(item.$id, item)
  for (const item of incoming) byId.set(item.$id, item)

  return [...byId.values()].sort(compareNewestFirst).slice(0, max)
}

export function queueLiveLog(
  state: AdminLiveLogState,
  log: ClientLogDoc,
  maxPending: number,
): AdminLiveLogState {
  if (!state.paused) return state

  const pending = mergeLogItems(state.pending, [log], maxPending)
  return {
    ...state,
    pending,
    pendingCount: pending.length,
  }
}

export function resumeLiveLogs(
  state: AdminLiveLogState,
  maxVisible: number,
): AdminLiveLogState {
  return {
    ...state,
    visible: mergeLogItems(state.visible, state.pending, maxVisible),
    pending: [],
    pendingCount: 0,
    paused: false,
  }
}
