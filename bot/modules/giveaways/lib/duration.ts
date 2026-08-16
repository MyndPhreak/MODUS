/**
 * Wraps chrono-node the same way bot/modules/reminders.ts's parseFutureDate
 * does, plus giveaway-specific min/max bounds.
 */
import * as chrono from "chrono-node";

export const MIN_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type DurationParseError = "unparseable" | "too_short" | "too_long";

export function parseGiveawayDuration(
  input: string,
  now: Date = new Date(),
): { endsAt: Date } | { error: DurationParseError } {
  const parsed = chrono.parseDate(input, now) ?? chrono.parseDate(`in ${input}`, now);
  if (!parsed) return { error: "unparseable" };

  const deltaMs = parsed.getTime() - now.getTime();
  if (deltaMs < MIN_DURATION_MS) return { error: "too_short" };
  if (deltaMs > MAX_DURATION_MS) return { error: "too_long" };

  return { endsAt: parsed };
}
