export const musicErrorCodes = [
  "MUSIC_NO_MATCH",
  "MUSIC_SOURCE_UNAVAILABLE",
  "MUSIC_NODE_CAPACITY",
  "MUSIC_VOICE_FAILED",
  "MUSIC_RELAY_OFFLINE",
  "MUSIC_RETRY_EXHAUSTED",
  "MUSIC_CONFLICT",
] as const;

export type MusicErrorCode = (typeof musicErrorCodes)[number];

export class MusicError extends Error {
  public readonly code: MusicErrorCode;
  public readonly retryable: boolean;

  constructor(code: MusicErrorCode, message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "MusicError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}
