import {
  mergeLogItems,
  queueLiveLog,
  type AdminLiveLogState,
  type ClientLogDoc,
} from './admin-log-state'

export const ADMIN_LOG_PAGE_SIZE = 100
export const MAX_VISIBLE_LOGS = 1_000
export const MAX_PENDING_LOGS = 200

export type ExplorerLevel = 'all' | 'info' | 'warn' | 'error'
export type ExplorerScope = 'all' | 'global' | 'guild'

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
  requestSequence: number
}

type RouteQueryValue = string | null | Array<string | null> | undefined

function first(value: RouteQueryValue): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate.trim() : ''
}

function localDateValue(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function emptyLogFilters(): AdminLogExplorerFilters {
  return { search: '', level: 'all', scope: 'all', guildId: '', shardId: '', source: '', from: '', to: '' }
}

export function routeQueryToLogFilters(query: Record<string, RouteQueryValue>): AdminLogExplorerFilters {
  const result = emptyLogFilters()
  result.search = first(query.search)
  const level = first(query.level)
  if (level === 'info' || level === 'warn' || level === 'error') result.level = level
  result.guildId = first(query.guildId) || first(query.guild_id) || first(query.guild)
  const scope = first(query.scope)
  if (scope === 'global' || scope === 'guild') result.scope = scope
  else if (result.guildId) result.scope = 'guild'
  result.shardId = first(query.shardId) || first(query.shard_id) || first(query.shard)
  result.source = first(query.source)
  result.from = first(query.from)
  result.to = first(query.to)
  return result
}

export function serializeLogFilters(filters: AdminLogExplorerFilters): Record<string, string> {
  const query: Record<string, string> = {}
  const search = filters.search.trim()
  const guildId = filters.guildId.trim()
  const shardId = filters.shardId.trim()
  const source = filters.source.trim()
  if (search) query.search = search
  if (filters.level !== 'all') query.level = filters.level
  if (filters.scope !== 'all') query.scope = filters.scope
  if (guildId) query.guildId = guildId
  if (shardId) query.shardId = shardId
  if (source) query.source = source
  const from = localDateValue(filters.from)
  const to = localDateValue(filters.to)
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
  return { visible: [], pending: [], paused: false, pendingCount: 0, nextCursor: null, requestSequence: 0 }
}

export function beginHistoryRequest(state: AdminLogExplorerState): { state: AdminLogExplorerState; requestId: number } {
  const requestId = state.requestSequence + 1
  return { state: { ...state, requestSequence: requestId }, requestId }
}

export function isCurrentHistoryRequest(state: AdminLogExplorerState, requestId: number): boolean {
  return state.requestSequence === requestId
}

export function applyHistoryPage(
  state: AdminLogExplorerState,
  items: readonly ClientLogDoc[],
  nextCursor: string | null,
  append: boolean,
): AdminLogExplorerState {
  return {
    ...state,
    visible: mergeLogItems(state.visible, items, MAX_VISIBLE_LOGS),
    nextCursor,
  }
}

export function clearLogView(state: AdminLogExplorerState): AdminLogExplorerState {
  return { ...state, visible: [], pending: [], pendingCount: 0, nextCursor: null }
}

export function refreshLogHistory(state: AdminLogExplorerState): AdminLogExplorerState {
  return { ...state, pending: [], pendingCount: 0, nextCursor: null }
}

export function applyLiveLog(state: AdminLogExplorerState, log: ClientLogDoc): AdminLogExplorerState {
  if (state.paused) return queueLiveLog(state, log, MAX_PENDING_LOGS) as AdminLogExplorerState
  return { ...state, visible: mergeLogItems(state.visible, [log], MAX_VISIBLE_LOGS) }
}
