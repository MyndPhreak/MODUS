/**
 * yt-dlp Stream Provider for discord-player-youtubei
 *
 * Two-stage pipeline for stable, buffered audio:
 *   1. yt-dlp resolves the direct audio URL (--get-url)
 *   2. FFmpeg fetches that URL directly with reconnect flags + large buffer
 *
 * This gives FFmpeg real HTTP-level reconnect capability (the -reconnect
 * flags only work on HTTP/HTTPS inputs, NOT on pipe:0 stdin).
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
 * Key FFmpeg flags:
 *   -reconnect 1              Auto-reconnect on connection drop
 *   -reconnect_streamed 1     Reconnect even on streamed (non-seekable) inputs
 *   -reconnect_delay_max 5    Max seconds between reconnect attempts
 *   -multiple_requests 1      Allow FFmpeg to reopen the URL if needed
 *
 * Output: OGG/Opus container — discord-player can identify and process this
 */
function createFfmpegStream(directUrl: string): Readable {
  console.log("[FFmpeg] Spawning with reconnect flags...");

  const ffmpeg = spawn(
    "ffmpeg",
    [
      // ── Input: fetch directly from YouTube's CDN ──
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-multiple_requests",
      "1",

      "-i",
      directUrl,

      // ── Buffering ──
      "-analyzeduration",
      "0", // Skip analysis delay (we know it's audio)
      "-fflags",
      "+discardcorrupt", // Discard corrupted frames instead of dying

      // ── Output: OGG/Opus (self-describing format discord-player can probe) ──
      "-vn", // No video
      "-c:a",
      "libopus", // Encode as Opus
      "-b:a",
      "128k", // 128kbps — good quality for Discord
      "-ar",
      "48000", // 48kHz (Discord native sample rate)
      "-ac",
      "2", // Stereo
      "-f",
      "ogg", // OGG container
      "-loglevel",
      "warning",

      "pipe:1", // Output to stdout
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // ── PassThrough with generous buffer ──
  const output = new PassThrough({
    highWaterMark: 512 * 1024, // 512KB output buffer
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
 *   2. FFmpeg fetches that URL with reconnect + buffer  →  outputs OGG/Opus stream
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

  // Stage 2: Stream via FFmpeg with reconnect + buffering
  return createFfmpegStream(directUrl);
}
