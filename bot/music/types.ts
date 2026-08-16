import type { MusicError } from "./errors";

export type MusicRepeatMode = "off" | "track" | "queue";

export type MusicPlayerStatus = "idle" | "connecting" | "playing" | "paused" | "unavailable";

export interface MusicFilters {
  [filter: string]: unknown;
}

export interface MusicSource {
  name: string;
  uri?: string;
  identifier?: string;
}

export interface CanonicalTrack {
  id: string;
  requestedInput: string;
  requestType: "search" | "url" | "playlist" | "album" | "track";
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  artworkUrl?: string;
  isrc?: string;
  requestedBy: string;
  requestedAt: string;
  requestedSource: MusicSource;
  playbackSource?: MusicSource;
  matchConfidence?: number;
}

export interface MusicQueueEntry {
  id: string;
  track: CanonicalTrack;
  position: number;
  status: "pending" | "ready" | "playing" | "failed";
}

export interface LyricsLine {
  timeMs?: number;
  text: string;
}

export interface LyricsData {
  trackTitle?: string;
  artist?: string;
  source?: string;
  synced: boolean;
  lines: LyricsLine[];
  text: string;
}

export interface MusicQueueSnapshot {
  guildId: string;
  revision: number;
  entries: MusicQueueEntry[];
  currentEntryId: string | null;
  repeatMode: MusicRepeatMode;
  autoplay: boolean;
  volume: number;
  filters: MusicFilters;
}

export interface MusicPlayerState {
  guildId: string;
  status: MusicPlayerStatus;
  queueRevision: number;
  nodeId: string | null;
  currentEntryId: string | null;
  positionMs: number;
  errorCode?: MusicError["code"];
}

export type MusicResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MusicError };

interface MusicMutation {
  guildId: string;
  operationId: string;
  expectedRevision: number;
}

export type MusicCommand =
  | (MusicMutation & { type: "play"; track: CanonicalTrack; voiceChannelId: string; insertAt?: "next" | "end" })
  | (MusicMutation & { type: "pause" })
  | (MusicMutation & { type: "resume" })
  | (MusicMutation & { type: "seek"; positionMs: number })
  | (MusicMutation & { type: "skip" })
  | (MusicMutation & { type: "stop" })
  | (MusicMutation & { type: "queue.remove"; entryId: string })
  | (MusicMutation & { type: "queue.move"; entryId: string; position: number })
  | (MusicMutation & { type: "queue.clear" })
  | (MusicMutation & { type: "queue.shuffle" })
  | (MusicMutation & { type: "volume"; volume: number })
  | (MusicMutation & { type: "repeat"; repeatMode: MusicRepeatMode })
  | (MusicMutation & { type: "autoplay"; enabled: boolean })
  | (MusicMutation & { type: "filters"; filters: MusicFilters });
