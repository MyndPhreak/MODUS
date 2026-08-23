import {
  AdminLogQueryError,
  encodeLogCursor,
  parseAdminLogQuery,
  type AdminLogQuery,
} from './query'

export interface LogSearchPage<T> {
  items: T[]
  nextCursorRow: { timestamp: Date; id: string } | null
}

interface RouteError extends Error {
  statusCode: number
  statusMessage: string
}

export interface AdminLogRouteDependencies<Event, Item> {
  authorize: (event: Event) => Promise<unknown>
  getQuery: (event: Event) => Parameters<typeof parseAdminLogQuery>[0]
  getRepositories: () => {
    logs: {
      searchPage: (input: AdminLogQuery) => Promise<LogSearchPage<Item>>
    }
  } | null
  logError: (error: unknown) => void
  createHttpError?: (statusCode: number, statusMessage: string) => unknown
}

function defaultHttpError(statusCode: number, statusMessage: string): RouteError {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage })
}

export function mapAdminLogSearchPage<T>(page: LogSearchPage<T>): {
  items: T[]
  nextCursor: string | null
} {
  return {
    items: page.items,
    nextCursor: page.nextCursorRow
      ? encodeLogCursor(page.nextCursorRow)
      : null,
  }
}

export function createAdminLogRouteHandler<Event, Item>(
  deps: AdminLogRouteDependencies<Event, Item>,
) {
  const createHttpError = deps.createHttpError ?? defaultHttpError

  return async (event: Event): Promise<{ items: Item[]; nextCursor: string | null }> => {
    await deps.authorize(event)

    let query: AdminLogQuery
    try {
      query = parseAdminLogQuery(deps.getQuery(event))
    } catch (error) {
      if (error instanceof AdminLogQueryError) {
        throw createHttpError(400, error.message)
      }
      throw error
    }

    const repositories = deps.getRepositories()
    if (!repositories) {
      throw createHttpError(
        503,
        'Database unavailable (NUXT_DATABASE_URL not set).',
      )
    }

    try {
      return mapAdminLogSearchPage(await repositories.logs.searchPage(query))
    } catch (error) {
      deps.logError(error)
      throw createHttpError(500, 'Failed to fetch logs.')
    }
  }
}
