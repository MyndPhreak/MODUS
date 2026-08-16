import { describe, expect, it } from "vitest";
import { parseGiveawayDuration } from "./duration";

const NOW = new Date("2026-08-16T12:00:00.000Z");

describe("parseGiveawayDuration", () => {
  it("parses a relative duration like 'in 1 hour'", () => {
    const result = parseGiveawayDuration("in 1 hour", NOW);
    expect("endsAt" in result).toBe(true);
    if ("endsAt" in result) {
      expect(result.endsAt.getTime()).toBe(NOW.getTime() + 60 * 60 * 1000);
    }
  });

  it("parses '3 days'", () => {
    const result = parseGiveawayDuration("3 days", NOW);
    expect("endsAt" in result).toBe(true);
    if ("endsAt" in result) {
      expect(result.endsAt.getTime()).toBe(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    }
  });

  it("rejects unparseable input", () => {
    expect(parseGiveawayDuration("asdfghjkl", NOW)).toEqual({ error: "unparseable" });
  });

  it("rejects a duration shorter than 5 minutes", () => {
    expect(parseGiveawayDuration("in 1 minute", NOW)).toEqual({ error: "too_short" });
  });

  it("rejects a duration longer than 30 days", () => {
    expect(parseGiveawayDuration("in 60 days", NOW)).toEqual({ error: "too_long" });
  });

  it("accepts exactly the minimum boundary", () => {
    const result = parseGiveawayDuration("in 5 minutes", NOW);
    expect("endsAt" in result).toBe(true);
  });
});
