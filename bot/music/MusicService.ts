import type { MusicCommand, MusicPlayerState, MusicQueueSnapshot, MusicResult } from "./types";

export interface MusicService {
  execute(command: MusicCommand): Promise<MusicResult<MusicQueueSnapshot>>;
  getState(guildId: string): Promise<MusicPlayerState>;
  getQueue(guildId: string): Promise<MusicQueueSnapshot>;
  isActive(guildId: string): Promise<boolean>;
  shutdown(): Promise<void>;
}
