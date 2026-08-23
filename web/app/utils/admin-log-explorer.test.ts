import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  applyHistoryPage,
  applyCoordinatedHistoryPage,
  applyLiveLog,
  clearLogView,
  createDebouncedAction,
  createAdminLogExplorerState,
  createHistoryCoordinator,
  createLogEventStream,
  createRouteSyncCoordinator,
  historyQuery,
  localDateTimeToUtc,
  matchesLogFilters,
  replaceHistoryPage,
  refreshLogHistory,
  resumeExplorerLogs,
  resumeExplorerView,
  routeQueryToLogFilters,
  serializeLogFilters,
  utcToLocalDateTime,
  type AdminLogExplorerFilters,
} from './admin-log-explorer'
import type { ClientLogDoc } from './admin-log-state'

const originalTimezone = process.env.TZ
beforeAll(() => { process.env.TZ = 'America/New_York' })
afterAll(() => { process.env.TZ = originalTimezone })

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
      from: '2026-08-22T14:30:00.000Z',
      to: '2026-08-23T14:30:00.000Z',
    })
  })

  it('uses the date-specific platform offset across opposite DST seasons', () => {
    expect(utcToLocalDateTime('2026-07-15T14:30:00.000Z')).toBe('2026-07-15T10:30')
    expect(localDateTimeToUtc('2026-07-15T10:30')).toBe('2026-07-15T14:30:00.000Z')
    expect(utcToLocalDateTime('2026-01-15T15:30:00.000Z')).toBe('2026-01-15T10:30')
    expect(localDateTimeToUtc('2026-01-15T10:30')).toBe('2026-01-15T15:30:00.000Z')
    expect(routeQueryToLogFilters({ from: '2026-01-15T15:30:00.000Z' }).from).toBe('2026-01-15T10:30')
  })

  it('serializes only valid scope and guild combinations', () => {
    expect(serializeLogFilters({ ...filters, scope: 'all', guildId: '' }).scope).toBe('all')
    expect(serializeLogFilters({ ...filters, scope: 'global', guildId: '123' })).toMatchObject({ scope: 'global' })
    expect(serializeLogFilters({ ...filters, scope: 'global', guildId: '123' })).not.toHaveProperty('guildId')
    expect(serializeLogFilters({ ...filters, scope: 'guild', guildId: '' })).toMatchObject({ scope: 'guild' })
  })

  it('omits empty filters and cursor while building a first-page request', () => {
    const empty: AdminLogExplorerFilters = {
      search: '', level: 'all', scope: 'all', guildId: '', shardId: '', source: '', from: '', to: '',
    }
    expect(historyQuery(empty, null)).toEqual({ scope: 'all', limit: 100 })
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

describe('admin log explorer history orchestration', () => {
  it('snapshots query and cursor, aborts stale work, and blocks duplicate load older', () => {
    const coordinator = createHistoryCoordinator()
    const mutableQuery = { scope: 'all', limit: 100 }
    const first = coordinator.start(mutableQuery, null, false)!
    mutableQuery.scope = 'global'
    const older = coordinator.start({ scope: 'all', limit: 100 }, 'cursor-1', true)!
    const duplicate = coordinator.start({ scope: 'all', limit: 100 }, 'cursor-1', true)

    expect(first.signal.aborted).toBe(true)
    expect(first.query).toEqual({ scope: 'all', limit: 100 })
    expect(older.cursor).toBe('cursor-1')
    expect(duplicate).toBeNull()
    expect(coordinator.isCurrent(older.id)).toBe(true)
  })

  it('invalidates and aborts synchronously for filter changes, clear, and unmount', () => {
    const coordinator = createHistoryCoordinator()
    const request = coordinator.start({ scope: 'all' }, null, false)!
    coordinator.invalidate()
    expect(request.signal.aborted).toBe(true)
    expect(coordinator.isCurrent(request.id)).toBe(false)
  })

  it('refuses a delayed response after Clear invalidates its request', () => {
    const coordinator = createHistoryCoordinator()
    const request = coordinator.start({ scope: 'all' }, null, false)!
    const cleared = clearLogView({ ...createAdminLogExplorerState(), visible: [log('old', '2026-08-23T10:00:00Z')] })
    coordinator.invalidate()

    const result = applyCoordinatedHistoryPage(coordinator, request, cleared, [log('late', '2026-08-23T10:01:00Z')], null)
    expect(result.visible).toEqual([])
  })

  it('accepts only the current refresh response and replaces stale history', () => {
    const coordinator = createHistoryCoordinator()
    const stale = coordinator.start({ scope: 'all' }, null, false)!
    const current = coordinator.start({ scope: 'global' }, null, false)!
    const state = { ...createAdminLogExplorerState(), visible: [log('old', '2026-08-23T10:00:00Z')] }

    expect(applyCoordinatedHistoryPage(coordinator, stale, state, [log('stale', '2026-08-23T10:02:00Z')], null)).toBe(state)
    expect(applyCoordinatedHistoryPage(coordinator, current, state, [log('fresh', '2026-08-23T10:01:00Z')], null).visible.map(item => item.$id)).toEqual(['fresh'])
  })

  it('merges an older page without duplicates', () => {
    const initial = applyHistoryPage(createAdminLogExplorerState(), [log('new', '2026-08-23T10:00:00Z')], 'next')
    const older = applyHistoryPage(initial, [log('new', '2026-08-23T10:00:00Z'), log('old', '2026-08-22T10:00:00Z')], null)
    expect(older.visible.map(item => item.$id)).toEqual(['new', 'old'])
    expect(older.nextCursor).toBeNull()
  })

  it('replaces old history while preserving live arrivals during the refresh', () => {
    const state = {
      ...createAdminLogExplorerState(),
      visible: [log('live', '2026-08-23T10:02:00Z'), log('stale-history', '2026-08-23T10:01:00Z')],
      liveIds: ['live'],
    }
    const loaded = replaceHistoryPage(state, [log('fresh-history', '2026-08-23T10:00:00Z')], null)
    expect(loaded.visible.map(item => item.$id)).toEqual(['live', 'fresh-history'])
  })

  it('clear view preserves filters but removes displayed and pending entries', () => {
    const state = { ...createAdminLogExplorerState(), visible: [log('new', '2026-08-23T10:00:00Z')], pending: [log('pending', '2026-08-23T10:01:00Z')], pendingCount: 1 }
    expect(clearLogView(state)).toMatchObject({ visible: [], pending: [], pendingCount: 0, nextCursor: null, liveIds: [] })
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

  it('tracks resumed pending entries as live records', () => {
    const resumed = resumeExplorerLogs({
      ...createAdminLogExplorerState(),
      paused: true,
      pending: [log('pending', '2026-08-23T10:01:00Z')],
      pendingCount: 1,
    })
    expect(resumed.liveIds).toEqual(['pending'])
    expect(resumed.paused).toBe(false)
  })

  it('requests a latest-entry scroll on resume only when auto-scroll is enabled', () => {
    const paused = { ...createAdminLogExplorerState(), paused: true, pending: [log('pending', '2026-08-23T10:01:00Z')] }
    expect(resumeExplorerView(paused, true).scrollToLatest).toBe(true)
    expect(resumeExplorerView(paused, false).scrollToLatest).toBe(false)
  })
})

describe('admin log explorer lifecycle helpers', () => {
  it('keeps overlapping internal routes owned and still hydrates external navigation', () => {
    const routes = createRouteSyncCoordinator()
    const first = routes.begin({ search: 'first', scope: 'all' })
    const second = routes.begin({ search: 'second', scope: 'all' })
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    if (!first || !second) throw new Error('Expected distinct internal route navigations')

    routes.complete(first, { search: 'second', scope: 'all' })
    expect(routes.shouldHydrate({ search: 'first', scope: 'all' })).toBe(true)
    expect(routes.shouldHydrate({ search: 'back', scope: 'all' })).toBe(true)
    expect(routes.shouldHydrate({ search: 'second', scope: 'all' })).toBe(false)
    routes.complete(second, { search: 'second', scope: 'all' })
    expect(routes.shouldHydrate({ search: 'second', scope: 'all' })).toBe(true)

    const third = routes.begin({ search: 'third', scope: 'all' })
    expect(third).not.toBeNull()
    if (!third) throw new Error('Expected an internal route navigation')
    routes.complete(third, { search: 'third', scope: 'all' })
    expect(routes.shouldHydrate({ search: 'third', scope: 'all' })).toBe(false)
    expect(routes.shouldHydrate({ search: 'third', scope: 'all' })).toBe(true)
  })

  it('does not retain ownership when the internal target is already current', () => {
    const routes = createRouteSyncCoordinator()
    const query = { search: 'current', scope: 'all' }
    expect(routes.begin(query, query)).toBeNull()
    expect(routes.shouldHydrate(query)).toBe(true)
  })

  it('debounces rapid changes and cancels pending work', () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const debounce = createDebouncedAction<string>(350, value => calls.push(value))
    debounce.schedule('first'); debounce.schedule('second')
    vi.advanceTimersByTime(349)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual(['second'])
    debounce.schedule('third'); debounce.cancel(); vi.runAllTimers()
    expect(calls).toEqual(['second'])
    vi.useRealTimers()
  })

  it('owns EventSource state, messages, reconnect, and close lifecycle', () => {
    const received: ClientLogDoc[] = []
    const states: string[] = []
    const fake = { onopen: null, onerror: null, onmessage: null, close: vi.fn() } as any
    const stream = createLogEventStream(() => fake, logItem => received.push(logItem), state => states.push(state))
    fake.onopen(); fake.onerror(); fake.onmessage({ data: JSON.stringify({ kind: 'create', log: log('live', '2026-08-23T10:00:00Z') }) }); fake.onmessage({ data: 'bad json' })
    stream.close()
    expect(states).toEqual(['connecting', 'connected', 'reconnecting'])
    expect(received.map(item => item.$id)).toEqual(['live'])
    expect(fake.close).toHaveBeenCalledOnce()
  })
})
