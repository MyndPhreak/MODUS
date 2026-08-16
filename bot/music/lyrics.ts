import type { LyricsData, LyricsLine } from "./types";

interface LavaLyricsResponse {
  name?: string;
  track?: { title?: string; author?: string };
  author?: string;
  sourceName?: string;
  provider?: string;
  synced?: boolean;
  lines?: Array<{
    timestamp?: number;
    time?: number;
    line?: string;
    text?: string;
  }>;
  text?: string;
}

interface LrclibResponse {
  id?: number;
  name?: string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

/**
 * Parses LRC format strings ("[00:12.34] Lyrics text") into timestamped lines.
 */
export function parseLrc(lrcText: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  const regex = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)$/;

  for (const rawLine of lrcText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const match = regex.exec(trimmed);
    if (match) {
      const minutes = parseInt(match[1] ?? "0", 10);
      const seconds = parseInt(match[2] ?? "0", 10);
      const millisRaw = match[3] ?? "0";
      const millis = millisRaw.length === 2 ? parseInt(millisRaw, 10) * 10 : parseInt(millisRaw, 10);
      const timeMs = (minutes * 60 + seconds) * 1000 + millis;
      const text = match[4]?.trim() ?? "";
      if (text) {
        lines.push({ timeMs, text });
      }
    } else {
      // Plain text line inside LRC
      const clean = trimmed.replace(/^\[[^\]]+\]\s*/, "");
      if (clean) lines.push({ text: clean });
    }
  }

  return lines;
}

/**
 * Normalizes artist and title by stripping noise like "(Official Video)", "[Lyrics]", "ft. X".
 */
export function cleanSongQuery(title: string, artist?: string): { cleanTitle: string; cleanArtist: string } {
  let cleanTitle = title
    .replace(/\s*[\(\[\{]\s*(?:official|music|lyric|lyrics?|video|audio|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|\s+)+\s*[\)\]\}]/gi, "")
    .replace(/\s*[\(\[\{]\s*(?:feat\.|ft\.|featuring)\s+[^\)\]\}]+[\)\]\}]/gi, "")
    .replace(/\s*-\s*(?:official\s+)?(?:music\s+|lyric\s+)?(?:video|audio|lyrics?)\s*$/gi, "")
    .trim();

  let cleanArtist = (artist ?? "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*VEVO$/i, "")
    .trim();

  // If title is "Artist - Title", split it
  if (!cleanArtist && cleanTitle.includes(" - ")) {
    const parts = cleanTitle.split(" - ");
    if (parts.length >= 2) {
      cleanArtist = parts[0]?.trim() ?? "";
      cleanTitle = parts.slice(1).join(" - ").trim();
    }
  }

  return { cleanTitle, cleanArtist };
}

/**
 * Resolves lyrics from LRCLIB open database.
 */
export async function fetchLrclibLyrics(
  title: string,
  artist?: string,
  durationSeconds?: number,
): Promise<LyricsData | null> {
  const { cleanTitle, cleanArtist } = cleanSongQuery(title, artist);
  try {
    const params = new URLSearchParams({
      track_name: cleanTitle,
      ...(cleanArtist ? { artist_name: cleanArtist } : {}),
      ...(durationSeconds ? { duration: String(Math.round(durationSeconds)) } : {}),
    });

    let res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { "User-Agent": "MODUS Discord Bot (https://github.com/MyndPhreak/MODUS)" },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok && res.status === 404) {
      // Fallback to fuzzy search query on LRCLIB
      const searchParams = new URLSearchParams({
        q: `${cleanArtist} ${cleanTitle}`.trim(),
      });
      res = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
        headers: { "User-Agent": "MODUS Discord Bot (https://github.com/MyndPhreak/MODUS)" },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const results = (await res.json()) as LrclibResponse[];
        if (Array.isArray(results) && results.length > 0) {
          const first = results[0]!;
          return formatLrclibResponse(first, cleanTitle, cleanArtist);
        }
      }
      return null;
    }

    if (!res.ok) return null;
    const data = (await res.json()) as LrclibResponse;
    return formatLrclibResponse(data, cleanTitle, cleanArtist);
  } catch {
    return null;
  }
}

function formatLrclibResponse(
  data: LrclibResponse,
  fallbackTitle: string,
  fallbackArtist: string,
): LyricsData | null {
  if (data.instrumental) {
    return {
      trackTitle: data.trackName ?? data.name ?? fallbackTitle,
      artist: data.artistName ?? fallbackArtist,
      source: "LRCLIB (Instrumental)",
      synced: false,
      lines: [{ text: "🎵 Instrumental track — no lyrics available." }],
      text: "🎵 Instrumental track — no lyrics available.",
    };
  }

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    const plain = lines.map((l) => l.text).join("\n");
    return {
      trackTitle: data.trackName ?? data.name ?? fallbackTitle,
      artist: data.artistName ?? fallbackArtist,
      source: "LRCLIB",
      synced: true,
      lines,
      text: plain || data.plainLyrics || "",
    };
  }

  if (data.plainLyrics) {
    const lines = data.plainLyrics
      .split(/\r?\n/)
      .map((l) => ({ text: l.trim() }))
      .filter((l) => l.text.length > 0);
    return {
      trackTitle: data.trackName ?? data.name ?? fallbackTitle,
      artist: data.artistName ?? fallbackArtist,
      source: "LRCLIB",
      synced: false,
      lines,
      text: data.plainLyrics,
    };
  }

  return null;
}

/**
 * Normalizes LavaLyrics response format into canonical LyricsData.
 */
export function normalizeLavaLyrics(data: LavaLyricsResponse): LyricsData | null {
  const rawLines = data.lines ?? [];
  const lines: LyricsLine[] = rawLines.map((item) => ({
    ...(item.timestamp !== undefined ? { timeMs: item.timestamp } : item.time !== undefined ? { timeMs: item.time } : {}),
    text: item.line ?? item.text ?? "",
  })).filter((item) => item.text.length > 0);

  const text = data.text ?? lines.map((l) => l.text).join("\n");
  if (!text.trim() && lines.length === 0) return null;

  return {
    trackTitle: data.name ?? data.track?.title,
    artist: data.author ?? data.track?.author,
    source: data.provider ?? data.sourceName ?? "Lavalink",
    synced: data.synced ?? lines.some((l) => l.timeMs !== undefined),
    lines: lines.length > 0 ? lines : text.split(/\r?\n/).map((t) => ({ text: t.trim() })).filter((t) => t.text),
    text,
  };
}
