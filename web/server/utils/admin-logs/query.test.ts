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
      scope: 'all',
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

  it.each(['0', '-1', '1.5', 'many'])('rejects invalid lower or non-integer limit %j', (limit) => {
    expect(() => parseAdminLogQuery({ limit })).toThrow('limit')
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
    [{ scope: 'all', guildId: '123456789012345678' }, 'all scope'],
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

  it('accepts maximum text lengths and normalizes empty text', () => {
    const result = parseAdminLogQuery({
      search: 'x'.repeat(500),
      source: 'y'.repeat(100),
    })

    expect(result.search).toHaveLength(500)
    expect(result.source).toHaveLength(100)
    expect(parseAdminLogQuery({ search: '  ', source: '\t' })).toMatchObject({
      search: null,
      source: null,
    })
  })

  it('supports every scope and keeps guild combinations coherent', () => {
    expect(parseAdminLogQuery({ scope: 'all' }).scope).toBe('all')
    expect(parseAdminLogQuery({ scope: 'global' }).scope).toBe('global')
    expect(parseAdminLogQuery({ scope: 'guild' }).scope).toBe('guild')
    expect(parseAdminLogQuery({ guildId: '123456789012345678' }).scope).toBe('guild')
    expect(() => parseAdminLogQuery({
      scope: 'global',
      guildId: '123456789012345678',
    })).toThrow('global scope')
    expect(() => parseAdminLogQuery({
      scope: 'all',
      guildId: '123456789012345678',
    })).toThrow('all scope')
  })

  it('rejects unknown and duplicate query parameters', () => {
    expect(() => parseAdminLogQuery({ scpoe: 'guild' })).toThrow('scpoe')
    expect(() => parseAdminLogQuery({ level: ['warn', 'error'] })).toThrow('level')
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

  it('rejects oversized encoded cursors before decoding', () => {
    expect(() => decodeLogCursor('A'.repeat(10_000))).toThrow('too long')
  })

  it('accepts the maximum cursor ID and rejects larger encode inputs', () => {
    const timestamp = new Date('2026-08-23T10:15:30.123Z')
    const cursor = encodeLogCursor({ timestamp, id: 'x'.repeat(256) })

    expect(decodeLogCursor(cursor).id).toHaveLength(256)
    expect(() => encodeLogCursor({ timestamp, id: 'x'.repeat(257) })).toThrow('cursor')
    expect(() => encodeLogCursor({ timestamp: new Date('invalid'), id: 'row-1' })).toThrow('cursor')
  })

  it.each([
    ['maximum-length Unicode', '😀'.repeat(128)],
    ['maximum-length JSON-escaped', '\0'.repeat(256)],
  ])('round-trips %s cursor IDs accepted by the encoder', (_case, id) => {
    const timestamp = new Date('2026-08-23T10:15:30.123Z')
    const encoded = encodeLogCursor({ timestamp, id })

    expect(decodeLogCursor(encoded)).toEqual({ timestamp, id })
  })

  it('rejects Date values outside the timestamp grammar shared with the decoder', () => {
    expect(() => encodeLogCursor({
      timestamp: new Date('+010000-01-01T00:00:00.000Z'),
      id: 'row-1',
    })).toThrow('cursor timestamp')
  })

  it.each([
    Buffer.from('null').toString('base64url'),
    Buffer.from('[]').toString('base64url'),
    Buffer.from(JSON.stringify({
      timestamp: '2026-08-23T10:15:30.123Z',
      id: 'row-1',
      extra: true,
    })).toString('base64url'),
  ])('rejects cursor values outside the exact two-field object shape', (cursor) => {
    expect(() => decodeLogCursor(cursor)).toThrow('cursor')
  })
})
