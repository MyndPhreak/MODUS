import { describe, expect, it } from 'vitest'
import {
  filterAdminLogs,
  getFleetTelemetryPresentation,
  parseAdminLogQuery,
} from './admin-operations'

describe('getFleetTelemetryPresentation', () => {
  it('marks a completely empty fleet snapshot as unavailable instead of healthy', () => {
    expect(getFleetTelemetryPresentation({
      telemetryAvailable: false,
      shards: { status: 'unavailable', active: 0, expected: 0, stale: 0 },
      versions: { active: [], disagreement: false },
    })).toEqual({
      available: false,
      shardStatus: 'unavailable',
      shardValue: 'No telemetry',
      shardDetail: 'No shard telemetry has been reported.',
      versionValue: 'No telemetry',
      versionDetail: 'No active version telemetry has been reported.',
    })
  })

  it('retains the degraded shard presentation when telemetry reports a stale shard', () => {
    expect(getFleetTelemetryPresentation({
      telemetryAvailable: true,
      shards: { status: 'degraded', active: 1, expected: 2, stale: 1 },
      versions: { active: ['1.21.0'], disagreement: false },
    })).toMatchObject({
      available: true,
      shardStatus: 'degraded',
      shardValue: '1 / 2',
    })
  })
})

describe('parseAdminLogQuery', () => {
  it('initializes supported level, source, guild, and shard filters from a route query', () => {
    expect(parseAdminLogQuery({
      level: 'error',
      source: 'retention',
      guild: 'guild-123',
      shard: '2',
    })).toEqual({
      level: 'error',
      source: 'retention',
      guildId: 'guild-123',
      shardId: 2,
    })
  })

  it('ignores invalid query values instead of applying an unintended filter', () => {
    expect(parseAdminLogQuery({
      level: 'fatal',
      source: [''],
      guild: ' ',
      shard: '-1',
    })).toEqual({
      level: 'all',
      source: null,
      guildId: null,
      shardId: null,
    })
  })
})

describe('filterAdminLogs', () => {
  it('applies the query-derived source, guild, shard, and level filters together', () => {
    const filtered = filterAdminLogs([
      { id: 'match', level: 'error', source: 'retention', guildId: 'guild-123', shardId: 2 },
      { id: 'other-source', level: 'error', source: 'worker', guildId: 'guild-123', shardId: 2 },
      { id: 'other-guild', level: 'error', source: 'retention', guildId: 'guild-456', shardId: 2 },
    ], {
      level: 'error',
      source: 'retention',
      guildId: 'guild-123',
      shardId: 2,
    })

    expect(filtered.map((log) => log.id)).toEqual(['match'])
  })
})
