import type {
  BotStatusRepository,
  LogRepository,
  ServerRepository,
  SystemFlagsRepository,
} from '@modus/db'
import { PromiseTtlCache } from './cache'
import { deriveOverallStatus } from './policy'
import type { R2Usage } from './r2-usage'
import { buildRecentSummaries } from './summaries'
import type {
  AdminOverviewResponse,
  AttentionItem,
  DependencyHealth,
  ShardHealth,
} from './types'

const ELEVATED_ERROR_THRESHOLD = 10
const RECENT_RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000
const OVERVIEW_CACHE_KEY = 'admin-overview'
const OVERVIEW_CACHE_TTL_MS = 10_000

export interface AdminOverviewRepositories {
  botStatus: Pick<BotStatusRepository, 'listAll'>
  servers: Pick<ServerRepository, 'getAdminCounts'>
  logs: Pick<LogRepository, 'countByLevelSince' | 'listAll'>
  systemFlags: Pick<SystemFlagsRepository, 'getFlag'>
}

export interface BuildAdminOverviewDeps {
  repositories: AdminOverviewRepositories
  runProbes: () => Promise<DependencyHealth[]>
  getR2Usage: () => Promise<R2Usage>
}

interface RouteError extends Error {
  statusCode: number
  statusMessage: string
}

export interface AdminOverviewRouteDependencies<
  Event,
  Repositories extends AdminOverviewRepositories = AdminOverviewRepositories,
> {
  authorize: (event: Event) => Promise<unknown>
  getRepositories: () => Repositories | null
  loadOverview: (
    repositories: Repositories,
    now: Date,
  ) => Promise<AdminOverviewResponse>
  cache: PromiseTtlCache<string, AdminOverviewResponse>
  now: () => Date
  logError: (error: unknown) => void
  createHttpError?: (statusCode: number, statusMessage: string) => unknown
}

function defaultHttpError(statusCode: number, statusMessage: string): RouteError {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage })
}

export function createAdminOverviewRouteHandler<
  Event,
  Repositories extends AdminOverviewRepositories,
>(deps: AdminOverviewRouteDependencies<Event, Repositories>) {
  const createHttpError = deps.createHttpError ?? defaultHttpError

  return async (event: Event): Promise<AdminOverviewResponse> => {
    await deps.authorize(event)

    const repositories = deps.getRepositories()
    if (!repositories) {
      throw createHttpError(503, 'Admin operations data is unavailable.')
    }

    try {
      return await deps.cache.getOrCreate(
        OVERVIEW_CACHE_KEY,
        OVERVIEW_CACHE_TTL_MS,
        () => deps.loadOverview(repositories, deps.now()),
      )
    } catch (error) {
      deps.logError(error)
      throw createHttpError(500, 'Failed to load the admin operations overview.')
    }
  }
}

export async function buildAdminOverview(
  deps: BuildAdminOverviewDeps,
  now: Date,
): Promise<AdminOverviewResponse> {
  const last24HoursSince = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7DaysSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    shardRows,
    last24HourServerCounts,
    last7DayServerCounts,
    last24HourLogCounts,
    last7DayLogCounts,
    musicFlag,
    dependencies,
    r2Usage,
    recentLogs,
  ] = await Promise.all([
    deps.repositories.botStatus.listAll(),
    deps.repositories.servers.getAdminCounts(last24HoursSince),
    deps.repositories.servers.getAdminCounts(last7DaysSince),
    deps.repositories.logs.countByLevelSince(last24HoursSince),
    deps.repositories.logs.countByLevelSince(last7DaysSince),
    deps.repositories.systemFlags.getFlag('music'),
    deps.runProbes(),
    deps.getR2Usage(),
    deps.repositories.logs.listAll(200),
  ])

  const shards: ShardHealth[] = shardRows.map((row) => ({
    id: row.shardId,
    heartbeatAt: row.lastSeen.toISOString(),
    version: row.version ?? 'unknown',
  }))
  const expectedShardCount = shardRows.reduce((expected, row) => {
    return Math.max(expected, row.totalShards)
  }, 0)
  const additionalAttention: AttentionItem[] = []
  if (last24HourLogCounts.error >= ELEVATED_ERROR_THRESHOLD) {
    additionalAttention.push({
      key: 'logs:elevated-errors',
      severity: 'degraded',
      title: 'Recent error activity is elevated',
      description: `${last24HourLogCounts.error} errors were retained from the last 24 hours.`,
      href: '/dashboard/admin/logs?level=error',
    })
  }

  if (musicFlag?.enabled === false) {
    additionalAttention.push({
      key: 'music:disabled',
      severity: 'degraded',
      title: 'Music is disabled fleet-wide',
      description: 'The fleet-wide music switch is currently disabled.',
      occurredAt: musicFlag.updatedAt.toISOString(),
      href: '/dashboard/admin/music-system',
    })
  }

  const retentionCutoff = now.getTime() - RECENT_RETENTION_WINDOW_MS
  const latestRetentionError = recentLogs
    .filter((log) => {
      return log.level === 'error' &&
        log.timestamp.getTime() >= retentionCutoff &&
        (log.source === 'retention' || log.message.toLowerCase().includes('retention'))
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0]
  if (latestRetentionError) {
    additionalAttention.push({
      key: 'logs:retention-error',
      severity: 'degraded',
      title: 'A retention worker reported an error',
      description: 'A recent structured retention log needs review.',
      occurredAt: latestRetentionError.timestamp.toISOString(),
      href: '/dashboard/admin/logs?source=retention&level=error',
    })
  }

  const policy = deriveOverallStatus({
    now: now.toISOString(),
    expectedShardCount,
    activeShards: shards,
    dependencies,
    additionalAttentionItems: additionalAttention,
  })

  return {
    generatedAt: now.toISOString(),
    overallStatus: policy.overallStatus,
    fleet: {
      ...policy.fleet,
      servers: {
        registered: last24HourServerCounts.total,
        online: last24HourServerCounts.online,
        offline: last24HourServerCounts.offline,
        premium: last24HourServerCounts.premium,
      },
      music: {
        enabled: musicFlag?.enabled ?? true,
        reason: musicFlag?.reason ?? null,
        updatedAt: musicFlag?.updatedAt.toISOString() ?? null,
      },
    },
    dependencies,
    r2Usage,
    recentSummaries: buildRecentSummaries({
      now,
      last24Hours: {
        logs: last24HourLogCounts,
        servers: last24HourServerCounts,
      },
      last7Days: {
        logs: last7DayLogCounts,
        servers: last7DayServerCounts,
      },
    }),
    attentionItems: policy.attentionItems,
  }
}
