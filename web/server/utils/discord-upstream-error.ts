/**
 * Classification of failures coming back from Discord's REST API.
 *
 * Kept separate and tested because getting this wrong is expensive: a 429
 * from the ~1-req/s /users/@me/guilds route reported as "token expired"
 * sends the user to a reconnect flow that cannot help, and hides the real
 * problem from whoever is debugging. That mislabeling has cost a fix cycle
 * before (553f0de) — this module exists so it can't quietly come back.
 */

/** Which upstream call a rejection came from. */
export type UpstreamCall = "users/@me" | "users/@me/guilds" | "unknown";

export interface UpstreamFailure {
  call: UpstreamCall;
  /** HTTP status Discord replied with, or 0 for a transport error. */
  status: number;
  /** Discord's own error code from the response envelope. */
  discordCode: number | null;
  discordMessage: string | null;
  /** Milliseconds Discord asked us to wait, when rate limited. */
  retryAfter: number | null;
  /** True when a 429 is global rather than per-route. */
  global: boolean | null;
}

/** Stamp the originating call onto a rejection so it survives Promise.all. */
export function tagUpstreamCall(err: any, call: UpstreamCall) {
  if (err && typeof err === "object") err.upstreamCall = call;
  return err;
}

/** Discord's retry_after (seconds, possibly fractional) as milliseconds. */
export function retryAfterMs(err: any): number | null {
  const seconds =
    err?.data?.retry_after ?? err?.response?.headers?.get?.("retry-after");
  if (seconds === null || seconds === undefined || seconds === "") return null;
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.ceil(parsed * 1000);
}

/**
 * Normalize a rejection into something safe to log and to hand back to the
 * client. Everything here comes from Discord's public error envelope
 * ({ message, code }, plus retry_after / global on a 429) — no token
 * material.
 */
export function describeUpstreamFailure(err: any): UpstreamFailure {
  return {
    call: (err?.upstreamCall as UpstreamCall) ?? "unknown",
    status: err?.status ?? err?.statusCode ?? 0,
    discordCode: err?.data?.code ?? null,
    discordMessage: err?.data?.message ?? err?.message ?? null,
    retryAfter: retryAfterMs(err),
    global: err?.data?.global ?? null,
  };
}

/**
 * True only for failures that actually mean the OAuth token is dead. A
 * rate limit, a 5xx or a transport error emphatically do not.
 */
export function isAuthFailure(failure: UpstreamFailure): boolean {
  return failure.status === 401;
}
