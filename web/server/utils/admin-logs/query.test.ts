import { describe, expect, it } from 'vitest'
import {
  decodeLogCursor,
  encodeLogCursor,
  parseAdminLogQuery,
} from './query'

describe('parseAdminLogQuery', () => {
  it('uses bounded defaults when filters are absent', () => {
    expect(parseAdminLogQuery({})).toEqual({
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
    })
  })

  it('accepts the maximum page size and rejects values above it', () => {
    expect(parseAdminLogQuery({ limit: '200' }).limit).toBe(200)
    expect(() => parseAdminLogQuery({ limit: '201' })).toThrow('limit')
  })

  it('trims and normalizes valid filters', () => {
    expect(parseAdminLogQuery({
      search: '  reconnect failed  ',
      level: 'warn',
      scope: 'guild',
      guildId: ' 123456789012345678 ',
      shardId: '4',
      source: ' retention-worker ',
      from: '2026-08-20T10:00:00Z',
      to: '2026-08-23T10:00:00.000Z',
      limit: '25',
    })).toEqual({
      search: 'reconnect failed',
      level: 'warn',
      scope: 'guild',
      guildId: '123456789012345678',
      shardId: 4,
      source: 'retention-worker',
      from: new Date('2026-08-20T10:00:00.000Z'),
      to: new Date('2026-08-23T10:00:00.000Z'),
      limit: 25,
      cursor: null,
    })
  })

  it.each([
    [{ level: 'debug' }, 'level'],
    [{ scope: 'server' }, 'scope'],
    [{ scope: 'guild' }, 'guildId'],
    [{ shardId: '-1' }, 'shardId'],
    [{ shardId: '1.5' }, 'shardId'],
    [{ from: 'yesterday' }, 'from'],
    [{ to: '2026-08-23' }, 'to'],
    [{ from: '2026-02-30T00:00:00Z' }, 'from'],
    [{ from: '2026-08-24T00:00:00Z', to: '2026-08-23T00:00:00Z' }, 'range'],
  ])('rejects invalid query %#', (query, message) => {
    expect(() => parseAdminLogQuery(query)).toThrow(message)
  })

  it('rejects text filters beyond their bounded lengths', () => {
    expect(() => parseAdminLogQuery({ search: 'x'.repeat(501) })).toThrow('search')
    expect(() => parseAdminLogQuery({ source: 'x'.repeat(101) })).toThrow('source')
  })
})

describe('log cursors', () => {
  it('round-trips an opaque timestamp and ID cursor', () => {
    const cursor = encodeLogCursor({
      timestamp: new Date('2026-08-23T10:15:30.123Z'),
      id: '829f5ea1-760f-4a92-bf77-d683b18e5167',
    })

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(cursor).not.toContain('2026-08-23')
    expect(decodeLogCursor(cursor)).toEqual({
      timestamp: new Date('2026-08-23T10:15:30.123Z'),
      id: '829f5ea1-760f-4a92-bf77-d683b18e5167',
    })
    expect(parseAdminLogQuery({ cursor }).cursor).toEqual(decodeLogCursor(cursor))
  })

  it.each([
    '',
    'not-base64url!',
    Buffer.from('{"timestamp":"not-a-date","id":"row-1"}').toString('base64url'),
    Buffer.from('{"timestamp":"2026-08-23T10:15:30.123Z","id":""}').toString('base64url'),
    Buffer.from('{"timestamp":"2026-08-23T10:15:30.123Z"}').toString('base64url'),
  ])('rejects malformed cursor %j', (cursor) => {
    expect(() => decodeLogCursor(cursor)).toThrow('cursor')
  })
})
