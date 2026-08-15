import type { MusicError } from "./errors";

export interface MusicPlaybackTrack {
  identifier: string;
  title: string;
  artist: string;
  durationMs: number;
  sourceName: string;
  isrc?: string;
}

interface MusicPlaybackEventBase {
  guildId: string;
  nodeId: string;
}

export type MusicPlaybackEvent =
  | (MusicPlaybackEventBase & { type: "track.start"; track: MusicPlaybackTrack })
  | (MusicPlaybackEventBase & {
      type: "track.end";
      track: MusicPlaybackTrack;
      reason: "finished" | "loadFailed" | "stopped" | "replaced" | "cleanup";
    })
  | (MusicPlaybackEventBase & {
      type: "track.stuck";
      track: MusicPlaybackTrack;
      thresholdMs: number;
      error: MusicError;
    })
  | (MusicPlaybackEventBase & { type: "track.exception"; error: MusicError })
  | (MusicPlaybackEventBase & {
      type: "player.update";
      connected: boolean;
      positionMs: number;
      timestamp: number;
      pingMs: number;
    })
  | (MusicPlaybackEventBase & {
      type: "voice.closed";
      code: number;
      byRemote: boolean;
      error: MusicError;
    })
  | ({ type: "node.unavailable"; nodeId: string; error: MusicError });

export interface LavalinkAdapterEventMap {
  playback: [event: MusicPlaybackEvent];
}
