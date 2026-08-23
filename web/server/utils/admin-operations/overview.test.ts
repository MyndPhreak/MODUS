import { describe, expect, it } from 'vitest'
import { PromiseTtlCache } from './cache'
import type { AdminOverviewResponse, DependencyHealth } from './types'
import { buildAdminOverview, createAdminOverviewRouteHandler } from './overview'

const now = new Date('2026-08-23T12:00:00.000Z')
const oneDayMs = 24 * 60 * 60 * 1000

function dependency(
  key: string,
  label: string,
  status: DependencyHealth['status'] = 'healthy',
): DependencyHealth {
  return {
    key,
    label,
    status,
    latencyMs: 8,
    checkedAt: now.toISOString(),
    message: status === 'healthy' ? `${label} is reachable.` : `${label} probe failed.`,
  }
}

function botStatus(
  shardId: number,
  lastSeen: Date,
  version: string,
  totalShards = 4,
) {
  return {
    id: `shard-${shardId}`,
    botId: 'modus-bot',
    lastSeen,
    version,
    shardId,
    totalShards,
    $id: `shard-${shardId}`,
    bot_id: 'modus-bot',
    last_seen: lastSeen.toISOString(),
    shard_id: shardId,
    total_shards: totalShards,
  }
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const dependencies = [
    dependency('postgres', 'Postgres'),
    dependency('redis', 'Redis'),
    dependency('r2', 'R2', 'unhealthy'),
    dependency('discord', 'Discord'),
    dependency('bot-http', 'Bot HTTP'),
    dependency('lavalink', 'Lavalink'),
  ]

  return {
    repositories: {
      botStatus: {
        listAll: async () => [
          botStatus(0, new Date(now.getTime() - 120_000), '1.21.0'),
          botStatus(1, new Date(now.getTime() - 30_000), '1.20.0'),
          botStatus(2, new Date(now.getTime() - 120_001), '1.21.0'),
        ],
      },
      servers: {
        getAdminCounts: async (since: Date) => ({
          total: 25,
          online: 20,
          offline: 5,
          premium: 4,
          registeredSince: since.getTime() === now.getTime() - oneDayMs ? 2 : 7,
        }),
      },
      logs: {
        countByLevelSince: async (since: Date) => ({
          info: 0,
          warn: since.getTime() === now.getTime() - oneDayMs ? 3 : 8,
          error: since.getTime() === now.getTime() - oneDayMs ? 2 : 6,
          oldestTimestamp: new Date('2026-08-01T00:00:00.000Z'),
        }),
        listAll: async () => [],
      },
      systemFlags: {
        getFlag: async () => null,
      },
    },
    runProbes: async () => dependencies,
    getR2Usage: async () => ({
      status: 'available' as const,
      objectCount: 12,
      uploadCount: 1,
      payloadSizeBytes: 1_024,
      payloadSizeFormatted: '1 KiB',
      metadataSizeBytes: 128,
      metadataSizeFormatted: '128 B',
      sampledAt: '2026-08-23T11:45:00.000Z',
    }),
    ...overrides,
  }
}

describe('buildAdminOverview', () => {
  it('aggregates shard freshness, versions, repository summaries, and isolated probe failures', async () => {
    const result = await buildAdminOverview(createDeps(), now)

    expect(result.generatedAt).toBe('2026-08-23T12:00:00.000Z')
    expect(result.fleet).toEqual({
      shards: { active: 2, expected: 4, stale: 1 },
      versions: { active: ['1.20.0', '1.21.0'], disagreement: true },
      servers: { registered: 25, online: 20, offline: 5, premium: 4 },
      music: { enabled: true, reason: null, updatedAt: null },
    })
    expect(result.dependencies).toHaveLength(6)
    expect(result.dependencies.find((item) => item.key === 'postgres')?.status).toBe('healthy')
    expect(result.dependencies.find((item) => item.key === 'r2')?.status).toBe('unhealthy')
    expect(result.r2Usage.status).toBe('available')
    expect(result.recentSummaries).toEqual({
      last24Hours: {
        errors: 2,
        warnings: 3,
        registeredServers: 2,
        historyComplete: true,
      },
      last7Days: {
        errors: 6,
        warnings: 8,
        registeredServers: 7,
        historyComplete: true,
      },
    })
    expect(result.overallStatus).toBe('unhealthy')
    expect(result.attentionItems.map((item) => item.key)).toEqual([
      'dependency:r2',
      'shards:missing',
      'shards:stale',
      'shards:version-disagreement',
    ])
  })

  it('adds conservative activity, subsystem, and retention attention without route inference', async () => {
    const recentRetentionError = {
      id: 'log-1',
      $id: 'log-1',
      guildId: 'global',
      message: 'Recording retention sweep failed',
      level: 'error',
      timestamp: new Date('2026-08-23T11:30:00.000Z'),
      shardId: 0,
      source: 'retention',
    }
    const deps = createDeps({
      repositories: {
        botStatus: {
          listAll: async () => [
            botStatus(0, new Date(now.getTime() - 5_000), '1.21.0', 1),
          ],
        },
        servers: {
          getAdminCounts: async () => ({
            total: 1,
            online: 1,
            offline: 0,
            premium: 0,
            registeredSince: 0,
          }),
        },
        logs: {
          countByLevelSince: async (since: Date) => ({
            info: 0,
            warn: 0,
            error: since.getTime() === now.getTime() - oneDayMs ? 10 : 12,
            oldestTimestamp: new Date('2026-08-01T00:00:00.000Z'),
          }),
          listAll: async () => [recentRetentionError],
        },
        systemFlags: {
          getFlag: async () => ({
            key: 'music',
            enabled: false,
            reason: 'lavalink-health-check',
            updatedAt: new Date('2026-08-23T11:15:00.000Z'),
          }),
        },
      },
      runProbes: async () => [
        dependency('postgres', 'Postgres'),
        dependency('redis', 'Redis', 'unconfigured'),
        dependency('r2', 'R2'),
      ],
    })

    const result = await buildAdminOverview(deps, now)

    expect(result.overallStatus).toBe('degraded')
    expect(result.attentionItems.map((item) => item.key)).toEqual([
      'logs:elevated-errors',
      'music:disabled',
      'logs:retention-error',
    ])
    expect(result.attentionItems[2]).toMatchObject({
      occurredAt: '2026-08-23T11:30:00.000Z',
      href: '/dashboard/admin/logs?source=retention&level=error',
    })
  })
})

describe('createAdminOverviewRouteHandler', () => {
  it('authorizes before repository access and does no operational work when denied', async () => {
    const order: string[] = []
    const handler = createAdminOverviewRouteHandler({
      authorize: async () => {
        order.push('authorize')
        throw new Error('denied')
      },
      getRepositories: () => {
        order.push('repositories')
        return {} as never
      },
      loadOverview: async () => {
        order.push('load')
        return {} as AdminOverviewResponse
      },
      cache: new PromiseTtlCache(),
      now: () => now,
      logError: () => undefined,
    })

    await expect(handler({ requestId: 'denied' })).rejects.toThrow('denied')
    expect(order).toEqual(['authorize'])
  })

  it('authorizes every request while concurrent authorized requests share aggregate work', async () => {
    let authorizeCalls = 0
    let loadCalls = 0
    let releaseLoad: ((response: AdminOverviewResponse) => void) | undefined
    const response = { generatedAt: now.toISOString() } as AdminOverviewResponse
    const handler = createAdminOverviewRouteHandler({
      authorize: async () => {
        authorizeCalls += 1
      },
      getRepositories: () => ({} as never),
      loadOverview: async () => {
        loadCalls += 1
        return new Promise<AdminOverviewResponse>((resolve) => {
          releaseLoad = resolve
        })
      },
      cache: new PromiseTtlCache(),
      now: () => now,
      logError: () => undefined,
    })

    const first = handler({ requestId: 'first' })
    const second = handler({ requestId: 'second' })
    await Promise.resolve()
    await Promise.resolve()

    expect(authorizeCalls).toBe(2)
    expect(loadCalls).toBe(1)
    releaseLoad?.(response)
    await expect(Promise.all([first, second])).resolves.toEqual([response, response])
  })

  it('returns sanitized service errors for unavailable repositories and failed aggregation', async () => {
    const unavailableHandler = createAdminOverviewRouteHandler({
      authorize: async () => undefined,
      getRepositories: () => null,
      loadOverview: async () => ({} as AdminOverviewResponse),
      cache: new PromiseTtlCache(),
      now: () => now,
      logError: () => undefined,
    })

    await expect(unavailableHandler({})).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Admin operations data is unavailable.',
    })

    const secret = 'postgres://operator:password@private-db/modus'
    const failedHandler = createAdminOverviewRouteHandler({
      authorize: async () => undefined,
      getRepositories: () => ({} as never),
      loadOverview: async () => {
        throw new Error(secret)
      },
      cache: new PromiseTtlCache(),
      now: () => now,
      logError: () => undefined,
    })

    let thrown: unknown
    try {
      await failedHandler({})
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to load the admin operations overview.',
    })
    expect(JSON.stringify(thrown)).not.toContain(secret)
  })
})
