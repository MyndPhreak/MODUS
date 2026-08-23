export type DependencyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unconfigured'

export type OverallStatus = Exclude<DependencyStatus, 'unconfigured'>

export interface DependencyHealth {
  key: string
  label: string
  status: DependencyStatus
  latencyMs?: number
  checkedAt: string
  message: string
}

export interface AttentionItem {
  key: string
  severity: Exclude<OverallStatus, 'healthy'>
  title: string
  description: string
  occurredAt?: string
  href?: string
}

export interface AdminOverviewResponse {
  overallStatus: OverallStatus
  dependencies: DependencyHealth[]
  attentionItems: AttentionItem[]
}

export interface ShardHealth {
  id: number
  heartbeatAt: string
  version: string
}

export interface OverallStatusInput {
  now: string
  expectedShardCount: number
  activeShards: ShardHealth[]
  dependencies: DependencyHealth[]
  requiredDependencyKeys: string[]
  staleShardThresholdMs?: number
}
