/**
 * Pure winner selection. `rng` is injectable for deterministic tests; real
 * callers use the default Math.random.
 */
export function drawWinners(
  entrantIds: string[],
  winnerCount: number,
  rng: () => number = Math.random,
): string[] {
  if (winnerCount <= 0 || entrantIds.length === 0) return [];

  const pool = [...entrantIds];
  const count = Math.min(winnerCount, pool.length);
  const winners: string[] = [];

  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * pool.length);
    winners.push(pool[index]);
    pool.splice(index, 1);
  }

  return winners;
}
