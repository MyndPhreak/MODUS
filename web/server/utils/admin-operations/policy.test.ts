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
      requiredDependencyKeys: ['postgres', 'r2'],
      dependencies: [
        {
          key: 'postgres',
          label: 'Postgres',
          status: 'unhealthy',
          checkedAt: now,
          message: 'Connection check failed.',
        },
      ],
    })

    expect(result.overallStatus).toBe('unhealthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['dependency:postgres'])
  })

  it('keeps unconfigured Redis informational', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 1,
      activeShards: [{ id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' }],
      requiredDependencyKeys: ['postgres', 'r2'],
      dependencies: [
        {
          key: 'redis',
          label: 'Redis',
          status: 'unconfigured',
          checkedAt: now,
          message: 'Redis is not configured.',
        },
      ],
    })

    expect(result.overallStatus).toBe('healthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual([])
  })

  it('degrades when a shard heartbeat is stale', () => {
    const result = deriveOverallStatus({
      now,
      expectedShardCount: 2,
      activeShards: [
        { id: 0, heartbeatAt: freshHeartbeat, version: '1.21.0' },
        { id: 1, heartbeatAt: staleHeartbeat, version: '1.21.0' },
      ],
      requiredDependencyKeys: ['postgres', 'r2'],
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
      requiredDependencyKeys: ['postgres', 'r2'],
      dependencies: [],
    })

    expect(result.overallStatus).toBe('degraded')
    expect(result.attentionItems.map((item) => item.key)).toEqual(['shards:version-disagreement'])
  })
})
