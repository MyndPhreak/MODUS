/**
 * Short-lived, per-user cache of the Discord profile + guild list served by
 * /api/discord/me.
 *
 * Why this exists: Discord allows roughly one request per second per user
 * to /users/@me/guilds, and the Pinia user store re-hydrates the session on
 * every full document load. Two document loads inside that window — an
 * ordinary click-through pace on the marketing pages, which navigate with
 * plain anchors — put two calls into the same second and the second one
 * 429s. Serving the second hydration from here removes the collision.
 *
 * Entries are kept after they go stale so a failed revalidation can fall
 * back to the last known good copy rather than handing the caller an empty
 * guild list. In-process only: it holds nothing that survives a restart,
 * and a cold process just revalidates.
 */

/** How long an entry may be served without asking Discord again. */
export const DISCORD_USER_CACHE_TTL_MS = 60_000;

/** Upper bound on retained users, oldest write evicted first. */
export const DISCORD_USER_CACHE_MAX_ENTRIES = 500;

export interface CachedDiscordUser {
  profile: any;
  guilds: any[];
  /** False once the TTL has elapsed — revalidate, but keep as fallback. */
  fresh: boolean;
}

interface Entry {
  profile: any;
  guilds: any[];
  /** Epoch ms after which the entry must be revalidated. */
  freshUntil: number;
}

const entries = new Map<string, Entry>();

export function readDiscordUser(userId: string): CachedDiscordUser | null {
  const entry = entries.get(userId);
  if (!entry) return null;
  return {
    profile: entry.profile,
    guilds: entry.guilds,
    fresh: entry.freshUntil > Date.now(),
  };
}

export function writeDiscordUser(
  userId: string,
  profile: any,
  guilds: any[],
): void {
  // Re-inserting moves the key to the end, so Map iteration order stays
  // oldest-write-first and the eviction below drops the right one.
  entries.delete(userId);
  entries.set(userId, {
    profile,
    guilds,
    freshUntil: Date.now() + DISCORD_USER_CACHE_TTL_MS,
  });

  while (entries.size > DISCORD_USER_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** Drop a user's copy — called on logout so a re-login starts clean. */
export function forgetDiscordUser(userId: string): void {
  entries.delete(userId);
}

/** Test seam. */
export function resetDiscordUserCache(): void {
  entries.clear();
}
