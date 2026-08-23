import { describe, expect, it } from 'vitest'
import { decodeLogCursor } from './query'
import { mapAdminLogSearchPage } from './api-response'

describe('mapAdminLogSearchPage', () => {
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
