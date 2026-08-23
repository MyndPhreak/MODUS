import { describe, expect, it } from 'vitest'
import {
  mergeLogItems,
  queueLiveLog,
  resumeLiveLogs,
  type AdminLiveLogState,
  type ClientLogDoc,
} from './admin-log-state'

function log($id: string, timestamp: string): ClientLogDoc {
  return {
    $id,
    id: $id,
    guildId: 'global',
    message: `message ${$id}`,
    level: 'info',
    timestamp,
    shardId: null,
    source: null,
  }
}

function state(overrides: Partial<AdminLiveLogState> = {}): AdminLiveLogState {
  return {
    visible: [],
    pending: [],
    paused: true,
    ...overrides,
  }
}

describe('mergeLogItems', () => {
  it.each([0, -1])('returns an empty list for a %d-item cap', (max) => {
    expect(mergeLogItems([log('current', '2026-08-23T12:00:00.000Z')], [log('incoming', '2026-08-23T12:00:01.000Z')], max)).toEqual([])
  })

  it('keeps exactly the configured number of newest items', () => {
    const items = mergeLogItems(
      [log('old', '2026-08-23T12:00:00.000Z')],
      [log('new', '2026-08-23T12:00:01.000Z')],
      2,
    )
    expect(items.map(item => item.$id)).toEqual(['new', 'old'])
  })

  it('deduplicates by $id and keeps the incoming representation', () => {
    const stale = { ...log('same', '2026-08-23T12:00:00.000Z'), message: 'stale' }
    const fresh = { ...stale, message: 'fresh' }

    expect(mergeLogItems([stale], [fresh], 10)).toEqual([fresh])
  })

  it('orders newest first and breaks equal timestamps by descending $id', () => {
    const items = mergeLogItems(
      [log('a', '2026-08-23T12:00:00.000Z')],
      [
        log('newest', '2026-08-23T12:00:01.000Z'),
        log('z', '2026-08-23T12:00:00.000Z'),
      ],
      10,
    )

    expect(items.map(item => item.$id)).toEqual(['newest', 'z', 'a'])
  })

  it('places invalid timestamps after valid timestamps and orders them by descending $id', () => {
    const items = mergeLogItems(
      [log('valid', '2026-08-23T12:00:00.000Z'), log('a-invalid', 'not-a-date')],
      [log('z-invalid', 'also-not-a-date')],
      10,
    )

    expect(items.map(item => item.$id)).toEqual(['valid', 'z-invalid', 'a-invalid'])
  })

  it('caps the visible buffer without mutating either input', () => {
    const current = [log('old', '2026-08-23T12:00:00.000Z')]
    const incoming = [
      log('newest', '2026-08-23T12:00:02.000Z'),
      log('middle', '2026-08-23T12:00:01.000Z'),
    ]

    expect(mergeLogItems(current, incoming, 2).map(item => item.$id)).toEqual(['newest', 'middle'])
    expect(current.map(item => item.$id)).toEqual(['old'])
    expect(incoming.map(item => item.$id)).toEqual(['newest', 'middle'])
  })

  it('accepts frozen inputs without mutating their arrays or records', () => {
    const currentRecord = Object.freeze(log('old', '2026-08-23T12:00:00.000Z'))
    const incomingRecord = Object.freeze(log('new', '2026-08-23T12:00:01.000Z'))
    const current = Object.freeze([currentRecord])
    const incoming = Object.freeze([incomingRecord])

    expect(mergeLogItems(current, incoming, 2)).toEqual([incomingRecord, currentRecord])
    expect(current).toEqual([currentRecord])
    expect(incoming).toEqual([incomingRecord])
  })
})

describe('queueLiveLog', () => {
  it('uses an empty pending buffer for zero and negative caps', () => {
    const original = state({ pending: [log('old', '2026-08-23T12:00:00.000Z')] })
    expect(queueLiveLog(original, log('new', '2026-08-23T12:00:01.000Z'), 0)).toMatchObject({ pending: [], pendingCount: 0 })
    expect(queueLiveLog(original, log('new', '2026-08-23T12:00:01.000Z'), -1)).toMatchObject({ pending: [], pendingCount: 0 })
  })

  it('keeps exactly the pending cap', () => {
    const queued = queueLiveLog(
      state({ pending: [log('old', '2026-08-23T12:00:00.000Z')] }),
      log('new', '2026-08-23T12:00:01.000Z'),
      2,
    )
    expect(queued.pending.map(item => item.$id)).toEqual(['new', 'old'])
  })

  it('queues a paused live item and exposes the bounded pending count', () => {
    const original = state({ pending: [log('old', '2026-08-23T12:00:00.000Z')] })

    const next = queueLiveLog(original, log('new', '2026-08-23T12:00:01.000Z'), 10)

    expect(next.pending.map(item => item.$id)).toEqual(['new', 'old'])
    expect(next.pendingCount).toBe(2)
    expect(original.pending.map(item => item.$id)).toEqual(['old'])
  })

  it('deduplicates and caps pending items while paused', () => {
    const original = state({
      pending: [
        log('middle', '2026-08-23T12:00:01.000Z'),
        log('old', '2026-08-23T12:00:00.000Z'),
      ],
    })

    const deduped = queueLiveLog(original, log('middle', '2026-08-23T12:00:01.000Z'), 2)
    const capped = queueLiveLog(deduped, log('new', '2026-08-23T12:00:02.000Z'), 2)

    expect(capped.pending.map(item => item.$id)).toEqual(['new', 'middle'])
    expect(capped.pendingCount).toBe(2)
  })

  it('does not queue when live insertion is not paused', () => {
    const original = state({ paused: false })

    expect(queueLiveLog(original, log('new', '2026-08-23T12:00:00.000Z'), 10)).toBe(original)
  })
})

describe('resumeLiveLogs', () => {
  it('merges pending items into the visible cap, clears pending, and resumes immutably', () => {
    const original = state({
      visible: [log('same', '2026-08-23T12:00:00.000Z'), log('old', '2026-08-22T12:00:00.000Z')],
      pending: [log('new', '2026-08-23T12:00:01.000Z'), log('same', '2026-08-23T12:00:00.000Z')],
    })

    const resumed = resumeLiveLogs(original, 2)

    expect(resumed).toEqual({
      visible: [log('new', '2026-08-23T12:00:01.000Z'), log('same', '2026-08-23T12:00:00.000Z')],
      pending: [],
      pendingCount: 0,
      paused: false,
    })
    expect(original.paused).toBe(true)
    expect(original.pending).toHaveLength(2)
  })

  it('uses the queued replacement for a duplicate visible record', () => {
    const stale = { ...log('same', '2026-08-23T12:00:00.000Z'), message: 'stale' }
    const replacement = { ...stale, message: 'replacement' }
    const queued = queueLiveLog(state({ visible: [stale] }), replacement, 10)

    expect(resumeLiveLogs(queued, 10).visible).toEqual([replacement])
  })
})
