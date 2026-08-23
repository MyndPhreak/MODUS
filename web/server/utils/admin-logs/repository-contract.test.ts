import { describe, expect, it } from 'vitest'
import {
  applyLogSearchContract,
  type LogDoc,
  type LogSearchInput,
} from '../../../../packages/db/src/repositories/logs'

const at = (value: string) => new Date(value)

function row(overrides: Partial<LogDoc> & Pick<LogDoc, '$id' | 'timestamp'>): LogDoc {
  const { $id, timestamp, ...rest } = overrides
  return {
    id: $id,
    $id,
    guildId: 'guild-1',
    message: 'ordinary message',
    level: 'info',
    shardId: null,
    source: null,
    timestamp,
    ...rest,
  }
}

function input(overrides: Partial<LogSearchInput> = {}): LogSearchInput {
  return {
    search: null,
    level: null,
    scope: 'global',
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

describe('admin log repository contract', () => {
  it('orders equal timestamps by descending ID and excludes the cursor row and newer ties', () => {
    const timestamp = at('2026-08-23T12:00:00.000Z')
    const rows = [
      row({ $id: 'a', timestamp }),
      row({ $id: 'd', timestamp }),
      row({ $id: 'b', timestamp }),
      row({ $id: 'c', timestamp }),
      row({ $id: 'older', timestamp: at('2026-08-23T11:59:59.000Z') }),
    ]

    const first = applyLogSearchContract(rows, input({ limit: 2 }))
    expect(first.items.map(item => item.$id)).toEqual(['d', 'c'])
    expect(first.nextCursorRow).toEqual({ timestamp, id: 'c' })

    const second = applyLogSearchContract(rows, input({
      limit: 2,
      cursor: first.nextCursorRow,
    }))
    expect(second.items.map(item => item.$id)).toEqual(['b', 'a'])
    expect(second.nextCursorRow).toEqual({ timestamp, id: 'a' })

    const third = applyLogSearchContract(rows, input({
      limit: 2,
      cursor: second.nextCursorRow,
    }))
    expect(third.items.map(item => item.$id)).toEqual(['older'])
    expect(third.nextCursorRow).toBeNull()
  })

  it('applies every normalized optional predicate', () => {
    const matching = row({
      $id: 'matching',
      timestamp: at('2026-08-23T12:30:00.000Z'),
      guildId: '1234',
      message: 'Worker RETRY completed',
      level: 'warn',
      shardId: 3,
      source: 'retention',
    })
    const candidates = [
      matching,
      row({ ...matching, id: 'wrong-message', $id: 'wrong-message', message: 'unrelated' }),
      row({ ...matching, id: 'wrong-level', $id: 'wrong-level', level: 'error' }),
      row({ ...matching, id: 'wrong-guild', $id: 'wrong-guild', guildId: '9999' }),
      row({ ...matching, id: 'wrong-shard', $id: 'wrong-shard', shardId: 4 }),
      row({ ...matching, id: 'wrong-source', $id: 'wrong-source', source: 'gateway' }),
      row({ ...matching, id: 'too-early', $id: 'too-early', timestamp: at('2026-08-23T11:59:59.999Z') }),
      row({ ...matching, id: 'too-late', $id: 'too-late', timestamp: at('2026-08-23T13:00:00.001Z') }),
    ]

    const result = applyLogSearchContract(candidates, input({
      search: 'retry',
      level: 'warn',
      scope: 'guild',
      guildId: '1234',
      shardId: 3,
      source: 'retention',
      from: at('2026-08-23T12:00:00.000Z'),
      to: at('2026-08-23T13:00:00.000Z'),
    }))

    expect(result.items.map(item => item.$id)).toEqual(['matching'])
  })

  it('only exposes a next cursor when limit plus one proves another row exists', () => {
    const rows = ['04', '03', '02', '01'].map(id => row({
      $id: id,
      timestamp: at(`2026-08-23T12:00:${id}.000Z`),
    }))

    const fullPage = applyLogSearchContract(rows, input({ limit: 3 }))
    expect(fullPage.items.map(item => item.$id)).toEqual(['04', '03', '02'])
    expect(fullPage.nextCursorRow).toEqual({
      timestamp: at('2026-08-23T12:00:02.000Z'),
      id: '02',
    })

    const finalPage = applyLogSearchContract(rows.slice(0, 3), input({ limit: 3 }))
    expect(finalPage.items).toHaveLength(3)
    expect(finalPage.nextCursorRow).toBeNull()
  })
})
