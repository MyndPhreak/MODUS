import { describe, expect, it } from 'vitest'
import {
  applyHistoryPage,
  applyLiveLog,
  beginHistoryRequest,
  clearLogView,
  createAdminLogExplorerState,
  historyQuery,
  isCurrentHistoryRequest,
  matchesLogFilters,
  refreshLogHistory,
  routeQueryToLogFilters,
  serializeLogFilters,
  type AdminLogExplorerFilters,
} from './admin-log-explorer'
import type { ClientLogDoc } from './admin-log-state'

function log($id: string, timestamp: string): ClientLogDoc {
  return {
    $id,
    id: $id,
    guildId: '123',
    message: `message ${$id}`,
    level: 'info',
    timestamp,
    shardId: 0,
    source: 'gateway',
  }
}

const filters: AdminLogExplorerFilters = {
  search: ' member joined ',
  level: 'warn',
  scope: 'guild',
  guildId: '123',
  shardId: '0',
  source: 'gateway',
  from: '2026-08-22T10:30',
  to: '2026-08-23T10:30',
}

describe('admin log explorer queries', () => {
  it('serializes trimmed filters and converts local date inputs to UTC', () => {
    expect(serializeLogFilters(filters)).toEqual({
      search: 'member joined',
      level: 'warn',
      scope: 'guild',
      guildId: '123',
      shardId: '0',
      source: 'gateway',
      from: new Date('2026-08-22T10:30').toISOString(),
      to: new Date('2026-08-23T10:30').toISOString(),
    })
  })

  it('omits empty filters and cursor while building a first-page request', () => {
    const empty: AdminLogExplorerFilters = {
      search: '', level: 'all', scope: 'all', guildId: '', shardId: '', source: '', from: '', to: '',
    }
    expect(historyQuery(empty, null)).toEqual({ limit: 100 })
  })

  it('adds an opaque cursor only for older-page requests', () => {
    expect(historyQuery(filters, 'opaque')).toMatchObject({ cursor: 'opaque', limit: 100 })
  })

  it('hydrates supported overview and server-link query parameters', () => {
    expect(routeQueryToLogFilters({ guildId: '123', level: 'error', shardId: '2', source: 'worker' })).toMatchObject({
      guildId: '123', scope: 'guild', level: 'error', shardId: '2', source: 'worker',
    })
  })

  it('matches live entries against the active search and structured filters', () => {
    const inRange = new Date('2026-08-23T10:30').toISOString()
    expect(matchesLogFilters({ ...log('match', inRange), level: 'warn', message: 'Member joined voice' }, filters)).toBe(true)
    expect(matchesLogFilters({ ...log('wrong', inRange), level: 'warn', message: 'Member left voice' }, filters)).toBe(false)
  })
})

describe('admin log explorer history', () => {
  it('suppresses a stale response after a newer request starts', () => {
    const state = createAdminLogExplorerState()
    const first = beginHistoryRequest(state)
    const second = beginHistoryRequest(first.state)
    expect(isCurrentHistoryRequest(second.state, first.requestId)).toBe(false)
    expect(isCurrentHistoryRequest(second.state, second.requestId)).toBe(true)
  })

  it('replaces the first page and merges an older page without duplicates', () => {
    const initial = applyHistoryPage(createAdminLogExplorerState(), [log('new', '2026-08-23T10:00:00Z')], 'next', false)
    const older = applyHistoryPage(initial, [log('new', '2026-08-23T10:00:00Z'), log('old', '2026-08-22T10:00:00Z')], null, true)
    expect(older.visible.map(item => item.$id)).toEqual(['new', 'old'])
    expect(older.nextCursor).toBeNull()
  })

  it('keeps a live entry received while the first history page was loading', () => {
    const liveState = { ...createAdminLogExplorerState(), visible: [log('live', '2026-08-23T10:01:00Z')] }
    const loaded = applyHistoryPage(liveState, [log('history', '2026-08-23T10:00:00Z')], null, false)
    expect(loaded.visible.map(item => item.$id)).toEqual(['live', 'history'])
  })

  it('clear view preserves filters but removes displayed and pending entries', () => {
    const state = { ...createAdminLogExplorerState(), visible: [log('new', '2026-08-23T10:00:00Z')], pending: [log('pending', '2026-08-23T10:01:00Z')], pendingCount: 1 }
    expect(clearLogView(state)).toMatchObject({ visible: [], pending: [], pendingCount: 0, nextCursor: null })
  })

  it('refresh resets pagination and pending live entries', () => {
    const state = { ...createAdminLogExplorerState(), pending: [log('pending', '2026-08-23T10:01:00Z')], pendingCount: 1, nextCursor: 'older' }
    expect(refreshLogHistory(state)).toMatchObject({ pending: [], pendingCount: 0, nextCursor: null })
  })
})

describe('admin log explorer live state', () => {
  it('inserts live entries when running and queues them while paused', () => {
    const running = applyLiveLog(createAdminLogExplorerState(), log('live', '2026-08-23T10:00:00Z'))
    expect(running.visible.map(item => item.$id)).toEqual(['live'])

    const paused = applyLiveLog({ ...running, paused: true }, log('pending', '2026-08-23T10:01:00Z'))
    expect(paused.visible.map(item => item.$id)).toEqual(['live'])
    expect(paused.pending.map(item => item.$id)).toEqual(['pending'])
    expect(paused.pendingCount).toBe(1)
  })
})
