import { describe, expect, it } from 'vitest'
import { drizzle } from '../../../../packages/db/node_modules/drizzle-orm/node-postgres'
import {
  buildLogSearchQuery,
  finalizeLogSearchPage,
  type LogDoc,
  type LogSearchInput,
} from '../../../../packages/db/src/repositories/logs'

const at = (value: string) => new Date(value)

function input(overrides: Partial<LogSearchInput> = {}): LogSearchInput {
  return {
    search: null,
    level: null,
    scope: 'all',
    guildId: null,
    shardId: null,
    source: null,
    from: null,
    to: null,
    limit: 100,
    cursor: null,
    ...overrides,
  }
}

function row(id: string, timestamp: string): LogDoc {
  return {
    id,
    $id: id,
    guildId: '1234',
    message: 'message',
    level: 'info',
    timestamp: at(timestamp),
    shardId: null,
    source: null,
  }
}

describe('admin log repository query', () => {
  it('builds every filter, strict descending cursor predicate, stable order, and limit plus one', () => {
    const cursorTimestamp = at('2026-08-23T12:00:00.000Z')
    const query = buildLogSearchQuery(drizzle.mock(), input({
      search: 'retry',
      level: 'error',
      scope: 'guild',
      guildId: '1234',
      shardId: 0,
      source: 'retention',
      from: at('2026-08-22T00:00:00.000Z'),
      to: at('2026-08-23T13:00:00.000Z'),
      limit: 100,
      cursor: { timestamp: cursorTimestamp, id: 'cursor-id' },
    })).toSQL()

    expect(query.sql).toBe(
      'select "id", "guild_id", "message", "level", "timestamp", "shard_id", "source" from "logs" '
      + 'where ("logs"."message" ILIKE $1 ESCAPE \'\\\' and "logs"."level" = $2 and "logs"."guild_id" = $3 '
      + 'and "logs"."shard_id" = $4 and "logs"."source" = $5 and "logs"."timestamp" >= $6 '
      + 'and "logs"."timestamp" <= $7 and ("logs"."timestamp" < $8 or '
      + '("logs"."timestamp" = $9 and "logs"."id" < $10))) '
      + 'order by "logs"."timestamp" desc, "logs"."id" desc limit $11',
    )
    expect(query.params).toEqual([
      '%retry%',
      'error',
      '1234',
      0,
      'retention',
      '2026-08-22T00:00:00.000Z',
      '2026-08-23T13:00:00.000Z',
      '2026-08-23T12:00:00.000Z',
      '2026-08-23T12:00:00.000Z',
      'cursor-id',
      101,
    ])
  })

  it('escapes LIKE metacharacters so free-text search remains literal', () => {
    const query = buildLogSearchQuery(drizzle.mock(), input({
      search: '100% worker_1 \\',
    })).toSQL()

    expect(query.sql).toContain('"logs"."message" ILIKE $1 ESCAPE \'\\\'')
    expect(query.params).toEqual(['%100\\% worker\\_1 \\\\%', 101])
  })

  it('omits optional predicates for an unfiltered all-scope query', () => {
    const query = buildLogSearchQuery(drizzle.mock(), input({ limit: 1 })).toSQL()

    expect(query.sql).not.toContain(' where ')
    expect(query.sql).toContain('order by "logs"."timestamp" desc, "logs"."id" desc limit $1')
    expect(query.params).toEqual([2])
  })

  it('distinguishes global and all-guild scope without requiring a guild ID', () => {
    const globalQuery = buildLogSearchQuery(drizzle.mock(), input({ scope: 'global' })).toSQL()
    const guildQuery = buildLogSearchQuery(drizzle.mock(), input({ scope: 'guild' })).toSQL()

    expect(globalQuery.sql).toContain('where "logs"."guild_id" = $1')
    expect(globalQuery.params).toEqual(['global', 101])
    expect(guildQuery.sql).toContain('where "logs"."guild_id" <> $1')
    expect(guildQuery.params).toEqual(['global', 101])
  })
})

describe('admin log page finalization', () => {
  it('uses the extra row only to prove continuation and cursors from the last returned row', () => {
    const rows = [
      row('newest', '2026-08-23T12:00:03.000Z'),
      row('middle', '2026-08-23T12:00:02.000Z'),
      row('extra', '2026-08-23T12:00:01.000Z'),
    ]

    expect(finalizeLogSearchPage(rows, 2)).toEqual({
      items: rows.slice(0, 2),
      nextCursorRow: {
        timestamp: at('2026-08-23T12:00:02.000Z'),
        id: 'middle',
      },
    })
    expect(finalizeLogSearchPage(rows.slice(0, 2), 2).nextCursorRow).toBeNull()
  })
})
