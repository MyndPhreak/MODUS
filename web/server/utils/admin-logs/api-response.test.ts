import { describe, expect, it } from 'vitest'
import { decodeLogCursor } from './query'
import {
  createAdminLogRouteHandler,
  mapAdminLogSearchPage,
} from './api-response'

const item = {
  id: 'log-2',
  $id: 'log-2',
  guildId: '123456789012345678',
  message: 'Shard reconnected',
  level: 'info' as const,
  shardId: 2,
  source: 'gateway',
  timestamp: new Date('2026-08-23T12:00:00.000Z'),
}

describe('mapAdminLogSearchPage', () => {
  it('maps a repository continuation row to an opaque cursor', () => {
    const response = mapAdminLogSearchPage({
      items: [item],
      nextCursorRow: {
        timestamp: new Date('2026-08-23T11:59:00.000Z'),
        id: 'log-1',
      },
    })

    expect(response.items).toEqual([item])
    expect(response.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(response.nextCursor).not.toContain('log-1')
    expect(decodeLogCursor(response.nextCursor!)).toEqual({
      timestamp: new Date('2026-08-23T11:59:00.000Z'),
      id: 'log-1',
    })
  })

  it('returns null when the repository has no continuation row', () => {
    expect(mapAdminLogSearchPage({
      items: [item],
      nextCursorRow: null,
    })).toEqual({
      items: [item],
      nextCursor: null,
    })
  })
})

describe('createAdminLogRouteHandler', () => {
  function createDeps(overrides: Record<string, unknown> = {}) {
    return {
      authorize: async () => undefined,
      getQuery: () => ({}),
      getRepositories: () => ({
        logs: {
          searchPage: async () => ({ items: [], nextCursorRow: null }),
        },
      }),
      createHttpError: (statusCode: number, statusMessage: string) => ({
        statusCode,
        statusMessage,
      }),
      logError: () => undefined,
      ...overrides,
    }
  }

  it('authorizes before query parsing and repository resolution', async () => {
    const order: string[] = []
    const handler = createAdminLogRouteHandler(createDeps({
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

    await expect(handler({ requestId: 'denied' })).rejects.toThrow('denied')
    expect(order).toEqual(['authorize'])
  })

  it('returns parser 400 before checking unavailable repositories', async () => {
    let repositoryChecks = 0
    const handler = createAdminLogRouteHandler(createDeps({
      getQuery: () => ({ level: 'debug' }),
      getRepositories: () => {
        repositoryChecks += 1
        return null
      },
    }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 400,
      statusMessage: 'level must be info, warn, or error.',
    })
    expect(repositoryChecks).toBe(0)
  })

  it('returns 503 for a valid authorized query when repositories are unavailable', async () => {
    const handler = createAdminLogRouteHandler(createDeps({
      getRepositories: () => null,
    }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 503,
      statusMessage: 'Database unavailable (NUXT_DATABASE_URL not set).',
    })
  })

  it('passes normalized values to searchPage and maps its continuation cursor', async () => {
    let repositoryInput: unknown
    const continuation = {
      timestamp: new Date('2026-08-23T11:59:00.000Z'),
      id: 'log-1',
    }
    const handler = createAdminLogRouteHandler(createDeps({
      getQuery: () => ({
        search: '  reconnect  ',
        level: 'warn',
        shardId: '2',
        from: '2026-08-22T00:00:00.000Z',
        limit: '25',
      }),
      getRepositories: () => ({
        logs: {
          searchPage: async (input: unknown) => {
            repositoryInput = input
            return { items: [item], nextCursorRow: continuation }
          },
        },
      }),
    }))

    const response = await handler({})

    expect(repositoryInput).toEqual({
      search: 'reconnect',
      level: 'warn',
      scope: 'all',
      guildId: null,
      shardId: 2,
      source: null,
      from: new Date('2026-08-22T00:00:00.000Z'),
      to: null,
      limit: 25,
      cursor: null,
    })
    expect(Object.keys(response).sort()).toEqual(['items', 'nextCursor'])
    expect(response.items).toEqual([item])
    expect(decodeLogCursor(response.nextCursor!)).toEqual(continuation)
  })

  it('returns a sanitized 500 when repository search fails', async () => {
    const secret = 'postgres://operator:password@private-db/modus'
    const handler = createAdminLogRouteHandler(createDeps({
      getRepositories: () => ({
        logs: {
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

    expect(thrown).toEqual({
      statusCode: 500,
      statusMessage: 'Failed to fetch logs.',
    })
    expect(JSON.stringify(thrown)).not.toContain(secret)
  })
})
