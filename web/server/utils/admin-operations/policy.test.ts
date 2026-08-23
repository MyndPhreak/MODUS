import { describe, expect, it } from 'vitest'
import { deriveOverallStatus } from './policy'

const now = '2026-08-23T12:00:00.000Z'
const freshHeartbeat = '2026-08-23T11:59:30.000Z'
const staleHeartbeat = '2026-08-23T11:54:00.000Z'

describe('deriveOverallStatus', () => {
  it('marks a required dependency failure unhealthy with a stable attention key', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 1,
      activeShards: [{ id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' }],
      dependencies: [
        {
          key: 'postgres',
          label: 'Postgres',
          required: true,
          status: 'unhealthy',
          checkedAt: now,
          message: 'Connection check failed.',
        },
      ],
    })

    expect(result.overallStatus).toBe('unhealthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['dependency:postgres'])
  })

  it('degrades for a degraded required dependency with a stable attention key', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 1,
      activeShards: [{ id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' }],
      dependencies: [
        {
          key: 'postgres',
          label: 'Postgres',
          required: true,
          status: 'degraded',
          checkedAt: now,
          message: 'Connection latency is elevated.',
        },
      ],
    })

    expect(result.overallStatus).toBe('degraded')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['dependency:postgres'])
  })

  it('keeps unconfigured Redis informational', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 1,
      activeShards: [{ id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' }],
      dependencies: [
        {
          key: 'redis',
          label: 'Redis',
          required: false,
          status: 'unconfigured',
          checkedAt: now,
          message: 'Redis is not configured.',
        },
      ],
    })

    expect(result.overallStatus).toBe('healthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual([])
  })

  it('degrades when no fleet telemetry has been reported', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 0,
      activeShards: [],
      dependencies: [],
    })

    expect(result.overallStatus).toBe('degraded')
    expect(result.attentionItems).toEqual([{
      key: 'fleet:no-telemetry',
      severity: 'degraded',
      title: 'Fleet telemetry is unavailable',
      description: 'No active shard or version telemetry has been reported.',
    }])
  })

  it('degrades with a stable missing-shards incident and fleet counts', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 3,
      activeShards: [
        { id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' },
        { id: 1, heartbeatAt: freshHeartbeat, version: '1.21.0' },
      ],
      dependencies: [],
    })

    expect(result.overallStatus).toBe('degraded')
    expect(result.fleet.shards).toEqual({ status: 'degraded', active: 2, expected: 3, stale: 0 })
    expect(result.attentionItems).toEqual([{
      key: 'shards:missing',
      severity: 'degraded',
      title: 'Shards are missing',
      description: '2 of 3 expected shards are reporting.',
    }])
  })

  it('degrades when a shard heartbeat is stale', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 2,
      activeShards: [
        { id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' },
        { id: 1, heartbeatAt: staleHeartbeat, version: '1.21.0' },
      ],
      dependencies: [],
    })

    expect(result.overallStatus).toBe('degraded')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['shards:stale'])
  })

  it('degrades when active shards disagree on version', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 2,
      activeShards: [
        { id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' },
        { id: 1, heartbeatAt: freshHeartbeat, version: '1.20.0' },
      ],
      dependencies: [],
    })

    expect(result.overallStatus).toBe('degraded')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['shards:version-disagreement'])
  })

  it('uses dependency metadata instead of a separate required-key policy', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 1,
      activeShards: [{ id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' }],
      dependencies: [
        {
          key: 'postgres',
          label: 'Postgres',
          required: true,
          status: 'unhealthy',
          checkedAt: now,
          message: 'Connection check failed.',
        },
        {
          key: 'redis',
          label: 'Redis',
          required: false,
          status: 'unhealthy',
          checkedAt: now,
          message: 'Optional cache is unavailable.',
        },
      ],
    })

    expect(result.overallStatus).toBe('unhealthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['dependency:postgres'])
  })

  it('returns the freshness and version view used by the overview response', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 4,
      activeShards: [
        { id: 0, heartbeatAt: '2026-08-23T11:58:00.000Z', version: '1.21.0' },
        { id: 1, heartbeatAt: freshHeartbeat, version: '1.20.0' },
        { id: 2, heartbeatAt: '2026-08-23T11:57:59.999Z', version: '9.0.0' },
      ],
      dependencies: [],
    })

    expect(result.fleet).toEqual({
      telemetryAvailable: true,
      shards: { status: 'degraded', active: 2, expected: 4, stale: 1 },
      versions: { active: ['1.20.0', '1.21.0'], disagreement: true },
    })
    expect(result.attentionItems.map((item) => item.key)).toEqual([
      'shards:missing',
      'shards:stale',
      'shards:version-disagreement',
    ])
  })

  it('reduces the final status from generated and additional attention together', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 1,
      activeShards: [{ id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' }],
      dependencies: [],
      additionalAttentionItems: [{
        key: 'worker:failed',
        severity: 'unhealthy',
        title: 'Worker failed',
        description: 'A required worker stopped.',
      }],
    })

    expect(result.overallStatus).toBe('unhealthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['worker:failed'])
  })
})
