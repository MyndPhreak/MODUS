import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  ChannelType,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import {
  joinVoiceChannel,
  VoiceConnection,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} from "@discordjs/voice";
import { useMainPlayer } from "discord-player";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { Transform, TransformCallback } from "stream";
import os from "os";
import type { ModuleManager } from "../ModuleManager";
import type { BotModule } from "../ModuleManager";
import {
  RecordingSettingsSchema,
  type RecordingSettings,
} from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";
import { speakInConnection, isTTSAvailable } from "../lib/tts";
import { resolveVoice } from "../lib/ttsVoices";

// ─── Types ───────────────────────────────────────────────────────────────

interface RecordingSession {
  guildId: string;
  channelId: string;
  channelName: string;
  recordedBy: string;
  startedAt: Date;
  connection: VoiceConnection;
  userStreams: Map<string, UserRecordingStream>;
  maxDurationTimer: NodeJS.Timeout;
  recordingDocId?: string;
  bitrate: number;
  multitrack: boolean;
}

interface UserRecordingStream {
  ffmpegProcess: ChildProcess;
  tempFilePath: string;
  username: string;
  startOffset: number; // ms from session start when first audio arrived (-1 = none yet)
  silencePad: SilencePadTransform; // fills gaps so files are temporally accurate
  // Speech segment tracking
  segments: { t: number; d: number }[]; // completed segments: t=timeline start ms, d=duration ms
  _segStart: number; // current segment start (timeline ms), -1 if silent
  _segPackets: number; // opus packets in current segment (each = 20ms audio)
  _segTimer: NodeJS.Timeout | null; // silence debounce
}

// Defaults + type are defined in lib/schemas.ts (RecordingSettingsSchema)

// ─── Active Sessions ─────────────────────────────────────────────────────

const DEFAULT_ANNOUNCE_TEXT =
  "Recording has started in {channel}. All audio is being captured.";

function resolveAnnounceText(
  settings: { announceText: string },
  channelName: string,
): string {
  const raw = settings.announceText.trim() || DEFAULT_ANNOUNCE_TEXT;
  return raw.replaceAll("{channel}", channelName);
}

export const activeSessions = new Map<string, RecordingSession>();

/** Module-scoped reference to ModuleManager, set when execute() is first called */
let _moduleManager: ModuleManager | null = null;

// ─── Silence-Gap Padding ─────────────────────────────────────────────────
// Discord only sends Opus packets while a user is speaking. Once decoded to
// PCM, gaps between utterances simply have NO data — FFmpeg sees a continuous
// byte stream with the silence stripped out. This means mixed tracks sound
// concatenated instead of overlaid at their correct timeline positions.
//
// SilencePadTransform sits between the PCM decoder and FFmpeg's stdin. When
// data arrives after a gap (>60 ms), it first writes the corresponding number
// of 20 ms silence frames so the PCM stream is temporally faithful.

/** 20 ms of silence at 48 kHz, stereo, s16le = 48000 × 0.02 × 2ch × 2B = 3840 bytes */
const SILENCE_FRAME = Buffer.alloc(3840);
const FRAME_DURATION_MS = 20;
/** Only inject silence when the gap is clearly a speech pause, not jitter. */
const GAP_THRESHOLD_MS = 60;
/** Max silence to inject per gap — prevents OOM on very long pauses. */
const MAX_GAP_MS = 30_000;
/** Batch size for silence writes: 1 second = 50 frames × 3840 B = 192 KB */
const BATCH_FRAMES = 50;

class SilencePadTransform extends Transform {
  lastChunkTime = 0;

  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    const now = Date.now();

    if (this.lastChunkTime > 0) {
      const gapMs = Math.min(now - this.lastChunkTime, MAX_GAP_MS);
      if (gapMs > GAP_THRESHOLD_MS) {
        // Fill the gap in batched 1-second chunks to avoid event-loop blocking
        const framesToInsert = Math.floor(gapMs / FRAME_DURATION_MS) - 1;
        const batchBuf = Buffer.alloc(
          SILENCE_FRAME.length * Math.min(framesToInsert, BATCH_FRAMES),
        );
        let remaining = framesToInsert;
        while (remaining > 0) {
          const count = Math.min(remaining, BATCH_FRAMES);
          this.push(
            count === BATCH_FRAMES
              ? batchBuf
              : batchBuf.subarray(0, count * SILENCE_FRAME.length),
          );
          remaining -= count;
        }
      }
    }

    this.lastChunkTime = now;
    callback(null, chunk);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function getSettings(
  moduleManager: ModuleManager,
  guildId: string,
): Promise<RecordingSettings> {
  const saved = await moduleManager.databaseService.getModuleSettings(
    guildId,
    "recording",
  );

  // Backward compatibility: migrate old ttsAnnounce boolean → announceMode
  const raw: Record<string, unknown> = { ...(saved ?? {}) };
  if ("ttsAnnounce" in raw && !("announceMode" in raw)) {
    raw.announceMode = (raw as any).ttsAnnounce ? "tts" : "none";
  }

  const parsed = parseSettings(
    RecordingSettingsSchema,
    raw,
    "recording",
    guildId,
  );
  return parsed ?? RecordingSettingsSchema.parse({});
}

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), "modus-recordings");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function hasRecordingPermission(
  member: GuildMember,
  settings: RecordingSettings,
): Promise<boolean> {
  // Server admins always have permission
  if (member.permissions.has("Administrator")) return true;

  // If no restrictions set, only admins can record
  if (
    settings.allowedRoleIds.length === 0 &&
    settings.allowedUserIds.length === 0
  )
    return false;

  // Check user IDs
  if (settings.allowedUserIds.includes(member.id)) return true;

  // Check role IDs
  for (const roleId of settings.allowedRoleIds) {
    if (member.roles.cache.has(roleId)) return true;
  }

  return false;
}

async function updateNickname(member: GuildMember | null, recording: boolean) {
  if (!member) return;
  try {
    if (recording) {
      await member.setNickname("🔴Recording");
    } else {
      await member.setNickname(null);
    }
  } catch (err) {
    _moduleManager?.logger.warn(
      `Could not update nickname: ${(err as Error).message}`,
      undefined,
      "recording",
    );
  }
}

// ─── Sound Clip Playback ─────────────────────────────────────────────────

async function playAnnounceSoundClip(
  connection: VoiceConnection,
  moduleManager: ModuleManager,
  fileId: string,
): Promise<void> {
  let player: ReturnType<typeof createAudioPlayer> | undefined;
  let subscription: ReturnType<VoiceConnection["subscribe"]> | undefined;

  try {
    _moduleManager?.logger.info(`Downloading announce sound clip: ${fileId}`, undefined, "recording");

    // Download the file from Appwrite
    const fileBuffer =
      await moduleManager.databaseService.getRecordingFileBuffer(fileId);

    _moduleManager?.logger.info(
      `Downloaded announce clip: ${fileBuffer.length} bytes`,
      undefined,
      "recording",
    );

    if (fileBuffer.length === 0) {
      _moduleManager?.logger.warn("Announce sound clip is empty, skipping.", undefined, "recording");
      return;
    }

    // Write to a temp file so FFmpeg can decode it
    const tempFile = path.join(getTempDir(), `announce_${Date.now()}.tmp`);
    fs.writeFileSync(tempFile, fileBuffer);

    // Use FFmpeg to decode the file to raw PCM
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        tempFile,
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }, // pipe stderr too for diagnostics
    );

    // Capture stderr for diagnostics
    let ffmpegStderr = "";
    ffmpeg.stderr?.on("data", (chunk: Buffer) => {
      ffmpegStderr += chunk.toString();
    });

    ffmpeg.on("error", (err) => {
      _moduleManager?.logger.error("FFmpeg spawn error", undefined, err, "recording");
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        _moduleManager?.logger.error(
          `FFmpeg announce decode exited ${code}`,
          undefined,
          ffmpegStderr.slice(-500),
          "recording",
        );
      } else {
        _moduleManager?.logger.info("FFmpeg announce decode completed OK", undefined, "recording");
      }
    });

    const resource = createAudioResource(ffmpeg.stdout!, {
      inputType: StreamType.Raw,
    });

    player = createAudioPlayer();
    subscription = connection.subscribe(player);
    player.play(resource);

    _moduleManager?.logger.info("Announce playback started", undefined, "recording");

    // Wait for playback to finish (max 10s safety)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        _moduleManager?.logger.warn("Announce playback timed out after 10s", undefined, "recording");
        player?.stop(true);
        resolve();
      }, 10_000);

      player!.on(AudioPlayerStatus.Idle, () => {
        _moduleManager?.logger.info("Announce playback finished (idle)", undefined, "recording");
        clearTimeout(timeout);
        resolve();
      });

      player!.on("error", (err) => {
        _moduleManager?.logger.error("Announce player error", undefined, err, "recording");
        clearTimeout(timeout);
        resolve();
      });
    });

    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  } catch (err) {
    _moduleManager?.logger.error(
      "Failed to play announce sound clip",
      undefined,
      err,
      "recording",
    );
  } finally {
    // CRITICAL: Clean up the audio player and unsubscribe from the connection
    // so it doesn't interfere with the recording receiver.
    if (player) {
      player.stop(true);
    }
    if (subscription) {
      subscription.unsubscribe();
    }

    // Brief delay to let the voice connection stabilize before recording starts
    await new Promise((r) => setTimeout(r, 500));
    _moduleManager?.logger.info("Announce clip cleanup complete", undefined, "recording");
  }
}

// ─── Recording Logic ─────────────────────────────────────────────────────

function startUserRecording(
  session: RecordingSession,
  userId: string,
  username: string,
  bitrate: number,
) {
  if (session.userStreams.has(userId)) return; // Already recording this user

  const tempFile = path.join(
    getTempDir(),
    `${session.guildId}_${userId}_${Date.now()}.ogg`,
  );

  // Spawn FFmpeg to encode raw s16le PCM → OGG Opus
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "s16le", // Input format: signed 16-bit little-endian PCM
      "-ar",
      "48000", // Sample rate: 48kHz (Discord standard)
      "-ac",
      "2", // Channels: stereo
      "-i",
      "pipe:0", // Read from stdin
      "-c:a",
      "libopus", // Encode with Opus
      "-b:a",
      `${bitrate}k`, // Configurable bitrate
      "-vbr",
      "on",
      "-application",
      "voip", // Optimized for voice
      tempFile,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );

  ffmpeg.stderr?.on("data", (data: Buffer) => {
    // Only log errors, not progress
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      _moduleManager?.logger.error(`FFmpeg error for ${username}`, undefined, msg, "recording");
    }
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== 255) {
      _moduleManager?.logger.warn(
        `FFmpeg exited with code ${code} for ${username}`,
        undefined,
        "recording",
      );
    }
  });

  // Subscribe to the user's audio stream
  const receiver = session.connection.receiver;

  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.Manual },
  });

  // Discord sends Opus packets — we need to decode them to PCM for our FFmpeg pipeline
  // Use prism-media's Opus decoder to convert to raw PCM
  const prism = require("prism-media");
  const decoder = new prism.opus.Decoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  });

  // Track data flow, capture temporal offset, and build speech segments
  const SILENCE_THRESHOLD_MS = 300;
  let opusPacketCount = 0;
  opusStream.on("data", () => {
    opusPacketCount++;
    const stream = session.userStreams.get(userId);
    if (!stream) return;

    const timelineMs = Date.now() - session.startedAt.getTime();

    // Capture start_offset from first packet
    if (opusPacketCount === 1 && stream.startOffset < 0) {
      stream.startOffset = timelineMs;
      _moduleManager?.logger.info(
        `First opus packet for ${username} — offset: ${timelineMs}ms`,
        undefined,
        "recording",
      );
    }

    // ── Speech segment tracking ──
    if (stream._segStart < 0) {
      // New speech segment starting
      stream._segStart = timelineMs;
      stream._segPackets = 0;
    }
    stream._segPackets++;

    // Reset silence debounce
    if (stream._segTimer) clearTimeout(stream._segTimer);
    stream._segTimer = setTimeout(() => {
      if (stream._segStart >= 0) {
        stream.segments.push({
          t: stream._segStart,
          d: stream._segPackets * 20, // each opus packet = 20ms
        });
        stream._segStart = -1;
        stream._segPackets = 0;
      }
    }, SILENCE_THRESHOLD_MS);
  });

  const silencePad = new SilencePadTransform();
  opusStream.pipe(decoder).pipe(silencePad).pipe(ffmpeg.stdin!);

  opusStream.on("error", (err: Error) => {
    // DAVE decryption failures may surface here as stream errors.
    // Our pnpm patch prevents stream destruction, but log for observability.
    _moduleManager?.logger.warn(
      `Opus stream error for ${username} (non-fatal): ${err.message}`,
      undefined,
      "recording",
    );
  });

  // Detect unexpected stream destruction (e.g. if library patch is missing)
  opusStream.on("close", () => {
    const stream = session.userStreams.get(userId);
    if (stream && activeSessions.has(session.guildId)) {
      _moduleManager?.logger.warn(
        `Opus stream closed unexpectedly for ${username} — ` +
          `DAVE decryption may have failed. ` +
          `Captured ${opusPacketCount} packets before close.`,
        undefined,
        "recording",
      );
    }
  });

  decoder.on("error", (err: Error) => {
    // Corrupted packets during DAVE key transitions can cause decode errors.
    // Log but don't crash — the pipeline will skip the bad frame.
    _moduleManager?.logger.warn(
      `Decoder error for ${username} (non-fatal): ${err.message}`,
      undefined,
      "recording",
    );
  });

  ffmpeg.stdin?.on("error", (err: Error) => {
    // EPIPE is expected when FFmpeg closes before all data is written
    if ((err as any).code !== "EPIPE") {
      _moduleManager?.logger.error(
        `FFmpeg stdin error for ${username}`,
        undefined,
        err,
        "recording",
      );
    }
  });

  session.userStreams.set(userId, {
    ffmpegProcess: ffmpeg,
    tempFilePath: tempFile,
    username,
    startOffset: -1,
    silencePad,
    segments: [],
    _segStart: -1,
    _segPackets: 0,
    _segTimer: null,
  });

  _moduleManager?.logger.info(`Started recording user: ${username} (${userId})`, undefined, "recording");
}

async function stopRecording(
  session: RecordingSession,
  moduleManager: ModuleManager,
): Promise<{
  duration: number;
  trackCount: number;
  recordingId: string;
}> {
  const endedAt = new Date();
  const duration = Math.round(
    (endedAt.getTime() - session.startedAt.getTime()) / 1000,
  );

  // Clear the max duration timer
  clearTimeout(session.maxDurationTimer);

  // Close all user streams
  const closePromises: Promise<void>[] = [];

  for (const [userId, stream] of session.userStreams) {
    // Finalize any in-progress speech segment before closing
    if (stream._segTimer) clearTimeout(stream._segTimer);
    if (stream._segStart >= 0) {
      stream.segments.push({
        t: stream._segStart,
        d: stream._segPackets * 20,
      });
      stream._segStart = -1;
    }

    closePromises.push(
      new Promise<void>((resolve) => {
        // Close the FFmpeg stdin to signal EOF
        stream.ffmpegProcess.stdin?.end();

        // Wait for FFmpeg to finish encoding
        stream.ffmpegProcess.on("close", () => resolve());

        // Safety timeout — kill if not done in 10s
        setTimeout(() => {
          try {
            stream.ffmpegProcess.kill("SIGKILL");
          } catch {}
          resolve();
        }, 10000);
      }),
    );

    // Unsubscribe from the user's audio stream
    try {
      session.connection.receiver.subscriptions.delete(userId);
    } catch {}
  }

  await Promise.all(closePromises);

  // Upload per-user tracks to Appwrite (multitrack only)
  const participants: string[] = [];
  const recordingId = session.recordingDocId!;

  if (session.multitrack) {
    // ── Multitrack (Premium): upload each user's track individually ──
    for (const [userId, stream] of session.userStreams) {
      try {
        if (!fs.existsSync(stream.tempFilePath)) {
          _moduleManager?.logger.warn(
            `Temp file missing for ${stream.username}: ${stream.tempFilePath}`,
            session.guildId,
            "recording",
          );
          continue;
        }
        const stats = fs.statSync(stream.tempFilePath);
        _moduleManager?.logger.info(
          `Track file for ${stream.username}: ${stats.size} bytes`,
          session.guildId,
          "recording",
        );
        if (stats.size < 1000) {
          _moduleManager?.logger.warn(
            `Skipping near-empty file for ${stream.username} (${stats.size} bytes)`,
            session.guildId,
            "recording",
          );
          fs.unlinkSync(stream.tempFilePath);
          continue;
        }

        // Streams the temp file to storage — avoids buffering the whole OGG
        // in memory. For R2, this becomes a multipart upload under a
        // `recordings/<guildId>/<recordingId>/...` key.
        const fileId = await moduleManager.databaseService.uploadRecordingTrack({
          guildId: session.guildId,
          recordingId,
          userId,
          filePath: stream.tempFilePath,
        });

        await moduleManager.databaseService.createRecordingTrack({
          recording_id: recordingId,
          guild_id: session.guildId,
          user_id: userId,
          username: stream.username,
          file_id: fileId,
          file_size: stats.size,
          start_offset: stream.startOffset >= 0 ? stream.startOffset : 0,
          segments: JSON.stringify(stream.segments),
        });

        participants.push(userId);

        // Clean up temp file
        fs.unlinkSync(stream.tempFilePath);
      } catch (err) {
        _moduleManager?.logger.error(
          `Failed to upload track for ${stream.username}`,
          session.guildId,
          err,
          "recording",
        );
        try {
          fs.unlinkSync(stream.tempFilePath);
        } catch {}
      }
    }
  } else {
    // ── Single-track: just collect participant IDs, temp files stay for mixing ──
    for (const [userId, stream] of session.userStreams) {
      if (
        fs.existsSync(stream.tempFilePath) &&
        fs.statSync(stream.tempFilePath).size >= 1000
      ) {
        participants.push(userId);
      }
    }
  }

  // Generate mixed file from all per-user tracks
  let mixedFileId: string | undefined;
  try {
    mixedFileId = await generateMixedTrack(session, moduleManager, recordingId);
  } catch (err) {
    _moduleManager?.logger.error("Failed to generate mixed track", session.guildId, err, "recording");
  }

  // Update recording metadata
  await moduleManager.databaseService.updateRecording(recordingId, {
    ended_at: endedAt.toISOString(),
    duration,
    participants: JSON.stringify(participants),
    mixed_file_id: mixedFileId || "",
  });

  // Disconnect from voice
  session.connection.destroy();
  activeSessions.delete(session.guildId);

  return { duration, trackCount: participants.length, recordingId };
}

async function generateMixedTrack(
  session: RecordingSession,
  moduleManager: ModuleManager,
  recordingId: string,
): Promise<string | undefined> {
  // ── Collect input files + offset metadata ──────────────────────────────
  interface MixInput {
    tempPath: string;
    startOffset: number;
    ownsFile: boolean; // true = we created the temp file & must delete it
  }
  const inputs: MixInput[] = [];

  if (session.multitrack) {
    // Multitrack: tracks were already uploaded — download them for mixing
    const tracks =
      await moduleManager.databaseService.getRecordingTracks(recordingId);

    if (tracks.length === 0) return undefined;
    if (tracks.length === 1) return tracks[0].file_id;

    const tempDir = getTempDir();
    for (const track of tracks) {
      try {
        const buffer =
          await moduleManager.databaseService.getRecordingFileBuffer(
            track.file_id,
          );
        const tempPath = path.join(tempDir, `mix_input_${track.user_id}.ogg`);
        fs.writeFileSync(tempPath, buffer);
        inputs.push({
          tempPath,
          startOffset: track.start_offset || 0,
          ownsFile: true,
        });
      } catch (err) {
        _moduleManager?.logger.error(
          `Failed to download track for mixing: ${track.username}`,
          session.guildId,
          err,
          "recording",
        );
      }
    }
  } else {
    // Single-track: temp files still live on disk from the recording pipeline
    for (const [, stream] of session.userStreams) {
      if (
        fs.existsSync(stream.tempFilePath) &&
        fs.statSync(stream.tempFilePath).size >= 1000
      ) {
        inputs.push({
          tempPath: stream.tempFilePath,
          startOffset: stream.startOffset >= 0 ? stream.startOffset : 0,
          ownsFile: true, // cleanups happen here for single-track
        });
      }
    }
  }

  if (inputs.length === 0) return undefined;

  // Single file: encode and upload it directly (skip amix overhead)
  if (inputs.length === 1) {
    try {
      const fileId = await moduleManager.databaseService.uploadRecordingMix({
        guildId: session.guildId,
        recordingId,
        filePath: inputs[0].tempPath,
      });
      if (inputs[0].ownsFile) {
        try {
          fs.unlinkSync(inputs[0].tempPath);
        } catch {}
      }
      return fileId;
    } catch (err) {
      _moduleManager?.logger.error("Failed to upload single-track mix", session.guildId, err, "recording");
      return undefined;
    }
  }

  // ── Build FFmpeg filter graph ──────────────────────────────────────────
  const tempDir = getTempDir();
  const mixedPath = path.join(
    tempDir,
    `mixed_${session.guildId}_${Date.now()}.ogg`,
  );

  const inputArgs = inputs.flatMap((inp) => ["-i", inp.tempPath]);

  const filterParts: string[] = [];
  const mixLabels: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const delayMs = inputs[i].startOffset;
    if (delayMs > 0) {
      filterParts.push(`[${i}]adelay=${delayMs}|${delayMs}[d${i}]`);
      mixLabels.push(`[d${i}]`);
    } else {
      mixLabels.push(`[${i}]`);
    }
  }
  const mixInput = mixLabels.join("");
  const amix = `${mixInput}amix=inputs=${inputs.length}:duration=longest:normalize=0`;
  const filterComplex =
    filterParts.length > 0 ? `${filterParts.join(";")};${amix}` : amix;

  return new Promise<string | undefined>((resolve) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        ...inputArgs,
        "-filter_complex",
        filterComplex,
        "-c:a",
        "libopus",
        "-b:a",
        `${session.bitrate}k`,
        "-vbr",
        "on",
        "-application",
        "voip",
        mixedPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderrLog = "";
    ffmpeg.stderr?.on("data", (d: Buffer) => {
      stderrLog += d.toString();
    });

    ffmpeg.on("close", async (code) => {
      // Clean up input temp files
      for (const inp of inputs) {
        if (inp.ownsFile) {
          try {
            fs.unlinkSync(inp.tempPath);
          } catch {}
        }
      }

      if (code !== 0) {
        _moduleManager?.logger.error("FFmpeg mix failed", session.guildId, stderrLog.slice(-500), "recording");
        try {
          fs.unlinkSync(mixedPath);
        } catch {}
        resolve(undefined);
        return;
      }

      try {
        const fileId = await moduleManager.databaseService.uploadRecordingMix({
          guildId: session.guildId,
          recordingId,
          filePath: mixedPath,
        });
        fs.unlinkSync(mixedPath);
        resolve(fileId);
      } catch (err) {
        _moduleManager?.logger.error("Failed to upload mixed track", session.guildId, err, "recording");
        try {
          fs.unlinkSync(mixedPath);
        } catch {}
        resolve(undefined);
      }
    });
  });
}

// ─── Command Definitions ─────────────────────────────────────────────────

const recordCommand = new SlashCommandBuilder()
  .setName("record")
  .setDescription("Record voice channel audio")
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Start recording the voice channel")
      .addBooleanOption((opt) =>
        opt
          .setName("multitrack")
          .setDescription(
            "Record each user as a separate track (Premium only)",
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("stop")
      .setDescription("Stop the current recording")
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Optional title for the recording"),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Check if a recording is in progress"),
  )
  .toJSON();

// ─── Command Handlers ────────────────────────────────────────────────────

async function handleStart(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;

  // Check if already recording
  if (activeSessions.has(guildId)) {
    const session = activeSessions.get(guildId)!;
    const elapsed = Math.round(
      (Date.now() - session.startedAt.getTime()) / 1000,
    );
    await interaction.editReply({
      content: `⚠️ Already recording in **${session.channelName}** (${formatDuration(elapsed)} elapsed).`,
    });
    return;
  }

  // Check if music is currently playing in this guild
  try {
    const musicPlayer = useMainPlayer();
    const musicQueue = musicPlayer.queues.get(guildId);
    if (musicQueue && (musicQueue.isPlaying() || musicQueue.currentTrack)) {
      const stopButton = new ButtonBuilder()
        .setCustomId(`rec_stop_music_${guildId}`)
        .setLabel("Stop Music & Start Recording")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("⏹️");

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        stopButton,
      );

      const reply = await interaction.editReply({
        content:
          "⚠️ Music is currently playing in this server. You need to stop the music before starting a recording.\n\nClick the button below to stop music and start recording automatically.",
        components: [row],
      });

      // Listen for button click (60s timeout)
      try {
        const collected = await reply.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) =>
            i.customId === `rec_stop_music_${guildId}` &&
            i.user.id === member.id,
          time: 60_000,
        });

        // Stop the music queue
        try {
          const currentQueue = musicPlayer.queues.get(guildId);
          if (currentQueue) {
            currentQueue.delete();
            try {
              musicPlayer.queues.delete(guildId);
            } catch {}
          }
        } catch {}

        // Wait a moment for the voice connection to fully disconnect
        await new Promise((r) => setTimeout(r, 1000));

        await collected.update({
          content: "🎵 Music stopped. Starting recording...",
          components: [],
        });

        // Fall through to continue with recording start
      } catch {
        // Timeout — disable the button
        await interaction
          .editReply({
            content:
              "⏰ Timed out. Use `/record start` again when you're ready.",
            components: [],
          })
          .catch(() => {});
        return;
      }
    }
  } catch {
    // discord-player not initialized or no queues — safe to proceed
  }

  // Check voice channel
  if (!member?.voice?.channel) {
    await interaction.editReply({
      content: "❌ You need to be in a voice channel to start recording.",
    });
    return;
  }

  const voiceChannel = member.voice.channel;
  if (voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply({
      content: "❌ Recording only works in regular voice channels.",
    });
    return;
  }

  // Check permissions
  const settings = await getSettings(moduleManager, guildId);
  const hasPermission = await hasRecordingPermission(member, settings);
  if (!hasPermission) {
    await interaction.editReply({
      content:
        "❌ You don't have permission to record. Ask a server admin to add your role or user ID in the dashboard.",
    });
    return;
  }

  // Join voice channel
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: interaction.guild!.voiceAdapterCreator,
    selfDeaf: false, // Must not be deafened to receive audio
    selfMute: false, // Start unmuted so we can play announce clip
  });

  // Wait for connection to be ready
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    connection.destroy();
    await interaction.editReply({
      content: "❌ Failed to join voice channel. Please try again.",
    });
    return;
  }

  // Play announcement sound clip before recording starts (if configured)
  if (settings.announceMode === "soundClip" && settings.announceSoundFileId) {
    await interaction.editReply({
      content: "🔊 Playing announcement sound...",
    });
    await playAnnounceSoundClip(
      connection,
      moduleManager,
      settings.announceSoundFileId,
    );
  }

  // Play spoken announcement via Kokoro TTS (if configured)
  if (settings.announceMode === "tts") {
    if (!isTTSAvailable()) {
      _moduleManager?.logger.warn(
        'announceMode="tts" but KOKORO_BASE_URL is unset — skipping voice announcement',
        guildId,
        "recording",
      );
    } else {
      await interaction.editReply({ content: "🔊 Speaking announcement..." });
      const text = resolveAnnounceText(settings, voiceChannel.name);
      const selectedVoice = resolveVoice(settings.announceVoice || undefined);
      await speakInConnection(connection, text, {
        voice: selectedVoice?.apiVoice,
        speed: selectedVoice?.speed,
      }).catch((err) => {
        _moduleManager?.logger.error(
          "voice TTS announcement failed",
          guildId,
          err,
          "recording",
        );
      });
    }
  }

  // Resolve multitrack mode — premium-gated
  const wantsMultitrack = interaction.options.getBoolean("multitrack") ?? false;
  let multitrack = false;
  if (wantsMultitrack) {
    const isPremium =
      await moduleManager.databaseService.isGuildPremium(guildId);
    if (!isPremium) {
      await interaction.editReply({
        content:
          "❌ Multi-track recording is a **Premium** feature. Without Premium, all users are recorded into a single mixed track.",
      });
      return;
    }
    multitrack = true;
  }

  // Create recording metadata in Appwrite
  const recordingDocId = await moduleManager.databaseService.createRecording({
    guild_id: guildId,
    channel_name: voiceChannel.name,
    recorded_by: member.id,
    started_at: new Date().toISOString(),
    bitrate: settings.bitrate,
    multitrack,
  });

  // Create session
  const session: RecordingSession = {
    guildId,
    channelId: voiceChannel.id,
    channelName: voiceChannel.name,
    recordedBy: member.id,
    startedAt: new Date(),
    connection,
    userStreams: new Map(),
    maxDurationTimer: setTimeout(async () => {
      // Auto-stop after max duration
      try {
        const ch = interaction.channel;
        const result = await stopRecording(session, moduleManager);
        await updateNickname(interaction.guild?.members.me ?? null, false);

        if (ch) {
          const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("⏹️ Recording Auto-Stopped")
            .setDescription(
              `Maximum recording duration reached (${formatDuration(settings.maxDuration)}).`,
            )
            .addFields(
              {
                name: "Duration",
                value: formatDuration(result.duration),
                inline: true,
              },
              {
                name: "Tracks",
                value: `${result.trackCount} users`,
                inline: true,
              },
            );
          if (ch && "send" in ch) {
            (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
          }
        }
      } catch (err) {
        _moduleManager?.logger.error("Error during auto-stop", session?.guildId, err, "recording");
      }
    }, settings.maxDuration * 1000),
    recordingDocId,
    bitrate: settings.bitrate,
    multitrack,
  };

  activeSessions.set(guildId, session);

  // Start recording all users currently in the channel (up to the limit)
  for (const [userId, channelMember] of voiceChannel.members) {
    if (channelMember.user.bot) continue; // Don't record bots
    if (session.userStreams.size >= settings.maxConcurrentUsers) {
      _moduleManager?.logger.warn(
        `Concurrent user limit reached (${settings.maxConcurrentUsers}), skipping remaining members`,
        guildId,
        "recording",
      );
      break;
    }
    startUserRecording(
      session,
      userId,
      channelMember.displayName,
      settings.bitrate,
    );
  }

  // Listen for new users joining the channel
  connection.receiver.speaking.on("start", (userId: string) => {
    if (session.userStreams.has(userId)) return;
    if (session.userStreams.size >= settings.maxConcurrentUsers) return; // at capacity
    // Look up the member
    const guild = interaction.guild;
    if (!guild) return;
    guild.members
      .fetch(userId)
      .then((m) => {
        if (m.user.bot) return;
        if (session.userStreams.size >= settings.maxConcurrentUsers) return;
        startUserRecording(session, userId, m.displayName, settings.bitrate);
      })
      .catch(() => {});
  });

  // Set nickname to 🔴Recording
  await updateNickname(interaction.guild?.members.me ?? null, true);

  // Legacy "send a text message with Discord's tts flag" behavior.
  // Kept as an opt-in for anyone who relied on it before voice TTS existed.
  if (settings.announceMode === "textTts") {
    const ch = interaction.channel;
    if (ch && "send" in ch) {
      const text = resolveAnnounceText(settings, voiceChannel.name);
      await (ch as TextChannel)
        .send({ content: text, tts: true })
        .catch(() => {});
    }
  }

  // Confirmation embed
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔴 Recording Started")
    .setDescription(`Now recording **${voiceChannel.name}**`)
    .addFields(
      {
        name: "Bitrate",
        value: `${settings.bitrate} kbps`,
        inline: true,
      },
      {
        name: "Max Duration",
        value: formatDuration(settings.maxDuration),
        inline: true,
      },
      {
        name: "Users Detected",
        value: `${session.userStreams.size}`,
        inline: true,
      },
    )
    .setFooter({
      text: `Started by ${member.displayName} • Multi-track recording active`,
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleStop(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
) {
  const guildId = interaction.guildId!;
  const session = activeSessions.get(guildId);

  if (!session) {
    await interaction.editReply({
      content: "❌ No active recording in this server.",
    });
    return;
  }

  // Only allow the person who started it or admins to stop
  const member = interaction.member as GuildMember;
  if (
    session.recordedBy !== member.id &&
    !member.permissions.has("Administrator")
  ) {
    await interaction.editReply({
      content:
        "❌ Only the person who started the recording or an admin can stop it.",
    });
    return;
  }

  await interaction.editReply({
    content: "⏳ Stopping recording and processing audio...",
  });

  const title = interaction.options.getString("title") || undefined;

  try {
    const result = await stopRecording(session, moduleManager);

    // Update title if provided
    if (title) {
      await moduleManager.databaseService.updateRecording(result.recordingId, {
        title,
      });
    }

    // Reset nickname
    await updateNickname(interaction.guild?.members.me ?? null, false);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Recording Saved")
      .setDescription(
        title ? `**${title}**` : `Recording from **${session.channelName}**`,
      )
      .addFields(
        {
          name: "Duration",
          value: formatDuration(result.duration),
          inline: true,
        },
        {
          name: "Tracks",
          value: `${result.trackCount} user${result.trackCount !== 1 ? "s" : ""}`,
          inline: true,
        },
        {
          name: "Channel",
          value: session.channelName,
          inline: true,
        },
      )
      .setFooter({
        text: "Manage recordings from the dashboard",
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    moduleManager.logger.error("Error stopping recording", session?.guildId, err, "recording");
    await interaction.editReply({
      content: "❌ An error occurred while saving the recording. Check logs.",
    });

    // Reset nickname even on error
    await updateNickname(interaction.guild?.members.me ?? null, false);
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const session = activeSessions.get(guildId);

  if (!session) {
    await interaction.editReply({
      content: "ℹ️ No active recording in this server.",
    });
    return;
  }

  const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
  const users = Array.from(session.userStreams.values())
    .map((s) => s.username)
    .join(", ");

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔴 Recording in Progress")
    .addFields(
      { name: "Channel", value: session.channelName, inline: true },
      { name: "Duration", value: formatDuration(elapsed), inline: true },
      {
        name: "Bitrate",
        value: `${session.bitrate} kbps`,
        inline: true,
      },
      {
        name: `Participants (${session.userStreams.size})`,
        value: users || "None detected yet",
      },
    )
    .setFooter({
      text: `Started by user ID: ${session.recordedBy}`,
    });

  await interaction.editReply({ embeds: [embed] });
}

// ─── Module Export ────────────────────────────────────────────────────────

const recordingModule: BotModule = {
  name: "recording",
  description: "Record voice channel audio with per-user multi-track support",
  commands: [recordCommand],
  deferReply: true,

  async execute(
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) {
    _moduleManager = moduleManager;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "start":
        return handleStart(interaction, moduleManager);
      case "stop":
        return handleStop(interaction, moduleManager);
      case "status":
        return handleStatus(interaction);
      default:
        await interaction.editReply({ content: "❓ Unknown subcommand." });
    }
  },
};

export default recordingModule;
