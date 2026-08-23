import { PromiseTtlCache, withTimeout } from './cache'

const CLOUDFLARE_GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'
const R2_USAGE_CACHE_TTL_MS = 5 * 60 * 1000
const R2_USAGE_TIMEOUT_MS = 5_000

const R2_USAGE_QUERY = `
  query R2StorageLatest($accountTag: string!, $bucketName: string!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        r2StorageAdaptiveGroups(
          limit: 1
          filter: { bucketName: $bucketName }
          orderBy: [datetime_DESC]
        ) {
          max {
            objectCount
            uploadCount
            payloadSize
            metadataSize
          }
          dimensions {
            datetime
          }
        }
      }
    }
  }
`

export type R2Usage =
  | {
      status: 'available'
      objectCount: number
      uploadCount: number
      payloadSizeBytes: number
      payloadSizeFormatted: string
      metadataSizeBytes: number
      metadataSizeFormatted: string
      sampledAt: string
    }
  | {
      status: 'unconfigured' | 'unavailable'
      message: string
    }

export type R2UsageFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface R2UsageConfig {
  accountId: string
  bucket: string
  apiToken: string
  cache?: PromiseTtlCache<string, R2Usage>
  timeoutMs?: number
}

interface StorageSample {
  dimensions?: { datetime?: unknown }
  max?: {
    objectCount?: unknown
    uploadCount?: unknown
    payloadSize?: unknown
    metadataSize?: unknown
  }
}

interface AnalyticsResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        r2StorageAdaptiveGroups?: StorageSample[]
      }>
    }
  }
  errors?: unknown[]
}

const defaultCache = new PromiseTtlCache<string, R2Usage>()

export function formatBinaryBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError('Byte count must be a finite non-negative number.')
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
  const unitIndex = bytes === 0
    ? 0
    : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = unitIndex === 0 ? bytes : bytes / (1024 ** unitIndex)
  const formatted = unitIndex === 0
    ? String(Math.round(value))
    : String(Number(value.toFixed(2)))
  return `${formatted} ${units[unitIndex]}`
}

function finiteNonNegative(value: unknown): number | null {
  const number = typeof value === 'number' || typeof value === 'string'
    ? Number(value)
    : Number.NaN
  return Number.isFinite(number) && number >= 0 ? number : null
}

function selectLatestSample(samples: StorageSample[]): StorageSample | null {
  let latest: StorageSample | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const sample of samples) {
    const timestamp = typeof sample.dimensions?.datetime === 'string'
      ? Date.parse(sample.dimensions.datetime)
      : Number.NaN
    if (Number.isFinite(timestamp) && timestamp > latestTime) {
      latest = sample
      latestTime = timestamp
    }
  }

  return latest
}

function parseUsage(response: AnalyticsResponse): R2Usage {
  if (response.errors?.length) {
    return {
      status: 'unavailable',
      message: 'R2 usage analytics is temporarily unavailable.',
    }
  }

  const samples = response.data?.viewer?.accounts?.flatMap((account) => {
    return account.r2StorageAdaptiveGroups ?? []
  }) ?? []
  const sample = selectLatestSample(samples)
  if (!sample) {
    return {
      status: 'unavailable',
      message: 'R2 usage analytics has no reported sample.',
    }
  }

  const objectCount = finiteNonNegative(sample.max?.objectCount)
  const uploadCount = finiteNonNegative(sample.max?.uploadCount)
  const payloadSizeBytes = finiteNonNegative(sample.max?.payloadSize)
  const metadataSizeBytes = finiteNonNegative(sample.max?.metadataSize)
  const datetime = sample.dimensions?.datetime

  if (
    objectCount === null ||
    uploadCount === null ||
    payloadSizeBytes === null ||
    metadataSizeBytes === null ||
    typeof datetime !== 'string'
  ) {
    return {
      status: 'unavailable',
      message: 'R2 usage analytics returned an invalid sample.',
    }
  }

  return {
    status: 'available',
    objectCount,
    uploadCount,
    payloadSizeBytes,
    payloadSizeFormatted: formatBinaryBytes(payloadSizeBytes),
    metadataSizeBytes,
    metadataSizeFormatted: formatBinaryBytes(metadataSizeBytes),
    sampledAt: new Date(datetime).toISOString(),
  }
}

async function fetchUsage(
  fetchImpl: R2UsageFetch,
  config: R2UsageConfig,
): Promise<R2Usage> {
  try {
    return await withTimeout(async (signal) => {
      const response = await fetchImpl(CLOUDFLARE_GRAPHQL_ENDPOINT, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: R2_USAGE_QUERY,
          variables: {
            accountTag: config.accountId,
            bucketName: config.bucket,
          },
        }),
      })

      if (!response.ok) {
        return {
          status: 'unavailable',
          message: 'R2 usage analytics is temporarily unavailable.',
        }
      }

      return parseUsage(await response.json() as AnalyticsResponse)
    }, config.timeoutMs ?? R2_USAGE_TIMEOUT_MS)
  } catch {
    return {
      status: 'unavailable',
      message: 'R2 usage analytics is temporarily unavailable.',
    }
  }
}

export function getR2Usage(
  fetchImpl: R2UsageFetch,
  config: R2UsageConfig,
): Promise<R2Usage> {
  if (!config.apiToken || !config.accountId || !config.bucket) {
    return Promise.resolve({
      status: 'unconfigured',
      message: 'R2 usage analytics is not configured.',
    })
  }

  const cache = config.cache ?? defaultCache
  const cacheKey = `${config.accountId}\u0000${config.bucket}`
  return cache.getOrCreate(cacheKey, R2_USAGE_CACHE_TTL_MS, () => {
    return fetchUsage(fetchImpl, config)
  })
}
