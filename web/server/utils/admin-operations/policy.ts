import type {
  AdminOverviewResponse,
  AttentionItem,
  OverallStatusInput,
} from './types'

const DEFAULT_STALE_SHARD_THRESHOLD_MS = 2 * 60 * 1000

type OverallPolicyResult = Pick<AdminOverviewResponse, 'overallStatus' | 'attentionItems'>

export function deriveOverallStatus(input: OverallStatusInput): OverallPolicyResult {
  const attentionItems: AttentionItem[] = []
  const requiredDependencyKeys = new Set(input.requiredDependencyKeys)

  for (const dependency of input.dependencies) {
    if (
      !requiredDependencyKeys.has(dependency.key) ||
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

  if (input.activeShards.length < input.expectedShardCount) {
    attentionItems.push({
      key: 'shards:missing',
      severity: 'degraded',
      title: 'Shards are missing',
      description: `${input.activeShards.length} of ${input.expectedShardCount} expected shards are reporting.`,
    })
  }

  if (freshShards.length < input.activeShards.length) {
    attentionItems.push({
      key: 'shards:stale',
      severity: 'degraded',
      title: 'Shard heartbeats are stale',
      description: 'One or more reporting shards have not sent a recent heartbeat.',
    })
  }

  if (new Set(freshShards.map((shard) => shard.version)).size > 1) {
    attentionItems.push({
      key: 'shards:version-disagreement',
      severity: 'degraded',
      title: 'Shard versions disagree',
      description: 'Active shards are running different deployed versions.',
    })
  }

  if (attentionItems.some((item) => item.severity === 'unhealthy')) {
    return { overallStatus: 'unhealthy', attentionItems }
  }

  if (attentionItems.length > 0) {
    return { overallStatus: 'degraded', attentionItems }
  }

  return { overallStatus: 'healthy', attentionItems }
}
