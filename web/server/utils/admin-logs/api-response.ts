import { encodeLogCursor } from './query'

interface LogSearchPage<T> {
  items: T[]
  nextCursorRow: { timestamp: Date; id: string } | null
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
