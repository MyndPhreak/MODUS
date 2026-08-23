export const DEFAULT_ADMIN_AUDIT_PAGE_SIZE = 50
export const MAX_ADMIN_AUDIT_PAGE_SIZE = 100

const MAX_ACTOR_ID_LENGTH = 64
const MAX_ACTION_LENGTH = 100
const MAX_TARGET_TYPE_LENGTH = 32
const MAX_TARGET_ID_LENGTH = 256
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ENCODED_CURSOR_LENGTH = 512
const ADMIN_AUDIT_QUERY_KEYS = new Set([
  'actorId',
  'action',
  'targetType',
  'targetId',
  'from',
  'to',
  'limit',
  'cursor',
])

type QueryValue = string | string[] | null | undefined

export interface AuditCursor {
  createdAt: Date
  id: string
}

export interface AdminAuditQuery {
  actorId: string | null
  action: string | null
  targetType: string | null
  targetId: string | null
  from: Date | null
  to: Date | null
  limit: number
  cursor: AuditCursor | null
}

export interface AdminAuditItem {
  id: string
  createdAt: Date
  [key: string]: unknown
}

export interface AdminAuditSearchPage<Item> {
  items: Item[]
  nextCursorRow: { createdAt: Date; id: string } | null
}

export class AdminAuditQueryError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'AdminAuditQueryError'
  }
}

function singleValue(query: Record<string, QueryValue>, key: string): string | null {
  const value = query[key]
  if (Array.isArray(value)) {
    throw new AdminAuditQueryError(`${key} must be provided once.`)
  }
  if (value === null || value === undefined) return null
  return value.trim()
}

function boundedText(value: string | null, key: string, maxLength: number): string | null {
  if (!value) return null
  if (value.length > maxLength) {
    throw new AdminAuditQueryError(`${key} must be at most ${maxLength} characters.`)
  }
  return value
}

function parseTimestamp(value: string | null, key: string): Date | null {
  if (!value) return null
  const match = ISO_TIMESTAMP.exec(value)
  if (!match) {
    throw new AdminAuditQueryError(`${key} must be an ISO UTC timestamp.`)
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
    throw new AdminAuditQueryError(`${key} must be an ISO UTC timestamp.`)
  }
  return parsed
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_ADMIN_AUDIT_PAGE_SIZE
  if (!/^\d+$/.test(value)) {
    throw new AdminAuditQueryError('limit must be a positive integer.')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_ADMIN_AUDIT_PAGE_SIZE) {
    throw new AdminAuditQueryError(`limit must be between 1 and ${MAX_ADMIN_AUDIT_PAGE_SIZE}.`)
  }
  return parsed
}

function validCursorId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function encodeAuditCursor(cursor: { createdAt: Date | string; id: string }): string {
  if (cursor.createdAt instanceof Date && Number.isNaN(cursor.createdAt.getTime())) {
    throw new AdminAuditQueryError('cursor createdAt must be an ISO UTC timestamp.')
  }
  const createdAtValue = cursor.createdAt instanceof Date
    ? cursor.createdAt.toISOString()
    : cursor.createdAt
  const createdAt = parseTimestamp(createdAtValue, 'cursor createdAt')

  if (!createdAt || !validCursorId(cursor.id)) {
    throw new AdminAuditQueryError('cursor contains invalid values.')
  }

  const encoded = Buffer.from(JSON.stringify({
    createdAt: createdAt.toISOString(),
    id: cursor.id,
  }), 'utf8').toString('base64url')
  if (encoded.length > MAX_ENCODED_CURSOR_LENGTH) {
    throw new AdminAuditQueryError('cursor is too long.')
  }
  return encoded
}

export function decodeAuditCursor(value: string): AuditCursor {
  if (value.length > MAX_ENCODED_CURSOR_LENGTH) {
    throw new AdminAuditQueryError('cursor is too long.')
  }
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AdminAuditQueryError('cursor is malformed.')
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown
      id?: unknown
    }
    if (
      !decoded ||
      Array.isArray(decoded) ||
      typeof decoded !== 'object' ||
      Object.keys(decoded).sort().join(',') !== 'createdAt,id' ||
      typeof decoded.createdAt !== 'string' ||
      !validCursorId(decoded.id)
    ) {
      throw new Error('Invalid cursor fields')
    }
    const createdAt = parseTimestamp(decoded.createdAt, 'cursor createdAt')
    if (!createdAt) throw new Error('Missing cursor createdAt')
    return { createdAt, id: decoded.id }
  } catch {
    throw new AdminAuditQueryError('cursor is malformed.')
  }
}

export function parseAdminAuditQuery(query: Record<string, QueryValue>): AdminAuditQuery {
  const unknownKey = Object.keys(query).find((key) => !ADMIN_AUDIT_QUERY_KEYS.has(key))
  if (unknownKey) {
    throw new AdminAuditQueryError(`${unknownKey} is not a supported query parameter.`)
  }

  const from = parseTimestamp(singleValue(query, 'from'), 'from')
  const to = parseTimestamp(singleValue(query, 'to'), 'to')
  if (from && to && from.getTime() > to.getTime()) {
    throw new AdminAuditQueryError('date range requires from to be before or equal to to.')
  }

  const cursorValue = singleValue(query, 'cursor')
  return {
    actorId: boundedText(singleValue(query, 'actorId'), 'actorId', MAX_ACTOR_ID_LENGTH),
    action: boundedText(singleValue(query, 'action'), 'action', MAX_ACTION_LENGTH),
    targetType: boundedText(singleValue(query, 'targetType'), 'targetType', MAX_TARGET_TYPE_LENGTH),
    targetId: boundedText(singleValue(query, 'targetId'), 'targetId', MAX_TARGET_ID_LENGTH),
    from,
    to,
    limit: parseLimit(singleValue(query, 'limit')),
    cursor: cursorValue === null ? null : decodeAuditCursor(cursorValue),
  }
}

export function mapAdminAuditSearchPage<Item>(page: AdminAuditSearchPage<Item>): {
  items: Item[]
  nextCursor: string | null
} {
  return {
    items: page.items,
    nextCursor: page.nextCursorRow ? encodeAuditCursor(page.nextCursorRow) : null,
  }
}

interface RouteError {
  statusCode: number
  statusMessage: string
}

export interface AdminAuditRouteDependencies<Event, Item> {
  authorize: (event: Event) => Promise<unknown>
  getQuery: (event: Event) => Parameters<typeof parseAdminAuditQuery>[0]
  getRepositories: () => {
    adminAudit: {
      searchPage: (input: AdminAuditQuery) => Promise<AdminAuditSearchPage<Item>>
    }
  } | null
  logError: (error: unknown) => void
  createHttpError?: (statusCode: number, statusMessage: string) => unknown
}

function defaultHttpError(statusCode: number, statusMessage: string): RouteError {
  return { statusCode, statusMessage }
}

export function createAdminAuditRouteHandler<Event, Item>(
  deps: AdminAuditRouteDependencies<Event, Item>,
) {
  const createHttpError = deps.createHttpError ?? defaultHttpError

  return async (event: Event): Promise<{ items: Item[]; nextCursor: string | null }> => {
    await deps.authorize(event)

    let query: AdminAuditQuery
    try {
      query = parseAdminAuditQuery(deps.getQuery(event))
    } catch (error) {
      if (error instanceof AdminAuditQueryError) {
        throw createHttpError(400, error.message)
      }
      throw error
    }

    const repositories = deps.getRepositories()
    if (!repositories) {
      throw createHttpError(503, 'Database unavailable (NUXT_DATABASE_URL not set).')
    }

    try {
      return mapAdminAuditSearchPage(await repositories.adminAudit.searchPage(query))
    } catch (error) {
      deps.logError(error)
      throw createHttpError(500, 'Failed to fetch audit events.')
    }
  }
}
