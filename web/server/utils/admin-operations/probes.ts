import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { OperationTimeoutError, withTimeout } from './cache'
import type { DependencyHealth } from './types'

const DEFAULT_TIMEOUT_MS = 5_000
const DISCORD_CURRENT_USER_URL = 'https://discord.com/api/v10/users/@me'

export type ProbeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface PingDependency {
  ping(signal?: AbortSignal): Promise<unknown>
}

interface S3ProbeClient {
  send(
    command: HeadBucketCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown>
}

export interface DependencyProbeDeps {
  postgres: PingDependency | null
  redis: PingDependency | null
  r2: { client: S3ProbeClient; bucket: string } | null
  discord: { botToken: string } | null
  botHttp: { url: string; headers?: HeadersInit } | null
  lavalink: { versionUrl: string; password?: string } | null
  fetchImpl: ProbeFetch
  timeoutMs?: number
  now?: () => Date
  clock?: () => number
}

interface ProbeDefinition {
  key: string
  label: string
  required: boolean
  configured: boolean
  check: (signal: AbortSignal) => Promise<unknown>
}

interface DependencyProbeMetadata {
  key: string
  label: string
  required: boolean
}

export const DEPENDENCY_PROBE_CATALOG = {
  postgres: { key: 'postgres', label: 'Postgres', required: true },
  redis: { key: 'redis', label: 'Redis', required: false },
  r2: { key: 'r2', label: 'R2', required: true },
  discord: { key: 'discord', label: 'Discord', required: true },
  botHttp: { key: 'bot-http', label: 'Bot HTTP', required: true },
  lavalink: { key: 'lavalink', label: 'Lavalink', required: false },
} as const satisfies Record<string, DependencyProbeMetadata>

function unconfiguredResult(
  probe: Pick<ProbeDefinition, 'key' | 'label' | 'required'>,
  checkedAt: string,
): DependencyHealth {
  return {
    key: probe.key,
    label: probe.label,
    required: probe.required,
    status: probe.required ? 'unhealthy' : 'unconfigured',
    checkedAt,
    message: `${probe.label} is not configured.`,
  }
}

async function executeProbe(
  probe: ProbeDefinition,
  checkedAt: string,
  timeoutMs: number,
  clock: () => number,
): Promise<DependencyHealth> {
  if (!probe.configured) {
    return unconfiguredResult(probe, checkedAt)
  }

  const startedAt = clock()
  try {
    await withTimeout(probe.check, timeoutMs)
    return {
      key: probe.key,
      label: probe.label,
      required: probe.required,
      status: 'healthy',
      latencyMs: Math.max(0, Math.round(clock() - startedAt)),
      checkedAt,
      message: `${probe.label} is reachable.`,
    }
  } catch (error) {
    return {
      key: probe.key,
      label: probe.label,
      required: probe.required,
      status: 'unhealthy',
      latencyMs: Math.max(0, Math.round(clock() - startedAt)),
      checkedAt,
      message: error instanceof OperationTimeoutError
        ? `${probe.label} probe timed out.`
        : `${probe.label} probe failed.`,
    }
  }
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error('Dependency returned an unsuccessful status.')
  }
}

export async function runDependencyProbes(
  deps: DependencyProbeDeps,
): Promise<DependencyHealth[]> {
  const checkedAt = (deps.now ?? (() => new Date()))().toISOString()
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const clock = deps.clock ?? Date.now

  const probes: ProbeDefinition[] = [
    {
      ...DEPENDENCY_PROBE_CATALOG.postgres,
      configured: deps.postgres !== null,
      check: (signal) => deps.postgres!.ping(signal),
    },
    {
      ...DEPENDENCY_PROBE_CATALOG.redis,
      configured: deps.redis !== null,
      check: (signal) => deps.redis!.ping(signal),
    },
    {
      ...DEPENDENCY_PROBE_CATALOG.r2,
      configured: deps.r2 !== null,
      check: (signal) => deps.r2!.client.send(
        new HeadBucketCommand({ Bucket: deps.r2!.bucket }),
        { abortSignal: signal },
      ),
    },
    {
      ...DEPENDENCY_PROBE_CATALOG.discord,
      configured: deps.discord !== null && deps.discord.botToken.length > 0,
      check: async (signal) => requireOk(await deps.fetchImpl(DISCORD_CURRENT_USER_URL, {
        signal,
        headers: { Authorization: `Bot ${deps.discord!.botToken}` },
      })),
    },
    {
      ...DEPENDENCY_PROBE_CATALOG.botHttp,
      configured: deps.botHttp !== null && deps.botHttp.url.length > 0,
      check: async (signal) => requireOk(await deps.fetchImpl(deps.botHttp!.url, {
        signal,
        headers: deps.botHttp!.headers,
      })),
    },
    {
      ...DEPENDENCY_PROBE_CATALOG.lavalink,
      configured: deps.lavalink !== null && deps.lavalink.versionUrl.length > 0,
      check: async (signal) => requireOk(await deps.fetchImpl(deps.lavalink!.versionUrl, {
        signal,
        headers: deps.lavalink!.password
          ? { Authorization: deps.lavalink!.password }
          : undefined,
      })),
    },
  ]

  return Promise.all(probes.map((probe) => {
    return executeProbe(probe, checkedAt, timeoutMs, clock)
  }))
}
