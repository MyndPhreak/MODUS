import type { LyricsData, MusicCommand, MusicPlayerState, MusicQueueSnapshot, MusicResult } from "./types";

export interface MusicService {
  execute(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>>;
  getState(guildId: string): Promise<MusicPlayerState>;
  getQueue(guildId: string): Promise<MusicQueueSnapshot>;
  getLyrics(guildId: string, query?: string): Promise<MusicResult<LyricsData>>;
  isActive(guildId: string): Promise<boolean>;
  shutdown(): Promise<void>;
}
