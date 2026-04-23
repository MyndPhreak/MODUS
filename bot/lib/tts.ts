import {
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { spawn, ChildProcess } from "child_process";
import { Readable } from "stream";
import type { VoiceBasedChannel } from "discord.js";

export class TTSError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TTSError";
  }
}

export interface SpeakOptions {
  voice?: string;
  speed?: number;
  signal?: AbortSignal;
}

interface KokoroConfig {
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  apiKey?: string;
  timeoutMs: number;
}

export function isTTSAvailable(): boolean {
  return !!process.env.KOKORO_BASE_URL;
}

function getConfig(): KokoroConfig {
  const baseUrl = process.env.KOKORO_BASE_URL;
  if (!baseUrl) throw new TTSError("KOKORO_BASE_URL not configured");
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    model: process.env.KOKORO_MODEL ?? "kokoro",
    voice: process.env.KOKORO_VOICE ?? "af_bella",
    speed: Number(process.env.KOKORO_SPEED ?? "1.0"),
    apiKey: process.env.KOKORO_API_KEY || undefined,
    timeoutMs: Number(process.env.KOKORO_REQUEST_TIMEOUT_MS ?? "120000"),
  };
}

export async function speakInConnection(
  connection: VoiceConnection,
  text: string,
  opts: SpeakOptions = {},
): Promise<void> {
  const config = getConfig();
  if (!text.trim()) throw new TTSError("Empty text");

  const voice = opts.voice ?? config.voice;
  const speed = opts.speed ?? config.speed;

  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(
    () => timeoutController.abort(new Error("timeout")),
    config.timeoutMs,
  );
  const signals: AbortSignal[] = [timeoutController.signal];
  if (opts.signal) signals.push(opts.signal);
  const combinedSignal = AbortSignal.any(signals);

  let ffmpeg: ChildProcess | undefined;
  let player: ReturnType<typeof createAudioPlayer> | undefined;
  let subscription: ReturnType<VoiceConnection["subscribe"]> | undefined;
  let upstream: Readable | undefined;

  const cleanup = () => {
    clearTimeout(timeoutHandle);
    try {
      subscription?.unsubscribe();
    } catch {}
    try {
      player?.stop(true);
    } catch {}
    try {
      upstream?.destroy();
    } catch {}
    try {
      ffmpeg?.kill("SIGKILL");
    } catch {}
  };

  try {
    const response = await fetch(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        voice,
        input: text,
        speed,
        response_format: "pcm",
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const body = await readBoundedText(response.body, 4096);
      throw new TTSError(
        `Kokoro returned ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }
    if (!response.body) throw new TTSError("Kokoro returned empty body");

    ffmpeg = spawn(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let ffmpegStderr = "";
    ffmpeg.stderr?.on("data", (chunk: Buffer) => {
      ffmpegStderr += chunk.toString();
    });

    const ffmpegSpawnError = new Promise<never>((_, reject) => {
      ffmpeg!.once("error", (err) =>
        reject(new TTSError(`ffmpeg spawn failed: ${err.message}`)),
      );
    });

    upstream = Readable.fromWeb(response.body as any);
    upstream.on("error", () => {
      try {
        ffmpeg?.stdin?.end();
      } catch {}
    });
    upstream.pipe(ffmpeg.stdin!);

    const resource = createAudioResource(ffmpeg.stdout!, {
      inputType: StreamType.Raw,
    });

    player = createAudioPlayer();
    subscription = connection.subscribe(player);
    player.play(resource);

    await Promise.race([
      ffmpegSpawnError,
      new Promise<void>((resolve, reject) => {
        const onIdle = () => {
          teardown();
          resolve();
        };
        const onPlayerError = (err: Error) => {
          teardown();
          reject(new TTSError(`Player error: ${err.message}`));
        };
        const onAbort = () => {
          teardown();
          resolve();
        };
        const teardown = () => {
          player!.off(AudioPlayerStatus.Idle, onIdle);
          player!.off("error", onPlayerError);
          combinedSignal.removeEventListener("abort", onAbort);
        };
        player!.once(AudioPlayerStatus.Idle, onIdle);
        player!.once("error", onPlayerError);
        combinedSignal.addEventListener("abort", onAbort);
      }),
    ]);

    if (ffmpeg.exitCode !== null && ffmpeg.exitCode !== 0) {
      throw new TTSError(
        `ffmpeg exited ${ffmpeg.exitCode}: ${ffmpegStderr.slice(-500)}`,
      );
    }
  } finally {
    cleanup();
  }
}

export async function speakInChannel(
  channel: VoiceBasedChannel,
  text: string,
  opts: SpeakOptions = {},
): Promise<void> {
  const existing = getVoiceConnection(channel.guildId);
  if (existing) {
    throw new TTSError("Bot is currently in a voice channel in this guild");
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    await speakInConnection(connection, text, opts);
  } finally {
    try {
      connection.destroy();
    } catch {}
  }
}

async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      reader.cancel();
    } catch {}
  }
  return Buffer.concat(chunks).toString("utf8");
}
