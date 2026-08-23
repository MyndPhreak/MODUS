import { describe, expect, it } from 'vitest'
import { PromiseTtlCache } from './cache'
import {
  formatBinaryBytes,
  getR2Usage,
  type R2Usage,
  type R2UsageFetch,
} from './r2-usage'

function analyticsResponse(samples: unknown[]) {
  return new Response(JSON.stringify({
    data: {
      viewer: {
        accounts: [{ r2StorageAdaptiveGroups: samples }],
      },
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function usageConfig(cache = new PromiseTtlCache<string, R2Usage>()) {
  return {
    accountId: 'account-tag',
    bucket: 'private-bucket',
    apiToken: 'analytics-token',
    cache,
  }
}

describe('getR2Usage', () => {
  it('queries the configured account and bucket and selects the latest reported sample', async () => {
    let request: { url: string; init?: RequestInit } | undefined
    const fetchImpl: R2UsageFetch = async (input, init) => {
      request = { url: String(input), init }
      return analyticsResponse([
        {
          dimensions: { datetime: '2026-08-23T11:00:00.000Z' },
          max: { objectCount: 7, uploadCount: 2, payloadSize: 1536, metadataSize: 512 },
        },
        {
          dimensions: { datetime: '2026-08-23T12:00:00.000Z' },
          max: { objectCount: 9, uploadCount: 3, payloadSize: 2048, metadataSize: 1024 },
        },
      ])
    }

    const result = await getR2Usage(fetchImpl, usageConfig())

    expect(result).toEqual({
      status: 'available',
      objectCount: 9,
      uploadCount: 3,
      payloadSizeBytes: 2048,
      payloadSizeFormatted: '2 KiB',
      metadataSizeBytes: 1024,
      metadataSizeFormatted: '1 KiB',
      sampledAt: '2026-08-23T12:00:00.000Z',
    })
    expect(request?.url).toBe('https://api.cloudflare.com/client/v4/graphql')
    expect(new Headers(request?.init?.headers).get('authorization')).toBe(
      'Bearer analytics-token',
    )
    const body = JSON.parse(String(request?.init?.body)) as {
      query: string
      variables: Record<string, string>
    }
    expect(body.variables).toEqual({
      accountTag: 'account-tag',
      bucketName: 'private-bucket',
    })
    expect(body.query).toContain('r2StorageAdaptiveGroups')
    expect(body.query).toContain('filter: { bucketName: $bucketName }')
    expect(body.query).toContain('orderBy: [datetime_DESC]')
    expect(body.query).toContain('limit: 1')
    expect(body.query).toContain('max {')
    expect(body.query).toContain('objectCount')
    expect(body.query).toContain('uploadCount')
    expect(body.query).toContain('payloadSize')
    expect(body.query).toContain('metadataSize')
  })

  it('formats byte counts with binary units', () => {
    expect(formatBinaryBytes(0)).toBe('0 B')
    expect(formatBinaryBytes(1023)).toBe('1023 B')
    expect(formatBinaryBytes(1024)).toBe('1 KiB')
    expect(formatBinaryBytes(1536)).toBe('1.5 KiB')
    expect(formatBinaryBytes(5 * 1024 * 1024)).toBe('5 MiB')
  })

  it('returns unconfigured without making a request when the analytics token is missing', async () => {
    let calls = 0
    const result = await getR2Usage(async () => {
      calls += 1
      return analyticsResponse([])
    }, {
      ...usageConfig(),
      apiToken: '',
    })

    expect(result).toEqual({
      status: 'unconfigured',
      message: 'R2 usage analytics is not configured.',
    })
    expect(calls).toBe(0)
  })

  it('returns unavailable when Cloudflare has no reported sample', async () => {
    const result = await getR2Usage(async () => analyticsResponse([]), usageConfig())

    expect(result).toEqual({
      status: 'unavailable',
      message: 'R2 usage analytics has no reported sample.',
    })
  })

  it('shares an in-flight request and reuses the result cache', async () => {
    let calls = 0
    let resolveResponse!: (response: Response) => void
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const fetchImpl: R2UsageFetch = async () => {
      calls += 1
      return pendingResponse
    }
    const config = usageConfig()

    const first = getR2Usage(fetchImpl, config)
    const second = getR2Usage(fetchImpl, config)
    await Promise.resolve()
    expect(calls).toBe(1)

    resolveResponse(analyticsResponse([{
      dimensions: { datetime: '2026-08-23T12:00:00.000Z' },
      max: { objectCount: 1, uploadCount: 0, payloadSize: 1, metadataSize: 1 },
    }]))

    const [firstResult, secondResult] = await Promise.all([first, second])
    const thirdResult = await getR2Usage(fetchImpl, config)
    expect(calls).toBe(1)
    expect(secondResult).toEqual(firstResult)
    expect(thirdResult).toEqual(firstResult)
  })

  it('keeps a completed analytics result cached for at least five minutes', async () => {
    let now = 0
    let calls = 0
    const cache = new PromiseTtlCache<string, R2Usage>(() => now)
    const fetchImpl: R2UsageFetch = async () => {
      calls += 1
      return analyticsResponse([{
        dimensions: { datetime: '2026-08-23T12:00:00.000Z' },
        max: { objectCount: calls, uploadCount: 0, payloadSize: 1, metadataSize: 1 },
      }])
    }
    const config = usageConfig(cache)

    await getR2Usage(fetchImpl, config)
    now = 5 * 60 * 1000 - 1
    const cached = await getR2Usage(fetchImpl, config)
    now = 5 * 60 * 1000 + 1
    const refreshed = await getR2Usage(fetchImpl, config)

    expect(calls).toBe(2)
    expect(cached.status === 'available' && cached.objectCount).toBe(1)
    expect(refreshed.status === 'available' && refreshed.objectCount).toBe(2)
  })

  it('never returns token, bucket, URL, or upstream error details', async () => {
    const token = 'analytics-token-super-secret'
    const bucket = 'private-bucket-name'
    const upstreamUrl = 'https://private-api.internal/graphql'
    const fetchImpl: R2UsageFetch = async () => {
      throw new Error(`${token} ${bucket} ${upstreamUrl}`)
    }

    const result = await getR2Usage(fetchImpl, {
      ...usageConfig(),
      apiToken: token,
      bucket,
    })

    expect(result).toEqual({
      status: 'unavailable',
      message: 'R2 usage analytics is temporarily unavailable.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(token)
    expect(serialized).not.toContain(bucket)
    expect(serialized).not.toContain(upstreamUrl)
  })
})
