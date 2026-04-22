/**
 * Shared Postgres access for Nitro endpoints.
 *
 * Lazy-initialized; returns null when DATABASE_URL / NUXT_DATABASE_URL is
 * unset so individual endpoints can surface a 503 instead of silently
 * serving empty data.
 */
import {
  createDb,
  RecordingRepository,
  GuildConfigRepository,
  ServerRepository,
  ModuleRepository,
  BotStatusRepository,
  LogRepository,
  MilestoneUserRepository,
  AutomodRuleRepository,
  AIUsageLogRepository,
  TagRepository,
  TempVoiceChannelRepository,
  TriggerRepository,
  type Database,
} from "@modus/db";

export interface Repos {
  db: Database;
  recordings: RecordingRepository;
  guildConfigs: GuildConfigRepository;
  servers: ServerRepository;
  modules: ModuleRepository;
  botStatus: BotStatusRepository;
  logs: LogRepository;
  milestones: MilestoneUserRepository;
  automod: AutomodRuleRepository;
  aiUsage: AIUsageLogRepository;
  tags: TagRepository;
  tempVoice: TempVoiceChannelRepository;
  triggers: TriggerRepository;
}

let cached: Repos | null = null;

export function getRepos(): Repos | null {
  if (cached) return cached;

  const config = useRuntimeConfig();
  const url = (config.databaseUrl as string) || process.env.DATABASE_URL;
  if (!url) return null;

  try {
    const { db } = createDb({ url });
    cached = {
      db,
      recordings: new RecordingRepository(db),
      guildConfigs: new GuildConfigRepository(db),
      servers: new ServerRepository(db),
      modules: new ModuleRepository(db),
      botStatus: new BotStatusRepository(db),
      logs: new LogRepository(db),
      milestones: new MilestoneUserRepository(db),
      automod: new AutomodRuleRepository(db),
      aiUsage: new AIUsageLogRepository(db),
      tags: new TagRepository(db),
      tempVoice: new TempVoiceChannelRepository(db),
      triggers: new TriggerRepository(db),
    };
    return cached;
  } catch (err) {
    console.warn(
      `[db] Failed to initialize Postgres: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/** Narrow accessor used by recording endpoints. */
export function getRecordingRepo(): RecordingRepository | null {
  return getRepos()?.recordings ?? null;
}
