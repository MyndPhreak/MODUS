export type AdminLogLevel = 'all' | 'info' | 'warn' | 'error'

export interface AdminLogFilters {
  level: AdminLogLevel
  source: string | null
  guildId: string | null
  shardId: number | null
}

export interface FilterableAdminLog {
  level?: string
  source?: string | null
  guildId?: string | null
  shardId?: number | null
}

export interface FleetTelemetryInput {
  telemetryAvailable: boolean
  shards: {
    status: 'healthy' | 'degraded' | 'unavailable'
    active: number
    expected: number
    stale: number
  }
  versions: {
    active: string[]
    disagreement: boolean
  }
}

export interface FleetTelemetryPresentation {
  available: boolean
  shardStatus: 'healthy' | 'degraded' | 'unavailable'
  shardValue: string
  shardDetail: string
  versionValue: string
  versionDetail: string
}

type QueryValue = string | null | Array<string | null> | undefined

function firstQueryValue(value: QueryValue): string | null {
  const first = Array.isArray(value) ? value[0] : value
  const normalized = typeof first === 'string' ? first.trim() : ''
  return normalized || null
}

function validLevel(value: string | null): AdminLogLevel {
  return value === 'info' || value === 'warn' || value === 'error' ? value : 'all'
}

function validShard(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const shardId = Number(value)
  return Number.isSafeInteger(shardId) ? shardId : null
}

export function parseAdminLogQuery(query: Record<string, QueryValue>): AdminLogFilters {
  return {
    level: validLevel(firstQueryValue(query.level)),
    source: firstQueryValue(query.source),
    guildId: firstQueryValue(query.guild) ?? firstQueryValue(query.guild_id),
    shardId: validShard(firstQueryValue(query.shard) ?? firstQueryValue(query.shard_id)),
  }
}

export function filterAdminLogs<T extends FilterableAdminLog>(
  logs: readonly T[],
  filters: AdminLogFilters,
): T[] {
  return logs.filter((log) => {
    if (filters.level !== 'all' && log.level !== filters.level) return false
    if (filters.source && log.source !== filters.source) return false
    if (filters.guildId && log.guildId !== filters.guildId) return false
    if (filters.shardId !== null && log.shardId !== filters.shardId) return false
    return true
  })
}

export function getFleetTelemetryPresentation(
  fleet: FleetTelemetryInput,
): FleetTelemetryPresentation {
  if (!fleet.telemetryAvailable) {
    return {
      available: false,
      shardStatus: 'unavailable',
      shardValue: 'No telemetry',
      shardDetail: 'No shard telemetry has been reported.',
      versionValue: 'No telemetry',
      versionDetail: 'No active version telemetry has been reported.',
    }
  }

  return {
    available: fleet.telemetryAvailable,
    shardStatus: fleet.shards.status,
    shardValue: `${fleet.shards.active} / ${fleet.shards.expected}`,
    shardDetail: fleet.shards.stale
      ? `${fleet.shards.stale} stale heartbeat${fleet.shards.stale === 1 ? '' : 's'}`
      : 'No stale heartbeats',
    versionValue: String(fleet.versions.active.length),
    versionDetail: fleet.versions.disagreement
      ? 'Version disagreement detected'
      : 'Active versions agree',
  }
}
