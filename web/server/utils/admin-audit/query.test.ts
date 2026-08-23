import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ADMIN_AUDIT_PAGE_SIZE,
  MAX_ADMIN_AUDIT_PAGE_SIZE,
  AdminAuditQueryError,
  createAdminAuditRouteHandler,
  decodeAuditCursor,
  encodeAuditCursor,
  mapAdminAuditSearchPage,
  parseAdminAuditQuery,
} from './query'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('parseAdminAuditQuery', () => {
  it('applies defaults when no filters are provided', () => {
    expect(parseAdminAuditQuery({})).toEqual({
      actorId: null,
      action: null,
      targetType: null,
      targetId: null,
      from: null,
      to: null,
      limit: DEFAULT_ADMIN_AUDIT_PAGE_SIZE,
      cursor: null,
    })
  })

  it('parses actor/action/target/date filters', () => {
    const result = parseAdminAuditQuery({
      actorId: '123456789012345678',
      action: 'module.updated',
      targetType: 'module',
      targetId: 'tickets',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-23T00:00:00.000Z',
    })
    expect(result).toMatchObject({
      actorId: '123456789012345678',
      action: 'module.updated',
      targetType: 'module',
      targetId: 'tickets',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-23T00:00:00.000Z'),
    })
  })

  it('rejects from after to', () => {
    expect(() => parseAdminAuditQuery({
      from: '2026-08-23T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    })).toThrow(AdminAuditQueryError)
  })

  it('rejects an unsupported query parameter', () => {
    expect(() => parseAdminAuditQuery({ bogus: 'x' })).toThrow(AdminAuditQueryError)
  })

  it('rejects a malformed timestamp', () => {
    expect(() => parseAdminAuditQuery({ from: 'not-a-date' })).toThrow(AdminAuditQueryError)
  })

  it('caps limit at the maximum page size', () => {
    expect(() => parseAdminAuditQuery({ limit: String(MAX_ADMIN_AUDIT_PAGE_SIZE + 1) }))
      .toThrow(AdminAuditQueryError)
    expect(parseAdminAuditQuery({ limit: String(MAX_ADMIN_AUDIT_PAGE_SIZE) }).limit)
      .toBe(MAX_ADMIN_AUDIT_PAGE_SIZE)
  })

  it('rejects a non-positive-integer limit', () => {
    expect(() => parseAdminAuditQuery({ limit: '0' })).toThrow(AdminAuditQueryError)
    expect(() => parseAdminAuditQuery({ limit: 'abc' })).toThrow(AdminAuditQueryError)
  })

  it('round-trips a cursor through the query parser', () => {
    const encoded = encodeAuditCursor({ createdAt: new Date('2026-08-23T12:00:00.000Z'), id: UUID })
    expect(parseAdminAuditQuery({ cursor: encoded }).cursor).toEqual({
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      id: UUID,
    })
  })

  it('rejects a malformed cursor', () => {
    expect(() => parseAdminAuditQuery({ cursor: 'not-base64url-json!!' })).toThrow(AdminAuditQueryError)
  })
})

describe('encodeAuditCursor / decodeAuditCursor', () => {
  it('round-trips date and id', () => {
    const cursor = { createdAt: new Date('2026-08-23T12:00:00.000Z'), id: UUID }
    expect(decodeAuditCursor(encodeAuditCursor(cursor))).toEqual(cursor)
  })

  it('rejects a cursor id that is not a UUID', () => {
    expect(() => encodeAuditCursor({ createdAt: new Date(), id: 'not-a-uuid' }))
      .toThrow(AdminAuditQueryError)
  })

  it('rejects tampered base64url payloads', () => {
    const encoded = encodeAuditCursor({ createdAt: new Date('2026-08-23T12:00:00.000Z'), id: UUID })
    expect(() => decodeAuditCursor(encoded.slice(0, -2))).toThrow(AdminAuditQueryError)
  })

  it('rejects cursors with extra fields', () => {
    const tampered = Buffer.from(JSON.stringify({
      createdAt: '2026-08-23T12:00:00.000Z',
      id: UUID,
      extra: 'x',
    }), 'utf8').toString('base64url')
    expect(() => decodeAuditCursor(tampered)).toThrow(AdminAuditQueryError)
  })
})

describe('mapAdminAuditSearchPage', () => {
  const item = {
    id: 'audit-1',
    actorId: 'actor-1',
    actorDisplay: 'Actor One',
    action: 'module.updated',
    targetType: 'module',
    targetId: 'tickets',
    before: { enabled: true },
    after: { enabled: false },
    reason: 'Routine rollout',
    reasonRequired: true,
    requestId: null,
    createdAt: new Date('2026-08-23T12:00:00.000Z'),
  }

  it('maps a repository continuation row to an opaque cursor', () => {
    const response = mapAdminAuditSearchPage({
      items: [item],
      nextCursorRow: { createdAt: new Date('2026-08-23T11:59:00.000Z'), id: UUID },
    })
    expect(response.items).toEqual([item])
    expect(response.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeAuditCursor(response.nextCursor!)).toEqual({
      createdAt: new Date('2026-08-23T11:59:00.000Z'),
      id: UUID,
    })
  })

  it('returns null when there is no continuation row', () => {
    expect(mapAdminAuditSearchPage({ items: [item], nextCursorRow: null })).toEqual({
      items: [item],
      nextCursor: null,
    })
  })
})

describe('createAdminAuditRouteHandler', () => {
  function createDeps(overrides: Record<string, unknown> = {}) {
    return {
      authorize: async () => undefined,
      getQuery: () => ({}),
      getRepositories: () => ({
        adminAudit: {
          searchPage: async () => ({ items: [], nextCursorRow: null }),
        },
      }),
      createHttpError: (statusCode: number, statusMessage: string) => ({ statusCode, statusMessage }),
      logError: () => undefined,
      ...overrides,
    }
  }

  it('authorizes before query parsing and repository resolution', async () => {
    const order: string[] = []
    const handler = createAdminAuditRouteHandler(createDeps({
      authorize: async () => {
        order.push('authorize')
        throw new Error('denied')
      },
      getQuery: () => {
        order.push('query')
        return {}
      },
      getRepositories: () => {
        order.push('repositories')
        return null
      },
    }))

    await expect(handler({})).rejects.toThrow('denied')
    expect(order).toEqual(['authorize'])
  })

  it('returns parser 400 before checking unavailable repositories', async () => {
    let repositoryChecks = 0
    const handler = createAdminAuditRouteHandler(createDeps({
      getQuery: () => ({ limit: '0' }),
      getRepositories: () => {
        repositoryChecks += 1
        return null
      },
    }))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(repositoryChecks).toBe(0)
  })

  it('returns 503 for a valid authorized query when repositories are unavailable', async () => {
    const handler = createAdminAuditRouteHandler(createDeps({ getRepositories: () => null }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 503,
      statusMessage: 'Database unavailable (NUXT_DATABASE_URL not set).',
    })
  })

  it('passes normalized values to searchPage and maps its continuation cursor', async () => {
    let repositoryInput: unknown
    const continuation = { createdAt: new Date('2026-08-23T11:59:00.000Z'), id: UUID }
    const handler = createAdminAuditRouteHandler(createDeps({
      getQuery: () => ({ actorId: '  123  ', action: 'module.updated', limit: '10' }),
      getRepositories: () => ({
        adminAudit: {
          searchPage: async (input: unknown) => {
            repositoryInput = input
            return { items: [], nextCursorRow: continuation }
          },
        },
      }),
    }))

    const response = await handler({})
    expect(repositoryInput).toEqual({
      actorId: '123',
      action: 'module.updated',
      targetType: null,
      targetId: null,
      from: null,
      to: null,
      limit: 10,
      cursor: null,
    })
    expect(Object.keys(response).sort()).toEqual(['items', 'nextCursor'])
    expect(decodeAuditCursor(response.nextCursor!)).toEqual(continuation)
  })

  it('returns a sanitized 500 when repository search fails', async () => {
    const secret = 'postgres://operator:password@private-db/modus'
    const handler = createAdminAuditRouteHandler(createDeps({
      getRepositories: () => ({
        adminAudit: {
          searchPage: async () => {
            throw new Error(secret)
          },
        },
      }),
    }))

    let thrown: unknown
    try {
      await handler({})
    } catch (error) {
      thrown = error
    }
    expect(thrown).toEqual({ statusCode: 500, statusMessage: 'Failed to fetch audit events.' })
    expect(JSON.stringify(thrown)).not.toContain(secret)
  })
})
