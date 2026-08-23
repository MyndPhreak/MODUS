import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { runDependencyProbes, type ProbeFetch } from './probes'

const checkedAt = '2026-08-23T12:00:00.000Z'

describe('runDependencyProbes', () => {
  it('reports successful Postgres, Redis, R2, Discord, bot HTTP, and Lavalink checks', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const commands: unknown[] = []
    const fetchImpl: ProbeFetch = async (input, init) => {
      requests.push({ url: String(input), init })
      return new Response(null, { status: 204 })
    }

    const result = await runDependencyProbes({
      postgres: { ping: async () => undefined },
      redis: { ping: async () => 'PONG' },
      r2: {
        bucket: 'private-bucket',
        client: {
          send: async (command) => {
            commands.push(command)
            return {}
          },
        },
      },
      discord: { botToken: 'discord-secret' },
      botHttp: { url: 'https://bot.internal/health' },
      lavalink: {
        versionUrl: 'https://lavalink.internal/version',
        password: 'lavalink-secret',
      },
      fetchImpl,
      now: () => new Date(checkedAt),
    })

    expect(result.map(({ key, required, status }) => ({ key, required, status }))).toEqual([
      { key: 'postgres', required: true, status: 'healthy' },
      { key: 'redis', required: false, status: 'healthy' },
      { key: 'r2', required: true, status: 'healthy' },
      { key: 'discord', required: true, status: 'healthy' },
      { key: 'bot-http', required: true, status: 'healthy' },
      { key: 'lavalink', required: false, status: 'healthy' },
    ])
    expect(result.every((probe) => probe.checkedAt === checkedAt)).toBe(true)
    expect(result.every((probe) => typeof probe.latencyMs === 'number')).toBe(true)
    expect(commands).toHaveLength(1)
    expect(commands[0]).toBeInstanceOf(HeadBucketCommand)
    expect((commands[0] as HeadBucketCommand).input).toEqual({ Bucket: 'private-bucket' })
    expect(requests.map((request) => request.url)).toEqual([
      'https://discord.com/api/v10/users/@me',
      'https://bot.internal/health',
      'https://lavalink.internal/version',
    ])
    expect(new Headers(requests[0]?.init?.headers).get('authorization')).toBe(
      'Bot discord-secret',
    )
    expect(new Headers(requests[2]?.init?.headers).get('authorization')).toBe(
      'lavalink-secret',
    )
  })

  it('aborts a timed-out fetch and returns a sanitized unhealthy result', async () => {
    let signal: AbortSignal | undefined
    const fetchImpl: ProbeFetch = async (_input, init) => {
      signal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('private timeout URL')))
      })
    }

    const result = await runDependencyProbes({
      postgres: { ping: async () => undefined },
      redis: null,
      r2: null,
      discord: null,
      botHttp: { url: 'https://bot.internal/health' },
      lavalink: null,
      fetchImpl,
      timeoutMs: 10,
      now: () => new Date(checkedAt),
    })

    expect(result.find((probe) => probe.key === 'bot-http')).toMatchObject({
      status: 'unhealthy',
      message: 'Bot HTTP probe timed out.',
    })
    expect(signal?.aborted).toBe(true)
    expect(JSON.stringify(result)).not.toContain('bot.internal')
  })

  it('reports optional Redis and Lavalink services as unconfigured', async () => {
    const result = await runDependencyProbes({
      postgres: { ping: async () => undefined },
      redis: null,
      r2: null,
      discord: null,
      botHttp: null,
      lavalink: null,
      fetchImpl: async () => new Response(null, { status: 204 }),
      now: () => new Date(checkedAt),
    })

    expect(result.find((probe) => probe.key === 'redis')).toEqual({
      key: 'redis',
      label: 'Redis',
      required: false,
      status: 'unconfigured',
      checkedAt,
      message: 'Redis is not configured.',
    })
    expect(result.find((probe) => probe.key === 'lavalink')).toEqual({
      key: 'lavalink',
      label: 'Lavalink',
      required: false,
      status: 'unconfigured',
      checkedAt,
      message: 'Lavalink is not configured.',
    })
  })

  it('never includes thrown errors or dependency configuration in failure results', async () => {
    const secrets = [
      'postgres://admin:password@db.internal/modus',
      'redis://:password@redis.internal:6379',
      'private-bucket',
      'discord-secret',
      'https://bot.internal/health',
      'lavalink-secret',
    ]
    const fail = async () => {
      throw new Error(secrets.join(' '))
    }
    const fetchImpl: ProbeFetch = async () => fail()

    const result = await runDependencyProbes({
      postgres: { ping: fail },
      redis: { ping: fail },
      r2: { bucket: secrets[2]!, client: { send: fail } },
      discord: { botToken: secrets[3]! },
      botHttp: { url: secrets[4]! },
      lavalink: { versionUrl: 'https://lavalink.internal/version', password: secrets[5]! },
      fetchImpl,
      now: () => new Date(checkedAt),
    })

    const serialized = JSON.stringify(result)
    expect(result.every((probe) => probe.status === 'unhealthy')).toBe(true)
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).not.toContain('lavalink.internal')
  })
})
