import { describe, expect, it } from "vitest";
import { scoreTrackMatch } from "./track-matching";

describe("scoreTrackMatch", () => {
  it("accepts the same artist, normalized title, and close duration", () => {
    expect(scoreTrackMatch(
      { title: "Song (Official Video)", artists: ["Artist"], durationMs: 180_000 },
      { title: "Song", artists: ["Artist"], durationMs: 181_000 },
    )).toBeGreaterThanOrEqual(0.9);
  });

  it("rejects a materially different duration", () => {
    expect(scoreTrackMatch(
      { title: "Song", artists: ["Artist"], durationMs: 180_000 },
      { title: "Song", artists: ["Artist"], durationMs: 300_000 },
    )).toBeLessThan(0.85);
  });

  it("treats a shared ISRC as a certain match", () => {
    expect(scoreTrackMatch(
      { title: "Song", artists: ["Artist"], durationMs: 180_000, isrc: "USABC1234567" },
      { title: "Different Song", artists: ["Other Artist"], durationMs: 300_000, isrc: "us-abc-1234567" },
    )).toBe(1);
  });
});
