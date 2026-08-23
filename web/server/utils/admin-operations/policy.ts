import type {
  AdminOverviewResponse,
  AttentionItem,
  OverallStatusInput,
} from './types'

export const DEFAULT_STALE_SHARD_THRESHOLD_MS = 2 * 60 * 1000

export type OverallPolicyResult = Pick<
  AdminOverviewResponse,
  'overallStatus' | 'attentionItems'
> & {
  fleet: Pick<AdminOverviewResponse['fleet'], 'telemetryAvailable' | 'shards' | 'versions'>
}

function severityRank(item: AttentionItem): number {
  return item.severity === 'unhealthy' ? 0 : 1
}

export function deriveOverallStatus(input: OverallStatusInput): OverallPolicyResult {
  const attentionItems: AttentionItem[] = []

  for (const dependency of input.dependencies) {
    if (
      !dependency.required ||
      (dependency.status !== 'unhealthy' && dependency.status !== 'degraded')
    ) {
      continue
    }

    attentionItems.push({
      key: `dependency:${dependency.key}`,
      severity: dependency.status,
      title: `${dependency.label} is ${dependency.status}`,
      description: dependency.message,
      occurredAt: dependency.checkedAt,
    })
  }

  const staleShardThresholdMs = input.staleShardThresholdMs ?? DEFAULT_STALE_SHARD_THRESHOLD_MS
  const now = new Date(input.now).getTime()
  const freshShards = input.activeShards.filter((shard) => {
    return now - new Date(shard.heartbeatAt).getTime() <= staleShardThresholdMs
  })
  const activeVersions = [...new Set(freshShards.map((shard) => shard.version))].sort()
  const telemetryAvailable = input.activeShards.length > 0 || input.expectedShardCount > 0
  const fleet: OverallPolicyResult['fleet'] = {
    telemetryAvailable,
    shards: {
      status: !telemetryAvailable
        ? 'unavailable'
        : (input.activeShards.length < input.expectedShardCount || input.activeShards.length !== freshShards.length)
            ? 'degraded'
            : 'healthy',
      active: freshShards.length,
      expected: input.expectedShardCount,
      stale: input.activeShards.length - freshShards.length,
    },
    versions: {
      active: activeVersions,
      disagreement: activeVersions.length > 1,
    },
  }

  if (!telemetryAvailable) {
    attentionItems.push({
      key: 'fleet:no-telemetry',
      severity: 'degraded',
      title: 'Fleet telemetry is unavailable',
      description: 'No active shard or version telemetry has been reported.',
    })
  }

  if (input.activeShards.length < input.expectedShardCount) {
    attentionItems.push({
      key: 'shards:missing',
      severity: 'degraded',
      title: 'Shards are missing',
      description: `${input.activeShards.length} of ${input.expectedShardCount} expected shards are reporting.`,
    })
  }

  if (fleet.shards.stale > 0) {
    attentionItems.push({
      key: 'shards:stale',
      severity: 'degraded',
      title: 'Shard heartbeats are stale',
      description: 'One or more reporting shards have not sent a recent heartbeat.',
    })
  }

  if (fleet.versions.disagreement) {
    attentionItems.push({
      key: 'shards:version-disagreement',
      severity: 'degraded',
      title: 'Shard versions disagree',
      description: 'Active shards are running different deployed versions.',
    })
  }

  attentionItems.push(...(input.additionalAttentionItems ?? []))
  attentionItems.sort((left, right) => severityRank(left) - severityRank(right))

  if (attentionItems.some((item) => item.severity === 'unhealthy')) {
    return { overallStatus: 'unhealthy', attentionItems, fleet }
  }

  if (attentionItems.length > 0) {
    return { overallStatus: 'degraded', attentionItems, fleet }
  }

  return { overallStatus: 'healthy', attentionItems, fleet }
}
