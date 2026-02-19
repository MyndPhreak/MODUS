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
 * Uses yt-dlp to resolve the direct audio stream URL for a video.
 * This is fast (~1-2s) since it doesn't download anything.
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
        "bestaudio[ext=webm]/bestaudio/best",
        "--get-url", // Just print the direct URL, don't download
        "--no-cache-dir",
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
 * A createStream function compatible with discord-player-youtubei's options.
 * Pass this directly as the `createStream` option when registering the extractor.
 *
 * Returns the resolved direct URL as a string. discord-player's internal FFmpeg
 * pipeline will handle fetching and transcoding with its own reconnect flags.
 * This avoids double-FFmpeg piping which caused EPIPE errors.
 */
export async function createYtDlpStreamFunction(
  query: { url: string },
  _extractor: unknown,
): Promise<string | Readable> {
  const videoId = extractVideoId(query.url);
  if (!videoId) {
    throw new Error(`[YT-DLP] Could not extract video ID from: ${query.url}`);
  }

  console.log("[YT-DLP] Streaming video:", videoId);

  // Resolve direct URL via yt-dlp, then return the URL string.
  // discord-player's FFmpeg will fetch it directly with reconnect + buffering.
  const directUrl = await getDirectAudioUrl(videoId);
  return directUrl;
}
