/**
 * yt-dlp Stream Provider for discord-player-youtubei
 *
 * Uses yt-dlp to resolve direct audio URLs from YouTube, bypassing
 * the 30-second throttle that affects the native youtubei streaming.
 *
 * Returns the resolved URL as a string so that discord-player's internal
 * FFmpeg pipeline handles the actual streaming. This avoids a double-FFmpeg
 * issue where our custom FFmpeg outputs raw PCM → discord-player pipes it
 * into a second FFmpeg that can't probe the headerless PCM → EPIPE.
 *
 * Usage in index.ts:
 *   import { createYtDlpStreamFunction } from "./lib/ytdlp-stream";
 *   player.extractors.register(YoutubeiExtractor, {
 *     createStream: createYtDlpStreamFunction,
 *     ...
 *   });
 *
 * Requirements: yt-dlp must be installed and on PATH
 */

import { execFile } from "child_process";
import { Readable } from "stream";

/**
 * Extracts a YouTube video ID from various URL formats.
 */
function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get("v");
    if (v) return v;
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0];
    }
    const pathParts = parsed.pathname.split("/");
    return pathParts[pathParts.length - 1]?.split("?")[0] || null;
  } catch {
    return null;
  }
}

/**
 * Uses yt-dlp to resolve the direct audio stream URL for a known YouTube video ID.
 * Fast (~1-2s) since it doesn't download anything.
 */
function getDirectAudioUrl(videoId: string): Promise<string> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "--no-warnings",
        "--no-check-certificates",
        "--format",
        // Format 140 = m4a/AAC 128k — MPEG-4 container probes instantly.
        // Avoid webm/opus: FFmpeg must scan the entire Matroska header before
        // it can start streaming, which triggers discord-voip's ~5 s probe
        // timeout under YouTube CDN throttling on server IPs.
        "140/bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best",
        "--get-url", // Just print the direct URL, don't download
        "--no-cache-dir",
        "--no-playlist", // Never expand playlists — we pass single video IDs
        "--quiet",
        videoUrl,
      ],
      { timeout: 15000 }, // 15 second timeout for URL resolution
      (error, stdout, stderr) => {
        if (error) {
          console.error(
            "[YT-DLP] URL resolution failed:",
            stderr?.trim() || error.message,
          );
          reject(new Error(`yt-dlp URL resolution failed: ${error.message}`));
          return;
        }

        const directUrl = stdout.trim();
        if (!directUrl) {
          reject(new Error("yt-dlp returned empty URL"));
          return;
        }

        console.log(
          "[YT-DLP] Resolved direct URL (length:",
          directUrl.length,
          "chars)",
        );
        resolve(directUrl);
      },
    );
  });
}

/**
 * Uses yt-dlp to search YouTube for a text query and return the direct
 * audio URL of the first result. Used to bridge Spotify/Apple Music tracks
 * to YouTube audio.
 */
function searchYouTubeForAudio(searchQuery: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "--no-warnings",
        "--no-check-certificates",
        "--format",
        "140/bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best",
        "--get-url",
        "--no-cache-dir",
        "--no-playlist",
        "--quiet",
        "--default-search",
        "ytsearch1", // Search YouTube, take the first result only
        searchQuery,
      ],
      { timeout: 20000 }, // slightly longer timeout for search
      (error, stdout, stderr) => {
        if (error) {
          console.error(
            "[YT-DLP] YouTube search failed:",
            stderr?.trim() || error.message,
          );
          reject(new Error(`yt-dlp search failed: ${error.message}`));
          return;
        }

        // yt-dlp may return multiple lines; take the first non-empty one
        const directUrl = stdout.split("\n").find((l) => l.trim()) || "";
        if (!directUrl) {
          reject(new Error("yt-dlp search returned empty URL"));
          return;
        }

        console.log(
          `[YT-DLP] Bridged "${searchQuery}" → URL (length: ${directUrl.length} chars)`,
        );
        resolve(directUrl);
      },
    );
  });
}

/**
 * A createStream function compatible with discord-player-youtubei's options.
 * Pass this directly as the `createStream` option when registering the extractor.
 *
 * The Youtubei extractor passes a Track object with a .url property, but the
 * Spotify extractor passes a raw URL string — we handle both.
 */
export async function createYtDlpStreamFunction(
  query: { url: string } | string,
  _extractor: unknown,
): Promise<string | Readable> {
  const url = typeof query === "string" ? query : query.url;
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error(`[YT-DLP] Could not extract video ID from: ${url}`);
  }

  console.log("[YT-DLP] Streaming video:", videoId);
  return getDirectAudioUrl(videoId);
}

/**
 * A createStream function for the SpotifyExtractor.
 *
 * SpotifyExtractor cannot stream audio directly — it only resolves metadata.
 * When it needs to stream a track, this function bridges by searching YouTube
 * for "Artist - Title" via yt-dlp and returning the first result's direct
 * audio URL.
 *
 * SpotifyExtractor calls: createStream(extractor, trackUrl)
 * The Track object with title/author is available on the extractor context.
 *
 * Usage in index.ts:
 *   import { SpotifyExtractor } from "@discord-player/extractor";
 *   import { createSpotifyBridgeStreamFunction } from "./lib/ytdlp-stream";
 *
 *   player.extractors.register(SpotifyExtractor, {
 *     createStream: createSpotifyBridgeStreamFunction,
 *   });
 */
export async function createSpotifyBridgeStreamFunction(
  _extractor: unknown,
  trackUrl: string,
  track?: {
    title?: string;
    author?: string;
    raw?: { title?: string; artist?: string };
  },
): Promise<string | Readable> {
  // Build the best possible YouTube search query from available metadata
  const title = track?.title || track?.raw?.title || "Unknown Title";
  const artist = track?.author || track?.raw?.artist || "";

  const searchQuery = artist ? `${artist} - ${title}` : title;
  console.log(`[YT-DLP] Bridging Spotify track: "${searchQuery}"`);

  return searchYouTubeForAudio(searchQuery);
}
