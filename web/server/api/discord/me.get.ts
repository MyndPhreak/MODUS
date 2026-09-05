/**
 * Fetch the current user's Discord profile + guilds.
 *
 * Served from a short-lived per-user cache (discord-user-cache) so repeated
 * session hydrations don't each hit Discord. /users/@me/guilds allows
 * roughly one request per second per user, and the Pinia user store
 * re-hydrates on every full document load — two ordinary navigations in
 * quick succession used to land in the same second and take a 429.
 *
 * Failures are classified, not collapsed (see discord-upstream-error):
 * only a real 401 means the token is dead. A rate limit waits out the
 * window Discord asked for and retries once; anything still failing falls
 * back to the last known good copy rather than handing back an empty guild
 * list, and is surfaced as itself with `data.upstream` describing it.
 */
import {
  getDiscordAccessToken,
  refreshNativeTokens,
} from "../../utils/session";
import {
  readDiscordUser,
  writeDiscordUser,
} from "../../utils/discord-user-cache";
import {
  describeUpstreamFailure,
  isAuthFailure,
  tagUpstreamCall,
} from "../../utils/discord-upstream-error";

/** Longest we'll hold a request open waiting out a Discord rate limit. */
const MAX_RETRY_WAIT_MS = 2_000;

interface DiscordMeResponse {
  profile: any;
  guilds: any[];
}

async function fetchPair(accessToken: string): Promise<[any, any[]]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  return Promise.all([
    $fetch<any>("https://discord.com/api/users/@me", { headers }).catch(
      (err: any) => {
        throw tagUpstreamCall(err, "users/@me");
      },
    ),
    $fetch<any[]>("https://discord.com/api/users/@me/guilds", {
      headers,
    }).catch((err: any) => {
      throw tagUpstreamCall(err, "users/@me/guilds");
    }),
  ]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default defineEventHandler(
  async (event): Promise<DiscordMeResponse> => {
    const session = await getUserSession(event);
    const userId = session.user?.id ?? null;

    const cached = userId ? readDiscordUser(userId) : null;
    if (cached?.fresh) {
      return { profile: cached.profile, guilds: cached.guilds };
    }

    const token = await getDiscordAccessToken(event);
    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized: no Discord session.",
        data: { code: "no_discord_session" },
      });
    }

    const succeed = (profile: any, guilds: any[]): DiscordMeResponse => {
      if (userId) writeDiscordUser(userId, profile, guilds);
      return { profile, guilds };
    };

    try {
      const [profile, guilds] = await fetchPair(token);
      return succeed(profile, guilds);
    } catch (err: any) {
      let failure = describeUpstreamFailure(err);

      // The only failure that means the token is actually dead.
      if (isAuthFailure(failure)) {
        const refreshed = await refreshNativeTokens(event);
        if (refreshed) {
          try {
            const [profile, guilds] = await fetchPair(refreshed.accessToken);
            return succeed(profile, guilds);
          } catch (retryErr: any) {
            failure = describeUpstreamFailure(retryErr);
          }
        }
        console.warn(
          `[discord/me] treating as expired token: ${JSON.stringify(failure)}`,
        );
        throw createError({
          statusCode: 401,
          statusMessage: "discord_token_expired",
          data: { code: "discord_token_expired", upstream: failure },
        });
      }

      // Rate limited: wait out the window Discord named, once.
      if (
        failure.status === 429 &&
        failure.retryAfter !== null &&
        failure.retryAfter <= MAX_RETRY_WAIT_MS
      ) {
        await sleep(failure.retryAfter);
        try {
          const [profile, guilds] = await fetchPair(token);
          return succeed(profile, guilds);
        } catch (retryErr: any) {
          failure = describeUpstreamFailure(retryErr);
        }
      }

      // An empty guild list is worse than a stale one — it silently empties
      // every "your servers" list in the dashboard.
      if (cached) {
        console.warn(
          `[discord/me] serving stale cache after upstream failure: ${JSON.stringify(failure)}`,
        );
        return { profile: cached.profile, guilds: cached.guilds };
      }

      console.warn(`[discord/me] upstream failure: ${JSON.stringify(failure)}`);
      throw createError({
        statusCode:
          failure.status >= 400 && failure.status < 600 ? failure.status : 502,
        statusMessage: "discord_upstream_error",
        data: { code: "discord_upstream_error", upstream: failure },
      });
    }
  },
);
