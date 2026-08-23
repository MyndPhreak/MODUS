import {
  mergeLogItems,
  queueLiveLog,
  resumeLiveLogs,
  type AdminLiveLogState,
  type ClientLogDoc,
} from './admin-log-state'

export const ADMIN_LOG_PAGE_SIZE = 100
export const MAX_VISIBLE_LOGS = 1_000
export const MAX_PENDING_LOGS = 200

export type ExplorerLevel = 'all' | 'info' | 'warn' | 'error'
export type ExplorerScope = 'all' | 'global' | 'guild'
export type LogConnectionState = 'connecting' | 'connected' | 'reconnecting'

export interface AdminLogExplorerFilters {
  search: string
  level: ExplorerLevel
  scope: ExplorerScope
  guildId: string
  shardId: string
  source: string
  from: string
  to: string
}

export interface AdminLogExplorerState extends AdminLiveLogState {
  nextCursor: string | null
  liveIds: string[]
}

export interface HistoryRequest {
  id: number
  query: Readonly<Record<string, string | number>>
  cursor: string | null
  append: boolean
  signal: AbortSignal
}

type RouteQueryValue = string | null | Array<string | null> | undefined

function first(value: RouteQueryValue): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate.trim() : ''
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function utcToLocalDateTime(value: string, offsetMinutes = new Date().getTimezoneOffset()): string {
  if (!value) return ''
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  const local = new Date(timestamp - offsetMinutes * 60_000)
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
}

export function localDateTimeToUtc(value: string, offsetMinutes = new Date().getTimezoneOffset()): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return ''
  const [, year, month, day, hour, minute] = match
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) + offsetMinutes * 60_000
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function emptyLogFilters(): AdminLogExplorerFilters {
  return { search: '', level: 'all', scope: 'all', guildId: '', shardId: '', source: '', from: '', to: '' }
}

export function routeQueryToLogFilters(
  query: Record<string, RouteQueryValue>,
  offsetMinutes = new Date().getTimezoneOffset(),
): AdminLogExplorerFilters {
  const result = emptyLogFilters()
  result.search = first(query.search)
  const level = first(query.level)
  if (level === 'info' || level === 'warn' || level === 'error') result.level = level
  result.guildId = first(query.guildId) || first(query.guild_id) || first(query.guild)
  const scope = first(query.scope)
  if (scope === 'all' || scope === 'global' || scope === 'guild') result.scope = scope
  else if (result.guildId) result.scope = 'guild'
  if ((result.scope === 'all' || result.scope === 'global') && result.guildId) result.guildId = ''
  result.shardId = first(query.shardId) || first(query.shard_id) || first(query.shard)
  result.source = first(query.source)
  result.from = utcToLocalDateTime(first(query.from), offsetMinutes)
  result.to = utcToLocalDateTime(first(query.to), offsetMinutes)
  return result
}

export function serializeLogFilters(
  filters: AdminLogExplorerFilters,
  offsetMinutes = new Date().getTimezoneOffset(),
): Record<string, string> {
  const query: Record<string, string> = { scope: filters.scope }
  const search = filters.search.trim()
  const guildId = filters.guildId.trim()
  const shardId = filters.shardId.trim()
  const source = filters.source.trim()
  if (search) query.search = search
  if (filters.level !== 'all') query.level = filters.level
  if (filters.scope === 'guild' && guildId) query.guildId = guildId
  if (shardId) query.shardId = shardId
  if (source) query.source = source
  const from = localDateTimeToUtc(filters.from, offsetMinutes)
  const to = localDateTimeToUtc(filters.to, offsetMinutes)
  if (from) query.from = from
  if (to) query.to = to
  return query
}

export function historyQuery(filters: AdminLogExplorerFilters, cursor: string | null): Record<string, string | number> {
  return { ...serializeLogFilters(filters), limit: ADMIN_LOG_PAGE_SIZE, ...(cursor ? { cursor } : {}) }
}

export function matchesLogFilters(log: ClientLogDoc, filters: AdminLogExplorerFilters): boolean {
  const search = filters.search.trim().toLocaleLowerCase()
  if (search && !log.message.toLocaleLowerCase().includes(search)) return false
  if (filters.level !== 'all' && log.level !== filters.level) return false
  if (filters.guildId.trim() && log.guildId !== filters.guildId.trim()) return false
  if (filters.shardId.trim() && String(log.shardId ?? '') !== filters.shardId.trim()) return false
  if (filters.source.trim() && log.source !== filters.source.trim()) return false
  if (filters.scope === 'global' && log.guildId !== 'global') return false
  if (filters.scope === 'guild' && (!log.guildId || log.guildId === 'global')) return false
  const timestamp = new Date(log.timestamp).getTime()
  const from = filters.from ? new Date(filters.from).getTime() : Number.NEGATIVE_INFINITY
  const to = filters.to ? new Date(filters.to).getTime() : Number.POSITIVE_INFINITY
  return !Number.isNaN(timestamp) && timestamp >= from && timestamp <= to
}

export function createAdminLogExplorerState(): AdminLogExplorerState {
  return { visible: [], pending: [], paused: false, pendingCount: 0, nextCursor: null, liveIds: [] }
}

export function applyHistoryPage(state: AdminLogExplorerState, items: readonly ClientLogDoc[], nextCursor: string | null): AdminLogExplorerState {
  return { ...state, visible: mergeLogItems(state.visible, items, MAX_VISIBLE_LOGS), nextCursor }
}

export function replaceHistoryPage(state: AdminLogExplorerState, items: readonly ClientLogDoc[], nextCursor: string | null): AdminLogExplorerState {
  const liveIdSet = new Set(state.liveIds)
  const live = state.visible.filter(item => liveIdSet.has(item.$id))
  return { ...state, visible: mergeLogItems(items, live, MAX_VISIBLE_LOGS), nextCursor }
}

export function clearLogView(state: AdminLogExplorerState): AdminLogExplorerState {
  return { ...state, visible: [], pending: [], pendingCount: 0, nextCursor: null, liveIds: [] }
}

export function refreshLogHistory(state: AdminLogExplorerState): AdminLogExplorerState {
  return { ...state, pending: [], pendingCount: 0, nextCursor: null }
}

export function applyLiveLog(state: AdminLogExplorerState, log: ClientLogDoc): AdminLogExplorerState {
  if (state.paused) return queueLiveLog(state, log, MAX_PENDING_LOGS) as AdminLogExplorerState
  return {
    ...state,
    visible: mergeLogItems(state.visible, [log], MAX_VISIBLE_LOGS),
    liveIds: [...new Set([...state.liveIds, log.$id])].slice(-MAX_VISIBLE_LOGS),
  }
}

export function resumeExplorerLogs(state: AdminLogExplorerState): AdminLogExplorerState {
  const pendingIds = state.pending.map(item => item.$id)
  const resumed = resumeLiveLogs(state, MAX_VISIBLE_LOGS)
  return { ...resumed, liveIds: [...new Set([...state.liveIds, ...pendingIds])].slice(-MAX_VISIBLE_LOGS) } as AdminLogExplorerState
}

export function resumeExplorerView(state: AdminLogExplorerState, autoScroll: boolean): {
  state: AdminLogExplorerState
  scrollToLatest: boolean
} {
  return { state: resumeExplorerLogs(state), scrollToLatest: autoScroll }
}

export function createHistoryCoordinator() {
  let sequence = 0
  let active: { id: number; append: boolean; cursor: string | null; controller: AbortController } | null = null

  return {
    start(query: Record<string, string | number>, cursor: string | null, append: boolean): HistoryRequest | null {
      if (append && active?.append && active.cursor === cursor) return null
      active?.controller.abort()
      const controller = new AbortController()
      const id = ++sequence
      active = { id, append, cursor, controller }
      return { id, query: Object.freeze({ ...query }), cursor, append, signal: controller.signal }
    },
    invalidate(): void {
      active?.controller.abort()
      active = null
      sequence += 1
    },
    isCurrent(id: number): boolean {
      return active?.id === id && !active.controller.signal.aborted
    },
    finish(id: number): void {
      if (active?.id === id) active = null
    },
  }
}

export function applyCoordinatedHistoryPage(
  coordinator: ReturnType<typeof createHistoryCoordinator>,
  request: HistoryRequest,
  state: AdminLogExplorerState,
  items: readonly ClientLogDoc[],
  nextCursor: string | null,
): AdminLogExplorerState {
  if (!coordinator.isCurrent(request.id)) return state
  return request.append
    ? applyHistoryPage(state, items, nextCursor)
    : replaceHistoryPage(state, items, nextCursor)
}

export function createDebouncedAction<T>(delay: number, action: (value: T) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule(value: T): void {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; action(value) }, delay)
    },
    cancel(): void {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

type EventSourceLike = Pick<EventSource, 'onopen' | 'onerror' | 'onmessage' | 'close'>

export function createLogEventStream(
  createSource: () => EventSourceLike,
  onLog: (log: ClientLogDoc) => void,
  onState: (state: LogConnectionState) => void,
) {
  onState('connecting')
  const source = createSource()
  source.onopen = () => onState('connected')
  source.onerror = () => onState('reconnecting')
  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as { kind?: string; log?: ClientLogDoc }
      if (payload.kind === 'create' && payload.log) onLog(payload.log)
    } catch { /* Ignore malformed events without interrupting reconnect. */ }
  }
  return { close: () => source.close() }
}
