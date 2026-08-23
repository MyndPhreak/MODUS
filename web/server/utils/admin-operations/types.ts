import type { R2Usage } from './r2-usage'
import type { RecentSummaries } from './summaries'

export type DependencyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unconfigured'

export type OverallStatus = Exclude<DependencyStatus, 'unconfigured'>

export interface DependencyHealth {
  key: string
  label: string
  required: boolean
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
  generatedAt: string
  overallStatus: OverallStatus
  fleet: {
    shards: {
      active: number
      expected: number
      stale: number
    }
    versions: {
      active: string[]
      disagreement: boolean
    }
    servers: {
      registered: number
      online: number
      offline: number
      premium: number
    }
    music: {
      enabled: boolean
      reason: string | null
      updatedAt: string | null
    }
  }
  dependencies: DependencyHealth[]
  r2Usage: R2Usage
  recentSummaries: RecentSummaries
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
  staleShardThresholdMs?: number
  additionalAttentionItems?: AttentionItem[]
}
