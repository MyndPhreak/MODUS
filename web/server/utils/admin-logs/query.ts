export const DEFAULT_ADMIN_LOG_PAGE_SIZE = 100
export const MAX_ADMIN_LOG_PAGE_SIZE = 200

const MAX_SEARCH_LENGTH = 500
const MAX_SOURCE_LENGTH = 100
const MAX_GUILD_ID_LENGTH = 32
const MAX_CURSOR_ID_LENGTH = 256
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/

type QueryValue = string | string[] | null | undefined

export type AdminLogLevel = 'info' | 'warn' | 'error'
export type AdminLogScope = 'global' | 'guild'

export interface LogCursor {
  timestamp: Date
  id: string
}

export interface AdminLogQuery {
  search: string | null
  level: AdminLogLevel | null
  scope: AdminLogScope
  guildId: string | null
  shardId: number | null
  source: string | null
  from: Date | null
  to: Date | null
  limit: number
  cursor: LogCursor | null
}

export class AdminLogQueryError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'AdminLogQueryError'
  }
}

function singleValue(query: Record<string, QueryValue>, key: string): string | null {
  const value = query[key]
  if (Array.isArray(value)) {
    throw new AdminLogQueryError(`${key} must be provided once.`)
  }
  if (value === null || value === undefined) return null
  return value.trim()
}

function boundedText(value: string | null, key: string, maxLength: number): string | null {
  if (!value) return null
  if (value.length > maxLength) {
    throw new AdminLogQueryError(`${key} must be at most ${maxLength} characters.`)
  }
  return value
}

function parseLevel(value: string | null): AdminLogLevel | null {
  if (!value) return null
  if (value === 'info' || value === 'warn' || value === 'error') return value
  throw new AdminLogQueryError('level must be info, warn, or error.')
}

function parseScope(value: string | null, guildId: string | null): AdminLogScope {
  if (!value) return guildId ? 'guild' : 'global'
  if (value !== 'global' && value !== 'guild') {
    throw new AdminLogQueryError('scope must be global or guild.')
  }
  if (value === 'guild' && !guildId) {
    throw new AdminLogQueryError('guildId is required for guild scope.')
  }
  if (value === 'global' && guildId) {
    throw new AdminLogQueryError('guildId cannot be used with global scope.')
  }
  return value
}

function parseGuildId(value: string | null): string | null {
  if (!value) return null
  if (!/^\d+$/.test(value) || value.length > MAX_GUILD_ID_LENGTH) {
    throw new AdminLogQueryError('guildId must be a valid Discord ID.')
  }
  return value
}

function parseShardId(value: string | null): number | null {
  if (!value) return null
  if (!/^\d+$/.test(value)) {
    throw new AdminLogQueryError('shardId must be a non-negative integer.')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new AdminLogQueryError('shardId must be a non-negative integer.')
  }
  return parsed
}

function parseTimestamp(value: string | null, key: string): Date | null {
  if (!value) return null
  const match = ISO_TIMESTAMP.exec(value)
  if (!match) {
    throw new AdminLogQueryError(`${key} must be an ISO UTC timestamp.`)
  }
  const parsed = new Date(value)
  const [, year, month, day, hour, minute, second] = match
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute) ||
    parsed.getUTCSeconds() !== Number(second)
  ) {
    throw new AdminLogQueryError(`${key} must be an ISO UTC timestamp.`)
  }
  return parsed
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_ADMIN_LOG_PAGE_SIZE
  if (!/^\d+$/.test(value)) {
    throw new AdminLogQueryError('limit must be a positive integer.')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_ADMIN_LOG_PAGE_SIZE) {
    throw new AdminLogQueryError(`limit must be between 1 and ${MAX_ADMIN_LOG_PAGE_SIZE}.`)
  }
  return parsed
}

function validCursorId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CURSOR_ID_LENGTH
}

export function encodeLogCursor(cursor: { timestamp: Date | string; id: string }): string {
  const timestamp = cursor.timestamp instanceof Date
    ? cursor.timestamp
    : parseTimestamp(cursor.timestamp, 'cursor timestamp')

  if (!timestamp || Number.isNaN(timestamp.getTime()) || !validCursorId(cursor.id)) {
    throw new AdminLogQueryError('cursor contains invalid values.')
  }

  return Buffer.from(JSON.stringify({
    timestamp: timestamp.toISOString(),
    id: cursor.id,
  }), 'utf8').toString('base64url')
}

export function decodeLogCursor(value: string): LogCursor {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AdminLogQueryError('cursor is malformed.')
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      timestamp?: unknown
      id?: unknown
    }
    if (typeof decoded.timestamp !== 'string' || !validCursorId(decoded.id)) {
      throw new Error('Invalid cursor fields')
    }
    const timestamp = parseTimestamp(decoded.timestamp, 'cursor timestamp')
    if (!timestamp) throw new Error('Missing cursor timestamp')
    return { timestamp, id: decoded.id }
  } catch {
    throw new AdminLogQueryError('cursor is malformed.')
  }
}

export function parseAdminLogQuery(query: Record<string, QueryValue>): AdminLogQuery {
  const guildId = parseGuildId(singleValue(query, 'guildId'))
  const from = parseTimestamp(singleValue(query, 'from'), 'from')
  const to = parseTimestamp(singleValue(query, 'to'), 'to')
  if (from && to && from.getTime() > to.getTime()) {
    throw new AdminLogQueryError('date range requires from to be before or equal to to.')
  }

  const cursorValue = singleValue(query, 'cursor')
  return {
    search: boundedText(singleValue(query, 'search'), 'search', MAX_SEARCH_LENGTH),
    level: parseLevel(singleValue(query, 'level')),
    scope: parseScope(singleValue(query, 'scope'), guildId),
    guildId,
    shardId: parseShardId(singleValue(query, 'shardId')),
    source: boundedText(singleValue(query, 'source'), 'source', MAX_SOURCE_LENGTH),
    from,
    to,
    limit: parseLimit(singleValue(query, 'limit')),
    cursor: cursorValue === null ? null : decodeLogCursor(cursorValue),
  }
}
