import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISCORD_USER_CACHE_TTL_MS,
  DISCORD_USER_CACHE_MAX_ENTRIES,
  readDiscordUser,
  writeDiscordUser,
  forgetDiscordUser,
  resetDiscordUserCache,
} from './discord-user-cache'

afterEach(() => {
  resetDiscordUserCache()
  vi.useRealTimers()
})

const profile = { id: '1', username: 'mynd' }
const guilds = [{ id: 'g1', name: 'Server One' }]

describe('discord user cache', () => {
  it('returns null for a user it has never seen', () => {
    expect(readDiscordUser('1')).toBeNull()
  })

  // The reason this cache exists: /users/@me/guilds allows ~1 request per
  // second per user, and every full document load re-hydrates the session.
  // A second hydration inside the window must be served locally instead of
  // racing Discord and taking a 429.
  it('serves a second read inside the TTL without needing Discord', () => {
    writeDiscordUser('1', profile, guilds)
    const hit = readDiscordUser('1')
    expect(hit).not.toBeNull()
    expect(hit!.fresh).toBe(true)
    expect(hit!.profile).toEqual(profile)
    expect(hit!.guilds).toEqual(guilds)
  })

  it('marks an entry stale once the TTL elapses but still hands it back', () => {
    vi.useFakeTimers()
    writeDiscordUser('1', profile, guilds)
    vi.advanceTimersByTime(DISCORD_USER_CACHE_TTL_MS + 1)

    const hit = readDiscordUser('1')
    // Stale, so the caller revalidates — but it is retained as the
    // fallback that keeps a 429 from emptying the caller's guild list.
    expect(hit).not.toBeNull()
    expect(hit!.fresh).toBe(false)
    expect(hit!.guilds).toEqual(guilds)
  })

  it('keeps users separate', () => {
    writeDiscordUser('1', profile, guilds)
    expect(readDiscordUser('2')).toBeNull()
  })

  it('drops the cached copy on forget', () => {
    writeDiscordUser('1', profile, guilds)
    forgetDiscordUser('1')
    expect(readDiscordUser('1')).toBeNull()
  })

  it('evicts least-recently-written entries past the cap', () => {
    for (let i = 0; i < DISCORD_USER_CACHE_MAX_ENTRIES + 5; i++) {
      writeDiscordUser(String(i), profile, guilds)
    }
    expect(readDiscordUser('0')).toBeNull()
    expect(readDiscordUser(String(DISCORD_USER_CACHE_MAX_ENTRIES + 4))).not.toBeNull()
  })
})
