/**
 * yt-dlp Stream Provider for discord-player-youtubei
 *
 * Two-stage pipeline for stable, buffered audio:
 *   1. yt-dlp resolves the direct audio URL (--get-url)
 *   2. FFmpeg fetches that URL directly with reconnect flags + large buffer
 *
 * IMPORTANT: Outputs raw PCM s16le at 48kHz stereo.
 * discord-player handles the Opus encoding internally — providing pre-encoded
 * Opus causes double-encoding, which leads to pitch/speed anomalies and stutter.
 *
 * Usage in index.ts:
 *   import { createYtDlpStreamFunction } from "./lib/ytdlp-stream";
 *   player.extractors.register(YoutubeiExtractor, {
 *     createStream: createYtDlpStreamFunction,
 *     ...
 *   });
 *
 * Requirements: yt-dlp and ffmpeg must be installed and on PATH
 */

import { spawn, execFile, type ChildProcess } from "child_process";
import { Readable, PassThrough } from "stream";

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
 * Creates a stable, buffered readable audio stream using FFmpeg
 * fetching directly from the resolved audio URL.
 *
 * Key design decisions:
 *
 *   OUTPUT FORMAT: Raw PCM s16le at 48kHz stereo
 *   discord-player expects to handle Opus encoding itself. Providing pre-encoded
 *   Opus (OGG container) caused double-encoding → pitch/speed drift and stutter.
 *   Raw PCM is the cleanest handoff.
 *
 *   RECONNECT FLAGS (HTTP-level):
 *     -reconnect 1                   Auto-reconnect on connection drop
 *     -reconnect_streamed 1          Reconnect even on non-seekable streams
 *     -reconnect_on_network_error 1  Reconnect on transient network errors
 *     -reconnect_delay_max 5         Max seconds between reconnect attempts
 *     -multiple_requests 1           Allow FFmpeg to reopen the URL if needed
 *
 *   BUFFERING:
 *     -thread_queue_size 4096        Large input thread queue to absorb jitter
 *     -analyzeduration 10000000      10s probe window — enough to lock onto
 *                                    variable-bitrate WebM/Opus streams
 *     -probesize 2000000             2MB probe for reliable format detection
 *     PassThrough highWaterMark 2MB  Absorbs up to ~80s of audio at 192kbps,
 *                                    surviving significant network hiccups
 */
function createFfmpegStream(directUrl: string): Readable {
  console.log("[FFmpeg] Spawning PCM stream with reconnect + buffering...");

  const ffmpeg = spawn(
    "ffmpeg",
    [
      // ── Input: fetch directly from YouTube's CDN ──
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-reconnect_delay_max",
      "5",
      "-multiple_requests",
      "1",

      // ── Input buffering ──
      "-thread_queue_size",
      "4096",
      "-analyzeduration",
      "10000000", // 10 seconds — reliable format lock
      "-probesize",
      "2000000", // 2MB probe

      "-i",
      directUrl,

      // ── Resilience ──
      "-fflags",
      "+discardcorrupt+genpts", // Discard corrupted frames, regenerate timestamps

      // ── Output: raw PCM — let discord-player handle Opus encoding ──
      "-vn", // No video
      "-c:a",
      "pcm_s16le", // Raw 16-bit signed little-endian PCM
      "-ar",
      "48000", // 48kHz (Discord native sample rate)
      "-ac",
      "2", // Stereo
      "-f",
      "s16le", // Raw PCM container
      "-loglevel",
      "warning",

      "pipe:1", // Output to stdout
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // ── PassThrough with generous buffer ──
  // 2MB ≈ ~10s of 48kHz stereo s16le PCM audio
  const output = new PassThrough({
    highWaterMark: 2 * 1024 * 1024,
  });

  ffmpeg.stdout.pipe(output);

  // ── Logging ──
  ffmpeg.stderr.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (
      msg &&
      !msg.startsWith("ffmpeg version") &&
      !msg.startsWith("built with") &&
      !msg.startsWith("configuration:")
    ) {
      console.warn("[FFmpeg]", msg);
    }
  });

  ffmpeg.on("error", (err: Error) => {
    console.error("[FFmpeg] Process error:", err.message);
    if (!output.destroyed) output.destroy(err);
  });

  ffmpeg.on("close", (code: number | null) => {
    console.log("[FFmpeg] Process exited with code:", code);
    if (!output.destroyed) output.end();
  });

  // Cleanup: if consumer ends early (skip/stop), kill FFmpeg
  output.on("close", () => {
    killProcess(ffmpeg);
  });

  return output;
}

/**
 * Safely kill a child process.
 */
function killProcess(proc: ChildProcess) {
  try {
    if (proc.exitCode === null && !proc.killed) {
      proc.kill("SIGTERM");
    }
  } catch {
    // Already dead — ignore
  }
}

/**
 * A createStream function compatible with discord-player-youtubei's options.
 * Pass this directly as the `createStream` option when registering the extractor.
 *
 * Two-stage flow:
 *   1. yt-dlp --get-url  →  resolves the direct CDN audio URL
 *   2. FFmpeg fetches that URL with reconnect + buffer  →  outputs raw PCM stream
 */
export async function createYtDlpStreamFunction(
  query: { url: string },
  _extractor: unknown,
): Promise<Readable> {
  const videoId = extractVideoId(query.url);
  if (!videoId) {
    throw new Error(`[YT-DLP] Could not extract video ID from: ${query.url}`);
  }

  console.log("[YT-DLP] Streaming video:", videoId);

  // Stage 1: Resolve direct URL via yt-dlp
  const directUrl = await getDirectAudioUrl(videoId);

  // Stage 2: Stream via FFmpeg with reconnect + buffering → raw PCM
  return createFfmpegStream(directUrl);
}
