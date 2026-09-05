import { describe, expect, it } from 'vitest'
import {
  describeUpstreamFailure,
  isAuthFailure,
  retryAfterMs,
  tagUpstreamCall,
} from './discord-upstream-error'

/** Shape ofetch hands us for a non-2xx Discord reply. */
function fetchError(
  status: number,
  body: any,
  headers: Record<string, string> = {},
) {
  return {
    status,
    statusCode: status,
    message: `[GET] "https://discord.com/...": ${status}`,
    data: body,
    response: {
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    },
  }
}

describe('discord upstream error classification', () => {
  // The regression this module exists to prevent.
  it('does not treat a rate limit as an auth failure', () => {
    const err = tagUpstreamCall(
      fetchError(429, {
        message: 'You are being rate limited.',
        retry_after: 0.75,
        global: false,
      }),
      'users/@me/guilds',
    )
    const failure = describeUpstreamFailure(err)

    expect(isAuthFailure(failure)).toBe(false)
    expect(failure.status).toBe(429)
    expect(failure.retryAfter).toBe(750)
    expect(failure.call).toBe('users/@me/guilds')
  })

  it('treats a 401 as an auth failure', () => {
    const failure = describeUpstreamFailure(
      fetchError(401, { message: '401: Unauthorized', code: 0 }),
    )
    expect(isAuthFailure(failure)).toBe(true)
  })

  it('does not treat a 5xx or a transport error as an auth failure', () => {
    expect(isAuthFailure(describeUpstreamFailure(fetchError(503, {})))).toBe(false)
    expect(isAuthFailure(describeUpstreamFailure(new Error('socket hang up')))).toBe(false)
  })

  it('reports which of the two calls failed', () => {
    const err = tagUpstreamCall(fetchError(500, {}), 'users/@me')
    expect(describeUpstreamFailure(err).call).toBe('users/@me')
  })

  it('falls back to the Retry-After header when the body has no retry_after', () => {
    expect(retryAfterMs(fetchError(429, {}, { 'retry-after': '2' }))).toBe(2000)
  })

  it('returns null rather than a bogus wait when there is no retry hint', () => {
    expect(retryAfterMs(fetchError(429, {}))).toBeNull()
    expect(retryAfterMs(fetchError(429, { retry_after: 'soon' }))).toBeNull()
    expect(retryAfterMs(fetchError(429, { retry_after: -1 }))).toBeNull()
  })

  it('carries no token material into the described failure', () => {
    const err = tagUpstreamCall(
      fetchError(401, { message: '401: Unauthorized' }),
      'users/@me',
    )
    ;(err as any).request = 'https://discord.com/api/users/@me'
    expect(Object.keys(describeUpstreamFailure(err)).sort()).toEqual([
      'call',
      'discordCode',
      'discordMessage',
      'global',
      'retryAfter',
      'status',
    ])
  })
})
