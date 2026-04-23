/**
 * DatabaseService — MODUS's single data-access facade.
 *
 * Wraps the @modus/db repositories behind the method shapes consumers
 * (modules, workers, web API via the shared bot process) already know.
 * Owns the L1 cache (CacheService with cross-shard invalidation via
 * Redis) and the R2 StorageService for recording blobs.
 *
 * Renamed from AppwriteService; the Appwrite fallback paths have been
 * removed. Postgres (DATABASE_URL) and R2 (R2_* vars) are now required.
 * Without them the bot fails fast at construction instead of silently
 * degrading.
 */
import { Readable } from "stream";
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
  TranscriptRepository,
} from "@modus/db";
import {
  StorageService,
  trackKey,
  mixedKey,
  recordingPrefix,
  looksLikeR2Key,
} from "./StorageService";
import { CacheService } from "./CacheService";
import {
  CHANNEL_GUILD_CONFIGS,
  CHANNEL_LOGS,
  CHANNEL_MODULES,
  type EventBus,
} from "./EventBus";

export class DatabaseService {
  public readonly storage: StorageService;
  public readonly recordings: RecordingRepository;
  public readonly guildConfigs: GuildConfigRepository;
  public readonly servers: ServerRepository;
  public readonly modules: ModuleRepository;
  public readonly botStatus: BotStatusRepository;
  public readonly logs: LogRepository;
  public readonly milestones: MilestoneUserRepository;
  public readonly automod: AutomodRuleRepository;
  public readonly aiUsage: AIUsageLogRepository;
  public readonly tags: TagRepository;
  public readonly tempVoice: TempVoiceChannelRepository;
  public readonly triggers: TriggerRepository;
  public readonly transcripts: TranscriptRepository;

  /** TTL cache for guild config + tag lookups. Shared-shard aware via EventBus. */
  private configCache: CacheService<any>;
  private eventBus: EventBus | null;

  constructor(opts: { eventBus?: EventBus | null } = {}) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "[DatabaseService] DATABASE_URL is required. " +
          "Set it to a Postgres connection string before starting the bot.",
      );
    }

    const r2Config = StorageService.fromEnv();
    if (!r2Config) {
      throw new Error(
        "[DatabaseService] R2 credentials are required. " +
          "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
      );
    }
    this.storage = new StorageService(r2Config);

    this.eventBus = opts.eventBus ?? null;
    this.configCache = new CacheService<any>({
      ttlSeconds: 60,
      eventBus: this.eventBus,
    });

    const { db } = createDb();
    this.recordings = new RecordingRepository(db);
    this.guildConfigs = new GuildConfigRepository(db);
    this.servers = new ServerRepository(db);
    this.modules = new ModuleRepository(db);
    this.botStatus = new BotStatusRepository(db);
    this.logs = new LogRepository(db);
    this.milestones = new MilestoneUserRepository(db);
    this.automod = new AutomodRuleRepository(db);
    this.aiUsage = new AIUsageLogRepository(db);
    this.tags = new TagRepository(db);
    this.tempVoice = new TempVoiceChannelRepository(db);
    this.triggers = new TriggerRepository(db);
    this.transcripts = new TranscriptRepository(db);
  }

  // ── Cache invalidation ─────────────────────────────────────────────────

  /** Force-invalidate cached settings for a guild (call after external dashboard changes). */
  invalidateSettingsCache(guildId?: string): void {
    if (guildId) {
      this.configCache.invalidatePrefix(`enabled:${guildId}:`);
      this.configCache.invalidatePrefix(`settings:${guildId}:`);
    } else {
      this.configCache.invalidateAll();
    }
  }

  // ── Realtime subscriptions ─────────────────────────────────────────────
  //
  // Backed by Redis pub/sub via EventBus. Falls back to a no-op unsubscribe
  // when REDIS_URL isn't set; consumers that need hot reload should run
  // with Redis configured or restart to see changes.

  async subscribeToModules(
    callback: (payload: any) => void,
  ): Promise<() => Promise<void>> {
    if (!this.eventBus) return async () => {};
    return this.eventBus.subscribe(CHANNEL_MODULES, callback);
  }

  async subscribeToGuildConfigs(
    callback: (payload: any) => void,
  ): Promise<() => Promise<void>> {
    if (!this.eventBus) return async () => {};
    return this.eventBus.subscribe(CHANNEL_GUILD_CONFIGS, callback);
  }

  // ── Guild configs ──────────────────────────────────────────────────────

  async getGuildConfigs(guildId: string): Promise<any[]> {
    try {
      return await this.guildConfigs.listByGuild(guildId);
    } catch (error) {
      console.error(
        `[DatabaseService] listByGuild failed for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async isModuleEnabled(guildId: string, moduleName: string): Promise<boolean> {
    const name = moduleName.toLowerCase();
    const cacheKey = `enabled:${guildId}:${name}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached as boolean;

    try {
      const enabled = await this.guildConfigs.isModuleEnabled(guildId, name);
      this.configCache.set(cacheKey, enabled);
      return enabled;
    } catch (error: any) {
      console.error(
        `[DatabaseService] isModuleEnabled failed for ${guildId}/${moduleName}:`,
        error?.message || error,
      );
      // Absent row defaults to enabled, matching the old behavior.
      return true;
    }
  }

  /**
   * Cache-only enablement check. Returns undefined on miss so callers on the
   * Discord 3-second interaction deadline (e.g. skipDefer modules that call
   * showModal) can avoid blocking on Postgres. Kicks off an async refresh to
   * populate the cache for subsequent calls.
   */
  isModuleEnabledCached(guildId: string, moduleName: string): boolean | undefined {
    const name = moduleName.toLowerCase();
    const cacheKey = `enabled:${guildId}:${name}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached as boolean;
    void this.isModuleEnabled(guildId, name);
    return undefined;
  }

  async setModuleStatus(
    guildId: string,
    moduleName: string,
    enabled: boolean,
  ): Promise<void> {
    const name = moduleName.toLowerCase();
    try {
      await this.guildConfigs.setModuleStatus(guildId, name, enabled);
      this.configCache.invalidate(`enabled:${guildId}:${name}`);
      this.configCache.invalidate(`settings:${guildId}:${name}`);
      this.publishGuildConfigChange("status", guildId, name);
    } catch (error) {
      console.error(
        `[DatabaseService] setModuleStatus failed for ${guildId}/${moduleName}:`,
        error,
      );
    }
  }

  async getModuleSettings(
    guildId: string,
    moduleName: string,
  ): Promise<Record<string, any>> {
    const name = moduleName.toLowerCase();
    const cacheKey = `settings:${guildId}:${name}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached as Record<string, any>;

    try {
      const settings = await this.guildConfigs.getModuleSettings(guildId, name);
      this.configCache.set(cacheKey, settings);
      return settings;
    } catch (error) {
      console.error(
        `[DatabaseService] getModuleSettings failed for ${guildId}/${moduleName}:`,
        error,
      );
      return {};
    }
  }

  async setModuleSettings(
    guildId: string,
    moduleName: string,
    settings: Record<string, any>,
  ): Promise<void> {
    const name = moduleName.toLowerCase();
    try {
      await this.guildConfigs.setModuleSettings(guildId, name, settings);
      this.configCache.invalidate(`settings:${guildId}:${name}`);
      this.configCache.invalidate(`enabled:${guildId}:${name}`);
      this.publishGuildConfigChange("settings", guildId, name);
    } catch (error) {
      console.error(
        `[DatabaseService] setModuleSettings failed for ${guildId}/${moduleName}:`,
        error,
      );
    }
  }

  // ── Modules ────────────────────────────────────────────────────────────

  async getEnabledModules(): Promise<string[]> {
    try {
      return await this.modules.listEnabled();
    } catch (error) {
      console.error("[DatabaseService] listEnabled failed:", error);
      return [];
    }
  }

  async ensureModuleRegistered(
    moduleName: string,
    description: string,
  ): Promise<void> {
    try {
      await this.modules.ensureRegistered(moduleName, description);
      this.publishModulesChange();
    } catch (error) {
      console.error(
        `[DatabaseService] ensureRegistered(${moduleName}) failed:`,
        error,
      );
    }
  }

  // ── Servers + premium ──────────────────────────────────────────────────

  async getServers(): Promise<any[]> {
    try {
      return await this.servers.listAll();
    } catch (error) {
      console.error("[DatabaseService] servers.listAll failed:", error);
      return [];
    }
  }

  async updateServerStatus(
    serverId: string,
    guildId: string,
    status: boolean,
    memberCount: number,
    icon: string | null,
    name: string,
    shardId: number,
  ): Promise<void> {
    try {
      await this.servers.updateStatus(
        serverId,
        guildId,
        status,
        memberCount,
        icon,
        name,
        shardId,
      );
    } catch (error) {
      console.error(
        `[DatabaseService] updateServerStatus failed for ${serverId}:`,
        error,
      );
    }
  }

  async isGuildPremium(guildId: string): Promise<boolean> {
    try {
      return await this.servers.isPremium(guildId);
    } catch (error) {
      console.error(
        `[DatabaseService] isPremium failed for ${guildId}:`,
        error,
      );
      return false;
    }
  }

  async setGuildPremium(guildId: string, premium: boolean): Promise<void> {
    try {
      await this.servers.setPremium(guildId, premium);
    } catch (error) {
      console.error(
        `[DatabaseService] setPremium failed for ${guildId}:`,
        error,
      );
    }
  }

  // ── Bot status ─────────────────────────────────────────────────────────

  async updateBotHeartbeat(
    botId: string,
    version: string,
    shardId: number,
    totalShards: number,
  ): Promise<void> {
    try {
      await this.botStatus.updateHeartbeat(botId, version, shardId, totalShards);
    } catch (error) {
      console.error("[DatabaseService] updateHeartbeat failed:", error);
    }
  }

  // ── Logs ───────────────────────────────────────────────────────────────

  async logServerMessage(
    guildId: string,
    message: string,
    level: "info" | "warn" | "error",
    shardId?: number,
    source?: string,
  ): Promise<void> {
    const logDoc = {
      guildId,
      message,
      level,
      timestamp: new Date().toISOString(),
      shardId: shardId ?? null,
      source: source ?? null,
    };

    try {
      await this.logs.log({ guildId, message, level, shardId, source });
      this.publishLog(logDoc);
    } catch (error) {
      console.error(
        `[DatabaseService] logServerMessage failed for ${guildId}:`,
        error,
      );
    }
  }

  // ── Recording storage (R2) ─────────────────────────────────────────────

  async uploadRecordingTrack(params: {
    guildId: string;
    recordingId: string;
    userId: string;
    filePath: string;
    fileBuffer?: Buffer;
  }): Promise<string> {
    const key = trackKey(
      params.guildId,
      params.recordingId,
      params.userId,
      Date.now(),
    );
    const fs = await import("fs");
    const body = params.fileBuffer
      ? Readable.from(params.fileBuffer)
      : fs.createReadStream(params.filePath);
    await this.storage.uploadStream(key, body, "audio/ogg");
    return key;
  }

  async uploadRecordingMix(params: {
    guildId: string;
    recordingId: string;
    filePath: string;
    fileBuffer?: Buffer;
  }): Promise<string> {
    const key = mixedKey(params.guildId, params.recordingId, Date.now());
    const fs = await import("fs");
    const body = params.fileBuffer
      ? Readable.from(params.fileBuffer)
      : fs.createReadStream(params.filePath);
    await this.storage.uploadStream(key, body, "audio/ogg");
    return key;
  }

  async deleteRecordingFile(fileId: string): Promise<void> {
    if (!looksLikeR2Key(fileId)) {
      // Legacy Appwrite file IDs are no longer supported. Callers either
      // shouldn't have them (fresh deployments), or need to run a one-shot
      // backfill to R2 before calling delete.
      console.warn(
        `[DatabaseService] deleteRecordingFile: legacy fileId "${fileId}" — skipping.`,
      );
      return;
    }
    await this.storage.delete(fileId);
  }

  async deleteRecordingPrefix(
    guildId: string,
    recordingId: string,
  ): Promise<void> {
    const prefix = recordingPrefix(guildId, recordingId);
    const keys = await this.storage.listPrefix(prefix);
    await this.storage.deleteMany(keys);
  }

  async getRecordingFileSignedUrl(fileId: string): Promise<string> {
    return this.storage.presignGet(fileId);
  }

  async getRecordingFileBuffer(fileId: string): Promise<Buffer> {
    return this.storage.getBuffer(fileId);
  }

  // ── Recording metadata ─────────────────────────────────────────────────

  async createRecording(data: {
    guild_id: string;
    channel_name: string;
    recorded_by: string;
    mixed_file_id?: string;
    duration?: number;
    started_at: string;
    ended_at?: string;
    title?: string;
    participants?: string;
    bitrate?: number;
    multitrack?: boolean;
  }): Promise<string> {
    return this.recordings.create(data);
  }

  async updateRecording(
    recordingId: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.recordings.update(recordingId, data);
  }

  async getRecordings(guildId: string, limit = 50): Promise<any[]> {
    return this.recordings.listByGuild(guildId, limit);
  }

  /** Used by the retention worker to find deletion candidates. */
  async getRecordingsOlderThan(
    cutoffIso: string,
    limit = 100,
  ): Promise<any[]> {
    return this.recordings.listOlderThan(cutoffIso, limit);
  }

  async deleteRecording(recordingId: string): Promise<void> {
    const { recording, tracks } =
      await this.recordings.deleteWithTracks(recordingId);

    for (const track of tracks) {
      try {
        await this.deleteRecordingFile(track.file_id);
      } catch {}
    }
    if (recording?.mixed_file_id) {
      try {
        await this.deleteRecordingFile(recording.mixed_file_id);
      } catch {}
    }
    if (recording?.guild_id) {
      try {
        await this.deleteRecordingPrefix(recording.guild_id, recordingId);
      } catch {}
    }
  }

  async createRecordingTrack(data: {
    recording_id: string;
    guild_id: string;
    user_id: string;
    username: string;
    file_id: string;
    file_size?: number;
    start_offset?: number;
    segments?: string;
  }): Promise<string> {
    return this.recordings.createTrack(data);
  }

  async getRecordingTracks(recordingId: string): Promise<any[]> {
    return this.recordings.listTracks(recordingId);
  }

  // ── Milestones ─────────────────────────────────────────────────────────

  async getMilestoneUser(
    guildId: string,
    userId: string,
  ): Promise<any | null> {
    try {
      return await this.milestones.getByGuildAndUser(guildId, userId);
    } catch (error) {
      console.error(
        `[DatabaseService] getMilestoneUser(${guildId}/${userId}) failed:`,
        error,
      );
      return null;
    }
  }

  async createMilestoneUser(data: {
    guild_id: string;
    user_id: string;
    username: string;
    char_count: number;
    last_milestone: number;
    notification_pref: string;
    opted_in: boolean;
  }): Promise<string> {
    return this.milestones.create(data);
  }

  async updateMilestoneUser(
    docId: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.milestones.update(docId, data);
  }

  async getMilestoneLeaderboard(
    guildId: string,
    limit: number,
    offset: number,
  ): Promise<{ users: any[]; total: number }> {
    try {
      return await this.milestones.getLeaderboard(guildId, limit, offset);
    } catch (error) {
      console.error(
        `[DatabaseService] getLeaderboard failed for ${guildId}:`,
        error,
      );
      return { users: [], total: 0 };
    }
  }

  async getMilestoneUserRank(
    guildId: string,
    charCount: number,
  ): Promise<number> {
    try {
      return await this.milestones.getRank(guildId, charCount);
    } catch (error) {
      console.error(
        `[DatabaseService] getRank failed for ${guildId}:`,
        error,
      );
      return 0;
    }
  }

  // ── AutoMod ────────────────────────────────────────────────────────────

  async getAutoModRules(guildId: string, trigger?: string): Promise<any[]> {
    try {
      return await this.automod.listByGuild(guildId, trigger);
    } catch (error) {
      console.error(
        `[DatabaseService] automod list failed for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async getEnabledAutoModRules(
    guildId: string,
    trigger: string,
  ): Promise<any[]> {
    try {
      return await this.automod.listEnabledByTrigger(guildId, trigger);
    } catch (error) {
      console.error(
        `[DatabaseService] enabled automod list failed for ${guildId}/${trigger}:`,
        error,
      );
      return [];
    }
  }

  async createAutoModRule(data: {
    guild_id: string;
    name: string;
    enabled: boolean;
    priority?: number;
    trigger: string;
    conditions: string;
    actions: string;
    exempt_roles?: string;
    exempt_channels?: string;
    cooldown?: number;
    created_by?: string;
  }): Promise<string> {
    return this.automod.create(data);
  }

  async updateAutoModRule(
    ruleId: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.automod.update(ruleId, data);
  }

  async deleteAutoModRule(ruleId: string): Promise<void> {
    await this.automod.delete(ruleId);
  }

  // ── AI ─────────────────────────────────────────────────────────────────

  async getGlobalAIConfig(): Promise<Record<string, any> | null> {
    try {
      return await this.guildConfigs.getGlobalAIConfig();
    } catch (error) {
      console.error("[DatabaseService] getGlobalAIConfig failed:", error);
      return null;
    }
  }

  async setGlobalAIConfig(config: Record<string, any>): Promise<void> {
    try {
      await this.guildConfigs.setGlobalAIConfig(config);
    } catch (error) {
      console.error("[DatabaseService] setGlobalAIConfig failed:", error);
    }
  }

  async logAIUsage(data: {
    guildId: string;
    userId: string;
    provider: string;
    model: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    estimated_cost?: number;
    action?: string;
    key_source: "guild" | "shared";
  }): Promise<void> {
    try {
      await this.aiUsage.log(data);
    } catch (error) {
      console.error("[DatabaseService] logAIUsage failed:", error);
    }
  }

  async getAIUsageLogs(guildId: string, limit = 50): Promise<any[]> {
    try {
      return await this.aiUsage.listByGuild(guildId, limit);
    } catch (error) {
      console.error(
        `[DatabaseService] getAIUsageLogs failed for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  // ── Tags ───────────────────────────────────────────────────────────────

  async getTags(guildId: string): Promise<any[]> {
    try {
      return await this.tags.listByGuild(guildId);
    } catch (error) {
      console.error(
        `[DatabaseService] tags.listByGuild failed for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async getTagByName(guildId: string, name: string): Promise<any | null> {
    const cacheKey = `tag:${guildId}:${name.toLowerCase()}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const tag = await this.tags.getByName(guildId, name);
      this.configCache.set(cacheKey, tag);
      return tag;
    } catch (error) {
      console.error(
        `[DatabaseService] getTagByName(${guildId}/${name}) failed:`,
        error,
      );
      return null;
    }
  }

  async createTag(data: {
    guild_id: string;
    name: string;
    content?: string;
    embed_data?: string;
    allowed_roles?: string;
    created_by?: string;
  }): Promise<string> {
    const id = await this.tags.create(data);
    this.configCache.invalidate(
      `tag:${data.guild_id}:${data.name.toLowerCase()}`,
    );
    return id;
  }

  async updateTag(tagId: string, data: Record<string, any>): Promise<void> {
    await this.tags.update(tagId, data);
    if (data.guild_id) {
      this.configCache.invalidatePrefix(`tag:${data.guild_id}:`);
    }
  }

  async deleteTag(tagId: string, guildId?: string): Promise<void> {
    await this.tags.delete(tagId);
    if (guildId) {
      this.configCache.invalidatePrefix(`tag:${guildId}:`);
    }
  }

  // ── Temp Voice ─────────────────────────────────────────────────────────

  async createTempChannel(data: {
    guild_id: string;
    channel_id: string;
    owner_id: string;
    lobby_channel_id: string;
  }): Promise<string> {
    return this.tempVoice.create(data);
  }

  async deleteTempChannel(channelId: string): Promise<void> {
    try {
      await this.tempVoice.deleteByChannelId(channelId);
    } catch (error) {
      console.error(
        `[DatabaseService] deleteTempChannel(${channelId}) failed:`,
        error,
      );
    }
  }

  async getTempChannels(guildId: string): Promise<any[]> {
    try {
      return await this.tempVoice.listByGuild(guildId);
    } catch (error) {
      console.error(
        `[DatabaseService] getTempChannels(${guildId}) failed:`,
        error,
      );
      return [];
    }
  }

  async getAllTempChannels(): Promise<any[]> {
    try {
      return await this.tempVoice.listAll();
    } catch (error) {
      console.error("[DatabaseService] getAllTempChannels failed:", error);
      return [];
    }
  }

  async updateTempChannelOwner(
    channelId: string,
    newOwnerId: string,
  ): Promise<void> {
    try {
      await this.tempVoice.updateOwner(channelId, newOwnerId);
    } catch (error) {
      console.error(
        `[DatabaseService] updateTempChannelOwner(${channelId}) failed:`,
        error,
      );
    }
  }

  // ── Triggers ───────────────────────────────────────────────────────────

  async createTrigger(data: {
    guild_id: string;
    name: string;
    secret: string;
    provider: "webhook" | "github" | "twitch";
    channel_id: string;
    embed_template?: string;
    filters?: string;
    created_by?: string;
  }): Promise<string> {
    return this.triggers.create(data);
  }

  async listTriggers(guildId: string): Promise<any[]> {
    try {
      return await this.triggers.listByGuild(guildId);
    } catch (error) {
      console.error(
        `[DatabaseService] listTriggers(${guildId}) failed:`,
        error,
      );
      return [];
    }
  }

  async getTriggerBySecret(secret: string): Promise<any | null> {
    try {
      return await this.triggers.getBySecret(secret);
    } catch (error) {
      console.error("[DatabaseService] getTriggerBySecret failed:", error);
      return null;
    }
  }

  async deleteTrigger(triggerId: string): Promise<void> {
    await this.triggers.delete(triggerId);
  }

  async updateTrigger(
    triggerId: string,
    data: Record<string, any>,
  ): Promise<void> {
    await this.triggers.update(triggerId, data);
  }

  // ── Transcripts ────────────────────────────────────────────────────────

  /**
   * Delete a transcript row and all its R2 assets. Retention worker owns
   * the scheduling; this method owns the order (R2 first so a DB delete
   * failure doesn't leak blobs).
   */
  async deleteTicketTranscript(transcriptId: string): Promise<void> {
    try {
      await this.storage.deleteTicketTranscriptAssets(transcriptId);
    } catch (err) {
      console.warn(
        `[DatabaseService] Failed to delete R2 assets for transcript ${transcriptId}:`,
        err,
      );
    }
    await this.transcripts.deleteById(transcriptId);
  }

  // ── Alerts Worker helpers ──────────────────────────────────────────────

  async getAllAlertsConfigs(): Promise<
    Array<{ guildId: string; alerts: any[] }>
  > {
    try {
      return await this.guildConfigs.getAllAlertsConfigs();
    } catch (error) {
      console.error("[DatabaseService] getAllAlertsConfigs failed:", error);
      return [];
    }
  }

  async getAlertsState(guildId: string): Promise<Record<string, string>> {
    try {
      return await this.guildConfigs.getAlertsState(guildId);
    } catch {
      return {};
    }
  }

  async setAlertsState(
    guildId: string,
    state: Record<string, string>,
  ): Promise<void> {
    try {
      await this.guildConfigs.setAlertsState(guildId, state);
    } catch (error) {
      console.error(
        `[DatabaseService] setAlertsState(${guildId}) failed:`,
        error,
      );
    }
  }

  // ── Realtime publishers ────────────────────────────────────────────────

  private publishLog(log: Record<string, any>): void {
    if (!this.eventBus) return;
    this.eventBus
      .publish(CHANNEL_LOGS, { kind: "create", log })
      .catch((err) => {
        console.warn(
          `[DatabaseService] log publish failed: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });
  }

  private publishModulesChange(): void {
    if (!this.eventBus) return;
    this.eventBus.publish(CHANNEL_MODULES, { kind: "changed" }).catch((err) => {
      console.warn(
        `[DatabaseService] modules publish failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    });
  }

  private publishGuildConfigChange(
    kind: "status" | "settings",
    guildId: string,
    moduleName: string,
  ): void {
    if (!this.eventBus) return;
    this.eventBus
      .publish(CHANNEL_GUILD_CONFIGS, { kind, guildId, moduleName })
      .catch((err) => {
        console.warn(
          `[DatabaseService] guild-configs publish failed: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });
  }
}
