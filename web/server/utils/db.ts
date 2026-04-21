/**
 * Shared Postgres access for Nitro endpoints.
 *
 * Behavior mirrors web/server/utils/r2.ts: feature-flagged via
 * NUXT_USE_POSTGRES_RECORDINGS / NUXT_USE_POSTGRES, lazy-initialized,
 * returns null when disabled or misconfigured so every caller can fall
 * back to Appwrite cleanly.
 *
 * Two flags, matching the bot side:
 *   - NUXT_USE_POSTGRES=true            — every domain
 *   - NUXT_USE_POSTGRES_RECORDINGS=true — recordings only (legacy opt-in)
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

let cached: {
  flag: "full" | "recordings-only";
  repos: Repos;
} | null = null;

function init(flag: "full" | "recordings-only"): Repos | null {
  const config = useRuntimeConfig();
  const url = (config.databaseUrl as string) || process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "[db] Postgres flag is set but DATABASE_URL / NUXT_DATABASE_URL is unset.",
    );
    return null;
  }
  try {
    const { db } = createDb({ url });
    const repos: Repos = {
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
    cached = { flag, repos };
    return repos;
  } catch (err) {
    console.warn(
      `[db] Failed to initialize Postgres: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/**
 * Returns every repository when NUXT_USE_POSTGRES=true. The narrower
 * `getRecordingRepo()` below is the correct accessor when only the
 * recordings-only flag is set (legacy behavior).
 */
export function getRepos(): Repos | null {
  if (cached?.flag === "full") return cached.repos;
  const config = useRuntimeConfig();
  if (String(config.usePostgres) !== "true") return null;
  return init("full");
}

/**
 * Recordings-only accessor. Honors both the narrow flag
 * (NUXT_USE_POSTGRES_RECORDINGS) and the full one (NUXT_USE_POSTGRES).
 * Kept as a separate function so recording endpoints can opt in earlier
 * than the rest of the stack.
 */
export function getRecordingRepo(): RecordingRepository | null {
  if (cached?.repos) return cached.repos.recordings;
  const config = useRuntimeConfig();
  if (
    String(config.usePostgresRecordings) !== "true" &&
    String(config.usePostgres) !== "true"
  ) {
    return null;
  }
  const repos = init(
    String(config.usePostgres) === "true" ? "full" : "recordings-only",
  );
  return repos?.recordings ?? null;
}
