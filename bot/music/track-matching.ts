export interface TrackMatchCandidate {
  title: string;
  artists: string[];
  durationMs?: number;
  isrc?: string;
}

const cosmeticTitleSuffix = /\s*[\(\[\{]\s*(?:official\s+)?(?:music\s+|lyric\s+)?(?:video|audio|lyrics?|visuali[sz]er|hd|hq)\s*[\)\]\}]/gi;

export function normalizeTrackTitle(title: string): string {
  return normalizeText(title.replace(cosmeticTitleSuffix, ""));
}

export function scoreTrackMatch(requested: TrackMatchCandidate, candidate: TrackMatchCandidate): number {
  const requestedIsrc = normalizeIsrc(requested.isrc);
  const candidateIsrc = normalizeIsrc(candidate.isrc);

  if (requestedIsrc && candidateIsrc) {
    return requestedIsrc === candidateIsrc ? 1 : 0;
  }

  const titleScore = diceCoefficient(normalizeTrackTitle(requested.title), normalizeTrackTitle(candidate.title));
  const artistScore = scoreArtists(requested.artists, candidate.artists);
  const durationScore = scoreDuration(requested.durationMs, candidate.durationMs);

  return clamp((titleScore * 0.45) + (artistScore * 0.35) + (durationScore * 0.2));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeIsrc(isrc: string | undefined): string | undefined {
  const normalized = isrc?.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return normalized || undefined;
}

function scoreArtists(requested: string[], candidate: string[]): number {
  const requestedPrimary = normalizeText(requested[0] ?? "");
  const candidatePrimary = normalizeText(candidate[0] ?? "");

  if (!requestedPrimary || !candidatePrimary) {
    return 0;
  }

  return diceCoefficient(requestedPrimary, candidatePrimary);
}

function scoreDuration(requestedDurationMs: number | undefined, candidateDurationMs: number | undefined): number {
  if (requestedDurationMs === undefined || candidateDurationMs === undefined) {
    return 0.5;
  }

  const difference = Math.abs(requestedDurationMs - candidateDurationMs);
  return clamp(1 - (difference / 30_000));
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) {
    return left ? 1 : 0;
  }

  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      pairs.set(pair, count - 1);
      matches += 1;
    }
  }

  return (2 * matches) / (left.length + right.length - 2);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
