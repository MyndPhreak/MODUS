import { describe, expect, it } from "vitest";
import { drawWinners } from "./draw";

describe("drawWinners", () => {
  it("returns an empty array when there are no entrants", () => {
    expect(drawWinners([], 3)).toEqual([]);
  });

  it("returns an empty array when winnerCount is 0", () => {
    expect(drawWinners(["a", "b"], 0)).toEqual([]);
  });

  it("returns every entrant, once each, when winnerCount exceeds the pool", () => {
    const winners = drawWinners(["a", "b", "c"], 10);
    expect(winners).toHaveLength(3);
    expect(new Set(winners)).toEqual(new Set(["a", "b", "c"]));
  });

  it("never returns duplicate winners", () => {
    const winners = drawWinners(["a", "b", "c", "d", "e"], 5, Math.random);
    expect(new Set(winners).size).toBe(winners.length);
  });

  it("is deterministic given a fixed rng — always index 0 of the shrinking pool", () => {
    // rng() = 0 always picks index 0 of whatever remains.
    const winners = drawWinners(["a", "b", "c"], 2, () => 0);
    expect(winners).toEqual(["a", "b"]);
  });

  it("respects winnerCount when it's smaller than the pool", () => {
    const winners = drawWinners(["a", "b", "c", "d"], 2, () => 0.999999);
    expect(winners).toHaveLength(2);
  });
});
