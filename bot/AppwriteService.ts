import { Client, Databases, Query, Storage, ID } from "node-appwrite";
// @ts-ignore — subpath export resolves at runtime; legacy moduleResolution can't see it
import { InputFile } from "node-appwrite/file";
import { Client as AppwriteClient } from "appwrite";
import WebSocket from "ws";
import { Readable } from "stream";
import {
  StorageService,
  trackKey,
  mixedKey,
  recordingPrefix,
  looksLikeR2Key,
} from "./StorageService";
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
} from "@modus/db";
import { CacheService } from "./CacheService";
import type { EventBus } from "./EventBus";

// ── Appwrite Service ──────────────────────────────────────────────

export class AppwriteService {
  private client: Client;
  private realtimeClient: AppwriteClient;
  private databases: Databases;
  private databaseId = "discord_bot";
  private modulesCollectionId = "modules";
  private serversCollectionId = "servers";
  private botStatusCollectionId = "bot_status";
  private logsCollectionId = "logs";
  private guildConfigsCollectionId = "guild_configs";
  private recordingsCollectionId = "recordings";
  private recordingTracksCollectionId = "recording_tracks";
  private recordingsBucketId = "recordings";
  private milestoneUsersCollectionId = "milestone_users";
  private automodRulesCollectionId = "automod_rules";
  private aiUsageLogCollectionId = "ai_usage_log";
  private tagsCollectionId = "tags";
  private tempVoiceChannelsCollectionId = "temp_voice_channels";
  private triggersCollectionId = "triggers";
  public storage: Storage;

  /** R2 storage for recordings. Null when USE_R2_STORAGE is not set. */
  public r2: StorageService | null = null;

  /** Postgres-backed recording repository. Null when USE_POSTGRES_RECORDINGS is off. */
  public recordingRepo: RecordingRepository | null = null;

  /**
   * Postgres-backed repositories for everything else. All null unless
   * USE_POSTGRES=true and DATABASE_URL is set. Populated together so we
   * don't end up with half-Postgres / half-Appwrite reads within a single
   * feature flag.
   */
  public guildConfigRepo: GuildConfigRepository | null = null;
  public serverRepo: ServerRepository | null = null;
  public moduleRepo: ModuleRepository | null = null;
  public botStatusRepo: BotStatusRepository | null = null;
  public logRepo: LogRepository | null = null;
  public milestoneRepo: MilestoneUserRepository | null = null;
  public automodRepo: AutomodRuleRepository | null = null;
  public aiUsageRepo: AIUsageLogRepository | null = null;
  public tagRepo: TagRepository | null = null;
  public tempVoiceRepo: TempVoiceChannelRepository | null = null;
  public triggerRepo: TriggerRepository | null = null;

  /**
   * TTL cache for guild config + tag lookups.
   *
   * When an EventBus is handed in (i.e. Redis is available), every
   * invalidation fans out to other shards so writes on shard A become
   * visible on shard B within a pub/sub round-trip. Without an EventBus,
   * this behaves exactly like the previous in-process TTLCache.
   */
  private configCache: CacheService<any>;

  constructor(opts: { eventBus?: EventBus | null } = {}) {
    this.configCache = new CacheService<any>({
      ttlSeconds: 60,
      eventBus: opts.eventBus ?? null,
    });

    this.client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_API_KEY!);

    this.databases = new Databases(this.client);
    this.storage = new Storage(this.client);

    // R2 object storage for recordings. Opt-in via USE_R2_STORAGE=true.
    // Existing Appwrite-hosted recordings stay reachable because download
    // helpers detect the key shape and route accordingly.
    if (process.env.USE_R2_STORAGE === "true") {
      const r2Config = StorageService.fromEnv();
      if (r2Config) {
        this.r2 = new StorageService(r2Config);
      } else {
        console.warn(
          "[AppwriteService] USE_R2_STORAGE=true but R2_* env vars are incomplete — falling back to Appwrite Storage.",
        );
      }
    }

    // Postgres-backed repositories.
    //
    // Two flags control the rollout:
    //   - USE_POSTGRES=true  → every domain (recordings, configs, logs, …)
    //   - USE_POSTGRES_RECORDINGS=true → recordings only (narrow opt-in,
    //     kept for the users who migrated in the first phase)
    //
    // The repos share a single pg Pool; creating them all up-front avoids
    // per-request connection churn.
    const wantPostgres = process.env.USE_POSTGRES === "true";
    const wantPostgresRecordings =
      wantPostgres || process.env.USE_POSTGRES_RECORDINGS === "true";

    if (wantPostgresRecordings || wantPostgres) {
      if (!process.env.DATABASE_URL) {
        console.warn(
          "[AppwriteService] USE_POSTGRES=true but DATABASE_URL is unset — falling back to Appwrite.",
        );
      } else {
        try {
          const { db } = createDb();
          if (wantPostgresRecordings) {
            this.recordingRepo = new RecordingRepository(db);
          }
          if (wantPostgres) {
            this.guildConfigRepo = new GuildConfigRepository(db);
            this.serverRepo = new ServerRepository(db);
            this.moduleRepo = new ModuleRepository(db);
            this.botStatusRepo = new BotStatusRepository(db);
            this.logRepo = new LogRepository(db);
            this.milestoneRepo = new MilestoneUserRepository(db);
            this.automodRepo = new AutomodRuleRepository(db);
            this.aiUsageRepo = new AIUsageLogRepository(db);
            this.tagRepo = new TagRepository(db);
            this.tempVoiceRepo = new TempVoiceChannelRepository(db);
            this.triggerRepo = new TriggerRepository(db);
          }
        } catch (err) {
          console.warn(
            `[AppwriteService] Failed to init Postgres repositories (${
              err instanceof Error ? err.message : String(err)
            }) — falling back to Appwrite.`,
          );
        }
      }
    }

    // Required for Appwrite Realtime in Node.js
    if (typeof global !== "undefined") {
      (global as any).WebSocket = WebSocket;
      (global as any).window = global;
      (global as any).self = global;
      (global as any).localStorage = {
        getItem: () => null,
        setItem: () => null,
        removeItem: () => null,
        clear: () => null,
        length: 0,
        key: () => null,
      };
    }

    this.realtimeClient = new AppwriteClient()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!);
  }

  async getGuildConfigs(guildId: string): Promise<any[]> {
    if (this.guildConfigRepo) {
      try {
        return await this.guildConfigRepo.listByGuild(guildId);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres listByGuild failed for ${guildId}:`,
          error,
        );
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [Query.equal("guildId", guildId)],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching guild configs for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async isModuleEnabled(guildId: string, moduleName: string): Promise<boolean> {
    const cacheKey = `enabled:${guildId}:${moduleName.toLowerCase()}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached as boolean;

    if (this.guildConfigRepo) {
      try {
        const enabled = await this.guildConfigRepo.isModuleEnabled(
          guildId,
          moduleName,
        );
        this.configCache.set(cacheKey, enabled);
        return enabled;
      } catch (error: any) {
        console.error(
          `[AppwriteService] Postgres isModuleEnabled failed for ${guildId}/${moduleName}:`,
          error?.message || error,
        );
        return true;
      }
    }

    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", moduleName.toLowerCase()),
        ],
      );

      const enabled = response.total > 0 ? response.documents[0].enabled : true;
      this.configCache.set(cacheKey, enabled);
      return enabled;
    } catch (error: any) {
      console.error(
        `[AppwriteService] Error checking module status for Guild:${guildId} Module:${moduleName}:`,
        error.message || error,
      );
      return true;
    }
  }

  async setModuleStatus(guildId: string, moduleName: string, enabled: boolean) {
    const name = moduleName.toLowerCase();
    if (this.guildConfigRepo) {
      try {
        await this.guildConfigRepo.setModuleStatus(guildId, name, enabled);
        this.configCache.invalidate(`enabled:${guildId}:${name}`);
        this.configCache.invalidate(`settings:${guildId}:${name}`);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres setModuleStatus failed for ${guildId}/${moduleName}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", name),
        ],
      );

      if (response.total > 0) {
        await this.databases.updateDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          response.documents[0].$id,
          { enabled },
        );
      } else {
        await this.databases.createDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          "unique()",
          {
            guildId,
            moduleName: name,
            enabled,
            settings: "{}",
          },
        );
      }

      this.configCache.invalidate(`enabled:${guildId}:${name}`);
      this.configCache.invalidate(`settings:${guildId}:${name}`);
    } catch (error) {
      console.error(
        `[AppwriteService] Error setting module status for ${guildId}/${moduleName}:`,
        error,
      );
    }
  }

  async getModuleSettings(
    guildId: string,
    moduleName: string,
  ): Promise<Record<string, any>> {
    const cacheKey = `settings:${guildId}:${moduleName.toLowerCase()}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached as Record<string, any>;

    if (this.guildConfigRepo) {
      try {
        const settings = await this.guildConfigRepo.getModuleSettings(
          guildId,
          moduleName,
        );
        this.configCache.set(cacheKey, settings);
        return settings;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getModuleSettings failed for ${guildId}/${moduleName}:`,
          error,
        );
        return {};
      }
    }

    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", moduleName.toLowerCase()),
        ],
      );

      let settings: Record<string, any> = {};
      if (response.total > 0 && response.documents[0].settings) {
        settings = JSON.parse(response.documents[0].settings);
      }
      this.configCache.set(cacheKey, settings);
      return settings;
    } catch (error) {
      console.error(
        `[AppwriteService] Error getting module settings for ${guildId}/${moduleName}:`,
        error,
      );
      return {};
    }
  }

  async setModuleSettings(
    guildId: string,
    moduleName: string,
    settings: Record<string, any>,
  ) {
    const name = moduleName.toLowerCase();
    if (this.guildConfigRepo) {
      try {
        await this.guildConfigRepo.setModuleSettings(guildId, name, settings);
        this.configCache.invalidate(`settings:${guildId}:${name}`);
        this.configCache.invalidate(`enabled:${guildId}:${name}`);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres setModuleSettings failed for ${guildId}/${moduleName}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", name),
        ],
      );

      const settingsJson = JSON.stringify(settings);

      if (response.total > 0) {
        await this.databases.updateDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          response.documents[0].$id,
          { settings: settingsJson },
        );
      } else {
        await this.databases.createDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          "unique()",
          {
            guildId,
            moduleName: name,
            enabled: true,
            settings: settingsJson,
          },
        );
      }

      this.configCache.invalidate(`settings:${guildId}:${name}`);
      this.configCache.invalidate(`enabled:${guildId}:${name}`);
    } catch (error) {
      console.error(
        `[AppwriteService] Error setting module settings for ${guildId}/${moduleName}:`,
        error,
      );
    }
  }

  /** Force-invalidate cached settings for a guild (call after external dashboard changes). */
  invalidateSettingsCache(guildId?: string): void {
    if (guildId) {
      this.configCache.invalidatePrefix(`enabled:${guildId}:`);
      this.configCache.invalidatePrefix(`settings:${guildId}:`);
    } else {
      this.configCache.invalidateAll();
    }
  }

  subscribeToModules(callback: (payload: any) => void) {
    return this.realtimeClient.subscribe(
      [
        `databases.${this.databaseId}.collections.${this.modulesCollectionId}.documents`,
      ],
      (response) => {
        callback(response.payload);
      },
    );
  }

  subscribeToGuildConfigs(callback: (payload: any) => void) {
    return this.realtimeClient.subscribe(
      [
        `databases.${this.databaseId}.collections.${this.guildConfigsCollectionId}.documents`,
      ],
      (response) => {
        callback(response.payload);
      },
    );
  }

  async getEnabledModules(): Promise<string[]> {
    if (this.moduleRepo) {
      try {
        return await this.moduleRepo.listEnabled();
      } catch (error) {
        console.error("[AppwriteService] Postgres listEnabled failed:", error);
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.modulesCollectionId,
        [Query.equal("enabled", true)],
      );
      return response.documents.map((doc: any) => doc.name);
    } catch (error) {
      console.error("Error fetching enabled modules:", error);
      return [];
    }
  }

  async getServers(): Promise<any[]> {
    if (this.serverRepo) {
      try {
        return await this.serverRepo.listAll();
      } catch (error) {
        console.error("[AppwriteService] Postgres server list failed:", error);
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.serversCollectionId,
      );
      return response.documents;
    } catch (error) {
      console.error("Error fetching servers:", error);
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
  ) {
    if (this.serverRepo) {
      try {
        await this.serverRepo.updateStatus(
          serverId,
          guildId,
          status,
          memberCount,
          icon,
          name,
          shardId,
        );
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres updateServerStatus failed for ${serverId}:`,
          error,
        );
        return;
      }
    }
    try {
      await this.databases.updateDocument(
        this.databaseId,
        this.serversCollectionId,
        serverId,
        {
          guild_id: guildId,
          status,
          member_count: memberCount,
          icon: icon,
          name: name,
          shard_id: shardId,
          last_checked: new Date().toISOString(),
        },
      );
    } catch (error) {
      console.error(
        `[AppwriteService] Error updating server status for ${serverId}:`,
        error,
      );
    }
  }

  async logServerMessage(
    guildId: string,
    message: string,
    level: "info" | "warn" | "error",
    shardId?: number,
    source?: string,
  ) {
    if (this.logRepo) {
      try {
        await this.logRepo.log({ guildId, message, level, shardId, source });
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres logServerMessage failed for ${guildId}:`,
          error,
        );
        return;
      }
    }
    try {
      const data: Record<string, any> = {
        guildId,
        message,
        level,
        timestamp: new Date().toISOString(),
      };
      if (shardId !== undefined) data.shardId = shardId;
      if (source) data.source = source;

      await this.databases.createDocument(
        this.databaseId,
        this.logsCollectionId,
        "unique()",
        data,
      );
    } catch (error) {
      console.error(
        `[AppwriteService] Error logging message for ${guildId}:`,
        error,
      );
    }
  }

  async updateBotHeartbeat(
    botId: string,
    version: string,
    shardId: number,
    totalShards: number,
  ) {
    if (this.botStatusRepo) {
      try {
        await this.botStatusRepo.updateHeartbeat(
          botId,
          version,
          shardId,
          totalShards,
        );
        return;
      } catch (error) {
        console.error("[AppwriteService] Postgres heartbeat failed:", error);
        return;
      }
    }
    try {
      const documentId = `shard-${shardId}`;
      const data = {
        bot_id: botId,
        last_seen: new Date().toISOString(),
        version: version,
        shard_id: shardId,
        total_shards: totalShards,
      };

      try {
        await this.databases.updateDocument(
          this.databaseId,
          this.botStatusCollectionId,
          documentId,
          data,
        );
      } catch (error: any) {
        if (error.code === 404) {
          await this.databases.createDocument(
            this.databaseId,
            this.botStatusCollectionId,
            documentId,
            data,
          );
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("[AppwriteService] Error updating heartbeat:", error);
    }
  }

  async ensureModuleRegistered(moduleName: string, description: string) {
    if (this.moduleRepo) {
      try {
        await this.moduleRepo.ensureRegistered(moduleName, description);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres ensureRegistered failed for ${moduleName}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.modulesCollectionId,
        [Query.equal("name", moduleName)],
      );

      if (response.total === 0) {
        await this.databases.createDocument(
          this.databaseId,
          this.modulesCollectionId,
          "unique()",
          {
            name: moduleName,
            description: description,
            enabled: true,
          },
        );
        console.log(`Registered new module: ${moduleName}`);
      }
    } catch (error) {
      console.error(`Error registering module ${moduleName}:`, error);
    }
  }

  // ── Recording Storage ──────────────────────────────────────────────────
  //
  // Dual-backend: when r2 is initialized, new uploads go to R2 and the
  // returned "file ID" is actually an R2 object key. Legacy Appwrite file IDs
  // keep working because the helpers detect the key shape (looksLikeR2Key).

  /**
   * Appwrite-only buffer upload. Use for paths that don't have guild/recording
   * context (announce clips, legacy callers). The recording pipeline calls
   * `uploadRecordingTrack` / `uploadRecordingMix` instead so keys can be
   * organized by session.
   */
  async uploadRecordingFile(
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const file = await this.storage.createFile(
      this.recordingsBucketId,
      ID.unique(),
      InputFile.fromBuffer(fileBuffer, fileName),
    );
    return file.$id;
  }

  /** Upload a per-user track. Streams from disk when R2 is enabled. */
  async uploadRecordingTrack(params: {
    guildId: string;
    recordingId: string;
    userId: string;
    filePath: string;
    fileBuffer?: Buffer;
  }): Promise<string> {
    if (this.r2) {
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
      await this.r2.uploadStream(key, body, "audio/ogg");
      return key;
    }
    const fs = await import("fs");
    const buffer = params.fileBuffer ?? fs.readFileSync(params.filePath);
    return this.uploadRecordingFile(
      buffer,
      `${params.userId}_${params.guildId}_${Date.now()}.ogg`,
    );
  }

  /** Upload a mixed session file. Streams from disk when R2 is enabled. */
  async uploadRecordingMix(params: {
    guildId: string;
    recordingId: string;
    filePath: string;
    fileBuffer?: Buffer;
  }): Promise<string> {
    if (this.r2) {
      const key = mixedKey(params.guildId, params.recordingId, Date.now());
      const fs = await import("fs");
      const body = params.fileBuffer
        ? Readable.from(params.fileBuffer)
        : fs.createReadStream(params.filePath);
      await this.r2.uploadStream(key, body, "audio/ogg");
      return key;
    }
    const fs = await import("fs");
    const buffer = params.fileBuffer ?? fs.readFileSync(params.filePath);
    return this.uploadRecordingFile(
      buffer,
      `mixed_${params.guildId}_${Date.now()}.ogg`,
    );
  }

  async deleteRecordingFile(fileId: string) {
    if (this.r2 && looksLikeR2Key(fileId)) {
      await this.r2.delete(fileId);
      return;
    }
    await this.storage.deleteFile(this.recordingsBucketId, fileId);
  }

  /** Bulk delete every object under a recording's R2 prefix. */
  async deleteRecordingPrefix(
    guildId: string,
    recordingId: string,
  ): Promise<void> {
    if (!this.r2) return;
    const prefix = recordingPrefix(guildId, recordingId);
    const keys = await this.r2.listPrefix(prefix);
    await this.r2.deleteMany(keys);
  }

  getRecordingFileUrl(fileId: string): string {
    // Legacy helper — kept for non-streaming callers. R2 files need presigned
    // URLs (see `getRecordingFileSignedUrl`), so this only handles Appwrite.
    const endpoint = process.env.APPWRITE_ENDPOINT!;
    const projectId = process.env.APPWRITE_PROJECT_ID!;
    return `${endpoint}/storage/buckets/${this.recordingsBucketId}/files/${fileId}/view?project=${projectId}`;
  }

  /** Signed playback URL. Works for both R2 and Appwrite-backed files. */
  async getRecordingFileSignedUrl(fileId: string): Promise<string> {
    if (this.r2 && looksLikeR2Key(fileId)) {
      return this.r2.presignGet(fileId);
    }
    return this.getRecordingFileUrl(fileId);
  }

  async getRecordingFileBuffer(fileId: string): Promise<Buffer> {
    if (this.r2 && looksLikeR2Key(fileId)) {
      return this.r2.getBuffer(fileId);
    }
    const result = await this.storage.getFileView(
      this.recordingsBucketId,
      fileId,
    );
    return Buffer.from(result);
  }

  // ── Recording Metadata ─────────────────────────────────────────────────
  //
  // All recording CRUD dispatches to the Postgres repository when it's
  // initialized (USE_POSTGRES_RECORDINGS=true) and falls back to Appwrite
  // otherwise. The `$id`/snake_case aliases on RecordingDoc keep callers
  // that rely on Appwrite's document shape working unchanged.

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
    if (this.recordingRepo) {
      return this.recordingRepo.create(data);
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.recordingsCollectionId,
      ID.unique(),
      data,
    );
    return doc.$id;
  }

  async updateRecording(recordingId: string, data: Record<string, any>) {
    if (this.recordingRepo) {
      await this.recordingRepo.update(recordingId, data);
      return;
    }
    await this.databases.updateDocument(
      this.databaseId,
      this.recordingsCollectionId,
      recordingId,
      data,
    );
  }

  async getRecordings(guildId: string, limit = 50): Promise<any[]> {
    if (this.recordingRepo) {
      return this.recordingRepo.listByGuild(guildId, limit);
    }
    const response = await this.databases.listDocuments(
      this.databaseId,
      this.recordingsCollectionId,
      [
        Query.equal("guild_id", guildId),
        Query.orderDesc("started_at"),
        Query.limit(limit),
      ],
    );
    return response.documents;
  }

  /**
   * Return recordings whose `started_at` is older than the given ISO cutoff.
   * Used by the retention worker to find deletion candidates.
   */
  async getRecordingsOlderThan(
    cutoffIso: string,
    limit = 100,
  ): Promise<any[]> {
    if (this.recordingRepo) {
      return this.recordingRepo.listOlderThan(cutoffIso, limit);
    }
    const response = await this.databases.listDocuments(
      this.databaseId,
      this.recordingsCollectionId,
      [
        Query.lessThan("started_at", cutoffIso),
        Query.orderAsc("started_at"),
        Query.limit(limit),
      ],
    );
    return response.documents;
  }

  async deleteRecording(recordingId: string) {
    if (this.recordingRepo) {
      // Postgres path: delete rows in a single transaction via FK cascade,
      // then remove the referenced files from object storage. If file
      // deletion fails we still return, because the DB side is authoritative
      // — orphaned R2 objects get swept by the prefix delete below.
      const { recording, tracks } =
        await this.recordingRepo.deleteWithTracks(recordingId);

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
      if (this.r2 && recording?.guild_id) {
        try {
          await this.deleteRecordingPrefix(recording.guild_id, recordingId);
        } catch {}
      }
      return;
    }

    // Appwrite fallback (unchanged from prior behavior).
    let recording: any;
    try {
      recording = await this.databases.getDocument(
        this.databaseId,
        this.recordingsCollectionId,
        recordingId,
      );
    } catch {
      recording = null;
    }

    const tracks = await this.databases.listDocuments(
      this.databaseId,
      this.recordingTracksCollectionId,
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );
    for (const track of tracks.documents) {
      try {
        await this.deleteRecordingFile(track.file_id);
      } catch {}
      await this.databases.deleteDocument(
        this.databaseId,
        this.recordingTracksCollectionId,
        track.$id,
      );
    }

    if (recording?.mixed_file_id) {
      try {
        await this.deleteRecordingFile(recording.mixed_file_id);
      } catch {}
    }

    if (this.r2 && recording?.guild_id) {
      try {
        await this.deleteRecordingPrefix(recording.guild_id, recordingId);
      } catch {}
    }

    await this.databases.deleteDocument(
      this.databaseId,
      this.recordingsCollectionId,
      recordingId,
    );
  }

  // ── Recording Tracks ───────────────────────────────────────────────────

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
    if (this.recordingRepo) {
      return this.recordingRepo.createTrack(data);
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.recordingTracksCollectionId,
      ID.unique(),
      data,
    );
    return doc.$id;
  }

  async getRecordingTracks(recordingId: string): Promise<any[]> {
    if (this.recordingRepo) {
      return this.recordingRepo.listTracks(recordingId);
    }
    const response = await this.databases.listDocuments(
      this.databaseId,
      this.recordingTracksCollectionId,
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );
    return response.documents;
  }

  // ── Milestone Tracking ──────────────────────────────────────────────────

  async getMilestoneUser(guildId: string, userId: string): Promise<any | null> {
    if (this.milestoneRepo) {
      try {
        return await this.milestoneRepo.getByGuildAndUser(guildId, userId);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getMilestoneUser failed for ${guildId}/${userId}:`,
          error,
        );
        return null;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.milestoneUsersCollectionId,
        [
          Query.equal("guild_id", guildId),
          Query.equal("user_id", userId),
          Query.limit(1),
        ],
      );
      return response.total > 0 ? response.documents[0] : null;
    } catch (error) {
      console.error(
        `[AppwriteService] Error getting milestone user ${guildId}/${userId}:`,
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
    if (this.milestoneRepo) {
      return this.milestoneRepo.create(data);
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.milestoneUsersCollectionId,
      ID.unique(),
      data,
    );
    return doc.$id;
  }

  async updateMilestoneUser(
    docId: string,
    data: Record<string, any>,
  ): Promise<void> {
    if (this.milestoneRepo) {
      await this.milestoneRepo.update(docId, data);
      return;
    }
    await this.databases.updateDocument(
      this.databaseId,
      this.milestoneUsersCollectionId,
      docId,
      data,
    );
  }

  async getMilestoneLeaderboard(
    guildId: string,
    limit: number,
    offset: number,
  ): Promise<{ users: any[]; total: number }> {
    if (this.milestoneRepo) {
      try {
        return await this.milestoneRepo.getLeaderboard(guildId, limit, offset);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres leaderboard failed for ${guildId}:`,
          error,
        );
        return { users: [], total: 0 };
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.milestoneUsersCollectionId,
        [
          Query.equal("guild_id", guildId),
          Query.equal("opted_in", true),
          Query.orderDesc("char_count"),
          Query.limit(limit),
          Query.offset(offset),
        ],
      );
      return { users: response.documents, total: response.total };
    } catch (error) {
      console.error(
        `[AppwriteService] Error getting milestone leaderboard for ${guildId}:`,
        error,
      );
      return { users: [], total: 0 };
    }
  }

  async getMilestoneUserRank(
    guildId: string,
    charCount: number,
  ): Promise<number> {
    if (this.milestoneRepo) {
      try {
        return await this.milestoneRepo.getRank(guildId, charCount);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getRank failed for ${guildId}:`,
          error,
        );
        return 0;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.milestoneUsersCollectionId,
        [
          Query.equal("guild_id", guildId),
          Query.equal("opted_in", true),
          Query.greaterThan("char_count", charCount),
          Query.limit(1), // We only need total count
        ],
      );
      return response.total + 1;
    } catch (error) {
      console.error(
        `[AppwriteService] Error getting milestone rank for ${guildId}:`,
        error,
      );
      return 0;
    }
  }

  // ── AutoMod Rules ──────────────────────────────────────────────────────

  async getAutoModRules(guildId: string, trigger?: string): Promise<any[]> {
    if (this.automodRepo) {
      try {
        return await this.automodRepo.listByGuild(guildId, trigger);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres automod list failed for ${guildId}:`,
          error,
        );
        return [];
      }
    }
    try {
      const queries = [Query.equal("guild_id", guildId), Query.limit(100)];
      if (trigger) {
        queries.push(Query.equal("trigger", trigger));
      }
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.automodRulesCollectionId,
        queries,
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching automod rules for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async getEnabledAutoModRules(
    guildId: string,
    trigger: string,
  ): Promise<any[]> {
    if (this.automodRepo) {
      try {
        return await this.automodRepo.listEnabledByTrigger(guildId, trigger);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres enabled automod list failed for ${guildId}/${trigger}:`,
          error,
        );
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.automodRulesCollectionId,
        [
          Query.equal("guild_id", guildId),
          Query.equal("enabled", true),
          Query.equal("trigger", trigger),
          Query.limit(100),
        ],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching enabled automod rules for ${guildId}/${trigger}:`,
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
    if (this.automodRepo) {
      return this.automodRepo.create(data);
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.automodRulesCollectionId,
      ID.unique(),
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
    );
    return doc.$id;
  }

  async updateAutoModRule(
    ruleId: string,
    data: Record<string, any>,
  ): Promise<void> {
    if (this.automodRepo) {
      await this.automodRepo.update(ruleId, data);
      return;
    }
    await this.databases.updateDocument(
      this.databaseId,
      this.automodRulesCollectionId,
      ruleId,
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
    );
  }

  async deleteAutoModRule(ruleId: string): Promise<void> {
    if (this.automodRepo) {
      await this.automodRepo.delete(ruleId);
      return;
    }
    await this.databases.deleteDocument(
      this.databaseId,
      this.automodRulesCollectionId,
      ruleId,
    );
  }

  // ── Global AI Config (admin-set fallback) ────────────────────────
  // Stored as guild_configs { guildId: "__global__", moduleName: "ai" }

  async getGlobalAIConfig(): Promise<Record<string, any> | null> {
    if (this.guildConfigRepo) {
      try {
        return await this.guildConfigRepo.getGlobalAIConfig();
      } catch (error) {
        console.error("[AppwriteService] Postgres getGlobalAIConfig failed:", error);
        return null;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", "__global__"),
          Query.equal("moduleName", "ai"),
          Query.limit(1),
        ],
      );
      if (response.total > 0 && response.documents[0].settings) {
        return JSON.parse(response.documents[0].settings);
      }
      return null;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching global AI config:`,
        error,
      );
      return null;
    }
  }

  async setGlobalAIConfig(config: Record<string, any>): Promise<void> {
    if (this.guildConfigRepo) {
      try {
        await this.guildConfigRepo.setGlobalAIConfig(config);
        return;
      } catch (error) {
        console.error("[AppwriteService] Postgres setGlobalAIConfig failed:", error);
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", "__global__"),
          Query.equal("moduleName", "ai"),
          Query.limit(1),
        ],
      );
      if (response.total > 0) {
        await this.databases.updateDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          response.documents[0].$id,
          { settings: JSON.stringify(config) },
        );
      } else {
        await this.databases.createDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          ID.unique(),
          {
            guildId: "__global__",
            moduleName: "ai",
            enabled: true,
            settings: JSON.stringify(config),
          },
        );
      }
    } catch (error) {
      console.error(`[AppwriteService] Error saving global AI config:`, error);
    }
  }

  // ── AI Usage Logging ─────────────────────────────────────────────

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
    if (this.aiUsageRepo) {
      try {
        await this.aiUsageRepo.log(data);
        return;
      } catch (error) {
        console.error("[AppwriteService] Postgres logAIUsage failed:", error);
        return;
      }
    }
    try {
      await this.databases.createDocument(
        this.databaseId,
        this.aiUsageLogCollectionId,
        ID.unique(),
        {
          ...data,
          action: data.action ?? "chat",
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      console.error(`[AppwriteService] Error logging AI usage:`, error);
    }
  }

  async getAIUsageLogs(guildId: string, limit = 50): Promise<any[]> {
    if (this.aiUsageRepo) {
      try {
        return await this.aiUsageRepo.listByGuild(guildId, limit);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getAIUsageLogs failed for ${guildId}:`,
          error,
        );
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.aiUsageLogCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.orderDesc("timestamp"),
          Query.limit(limit),
        ],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching AI usage logs for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  // ── Premium Guild Management ─────────────────────────────────

  async isGuildPremium(guildId: string): Promise<boolean> {
    if (this.serverRepo) {
      try {
        return await this.serverRepo.isPremium(guildId);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres isPremium failed for ${guildId}:`,
          error,
        );
        return false;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.serversCollectionId,
        [Query.equal("guild_id", guildId), Query.limit(1)],
      );
      if (response.total > 0) {
        return response.documents[0].premium === true;
      }
      return false;
    } catch (error) {
      console.error(
        `[AppwriteService] Error checking premium status for ${guildId}:`,
        error,
      );
      return false;
    }
  }

  async setGuildPremium(guildId: string, premium: boolean): Promise<void> {
    if (this.serverRepo) {
      try {
        await this.serverRepo.setPremium(guildId, premium);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres setPremium failed for ${guildId}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.serversCollectionId,
        [Query.equal("guild_id", guildId), Query.limit(1)],
      );
      if (response.total > 0) {
        await this.databases.updateDocument(
          this.databaseId,
          this.serversCollectionId,
          response.documents[0].$id,
          { premium },
        );
      }
    } catch (error) {
      console.error(
        `[AppwriteService] Error setting premium status for ${guildId}:`,
        error,
      );
    }
  }

  // ── Tags ─────────────────────────────────────────────────────────

  async getTags(guildId: string): Promise<any[]> {
    if (this.tagRepo) {
      try {
        return await this.tagRepo.listByGuild(guildId);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getTags failed for ${guildId}:`,
          error,
        );
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.tagsCollectionId,
        [Query.equal("guild_id", guildId), Query.limit(100)],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching tags for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async getTagByName(guildId: string, name: string): Promise<any | null> {
    const cacheKey = `tag:${guildId}:${name.toLowerCase()}`;
    const cached = this.configCache.get(cacheKey);
    if (cached !== undefined) return cached;

    if (this.tagRepo) {
      try {
        const tag = await this.tagRepo.getByName(guildId, name);
        this.configCache.set(cacheKey, tag);
        return tag;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getTagByName failed for ${guildId}/${name}:`,
          error,
        );
        return null;
      }
    }

    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.tagsCollectionId,
        [
          Query.equal("guild_id", guildId),
          Query.equal("name", name.toLowerCase()),
          Query.limit(1),
        ],
      );
      const tag = response.total > 0 ? response.documents[0] : null;
      this.configCache.set(cacheKey, tag);
      return tag;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching tag ${name} for ${guildId}:`,
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
    if (this.tagRepo) {
      const id = await this.tagRepo.create(data);
      this.configCache.invalidate(
        `tag:${data.guild_id}:${data.name.toLowerCase()}`,
      );
      return id;
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.tagsCollectionId,
      ID.unique(),
      {
        ...data,
        name: data.name.toLowerCase(),
        updated_at: new Date().toISOString(),
      },
    );
    this.configCache.invalidate(
      `tag:${data.guild_id}:${data.name.toLowerCase()}`,
    );
    return doc.$id;
  }

  async updateTag(tagId: string, data: Record<string, any>): Promise<void> {
    if (this.tagRepo) {
      await this.tagRepo.update(tagId, data);
      if (data.guild_id) {
        this.configCache.invalidatePrefix(`tag:${data.guild_id}:`);
      }
      return;
    }
    await this.databases.updateDocument(
      this.databaseId,
      this.tagsCollectionId,
      tagId,
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
    );
    if (data.guild_id) {
      this.configCache.invalidatePrefix(`tag:${data.guild_id}:`);
    }
  }

  async deleteTag(tagId: string, guildId?: string): Promise<void> {
    if (this.tagRepo) {
      await this.tagRepo.delete(tagId);
      if (guildId) {
        this.configCache.invalidatePrefix(`tag:${guildId}:`);
      }
      return;
    }
    await this.databases.deleteDocument(
      this.databaseId,
      this.tagsCollectionId,
      tagId,
    );
    if (guildId) {
      this.configCache.invalidatePrefix(`tag:${guildId}:`);
    }
  }

  // ── Temp Voice Channels ──────────────────────────────────────────────

  async createTempChannel(data: {
    guild_id: string;
    channel_id: string;
    owner_id: string;
    lobby_channel_id: string;
  }): Promise<string> {
    if (this.tempVoiceRepo) {
      return this.tempVoiceRepo.create(data);
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.tempVoiceChannelsCollectionId,
      ID.unique(),
      {
        ...data,
        created_at: new Date().toISOString(),
      },
    );
    return doc.$id;
  }

  async deleteTempChannel(channelId: string): Promise<void> {
    if (this.tempVoiceRepo) {
      try {
        await this.tempVoiceRepo.deleteByChannelId(channelId);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres deleteTempChannel failed for ${channelId}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.tempVoiceChannelsCollectionId,
        [Query.equal("channel_id", channelId), Query.limit(1)],
      );
      if (response.total > 0) {
        await this.databases.deleteDocument(
          this.databaseId,
          this.tempVoiceChannelsCollectionId,
          response.documents[0].$id,
        );
      }
    } catch (error) {
      console.error(
        `[AppwriteService] Error deleting temp channel ${channelId}:`,
        error,
      );
    }
  }

  async getTempChannels(guildId: string): Promise<any[]> {
    if (this.tempVoiceRepo) {
      try {
        return await this.tempVoiceRepo.listByGuild(guildId);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres getTempChannels failed for ${guildId}:`,
          error,
        );
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.tempVoiceChannelsCollectionId,
        [Query.equal("guild_id", guildId), Query.limit(500)],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching temp channels for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async getAllTempChannels(): Promise<any[]> {
    if (this.tempVoiceRepo) {
      try {
        return await this.tempVoiceRepo.listAll();
      } catch (error) {
        console.error("[AppwriteService] Postgres getAllTempChannels failed:", error);
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.tempVoiceChannelsCollectionId,
        [Query.limit(500)],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching all temp channels:`,
        error,
      );
      return [];
    }
  }

  async updateTempChannelOwner(
    channelId: string,
    newOwnerId: string,
  ): Promise<void> {
    if (this.tempVoiceRepo) {
      try {
        await this.tempVoiceRepo.updateOwner(channelId, newOwnerId);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres updateTempChannelOwner failed for ${channelId}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.tempVoiceChannelsCollectionId,
        [Query.equal("channel_id", channelId), Query.limit(1)],
      );
      if (response.total > 0) {
        await this.databases.updateDocument(
          this.databaseId,
          this.tempVoiceChannelsCollectionId,
          response.documents[0].$id,
          { owner_id: newOwnerId },
        );
      }
    } catch (error) {
      console.error(
        `[AppwriteService] Error updating temp channel owner for ${channelId}:`,
        error,
      );
    }
  }

  // ── Triggers (Custom Webhooks) ─────────────────────────────────────────

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
    if (this.triggerRepo) {
      return this.triggerRepo.create(data);
    }
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.triggersCollectionId,
      ID.unique(),
      {
        ...data,
        enabled: true,
        created_at: new Date().toISOString(),
      },
    );
    return doc.$id;
  }

  async listTriggers(guildId: string): Promise<any[]> {
    if (this.triggerRepo) {
      try {
        return await this.triggerRepo.listByGuild(guildId);
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres listTriggers failed for ${guildId}:`,
          error,
        );
        return [];
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.triggersCollectionId,
        [Query.equal("guild_id", guildId), Query.limit(100)],
      );
      return response.documents;
    } catch (error) {
      console.error(
        `[AppwriteService] Error listing triggers for ${guildId}:`,
        error,
      );
      return [];
    }
  }

  async getTriggerBySecret(secret: string): Promise<any | null> {
    if (this.triggerRepo) {
      try {
        return await this.triggerRepo.getBySecret(secret);
      } catch (error) {
        console.error(
          "[AppwriteService] Postgres getTriggerBySecret failed:",
          error,
        );
        return null;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.triggersCollectionId,
        [Query.equal("secret", secret), Query.limit(1)],
      );
      return response.total > 0 ? response.documents[0] : null;
    } catch (error) {
      console.error(
        `[AppwriteService] Error fetching trigger by secret:`,
        error,
      );
      return null;
    }
  }

  async deleteTrigger(triggerId: string): Promise<void> {
    if (this.triggerRepo) {
      await this.triggerRepo.delete(triggerId);
      return;
    }
    await this.databases.deleteDocument(
      this.databaseId,
      this.triggersCollectionId,
      triggerId,
    );
  }

  async updateTrigger(
    triggerId: string,
    data: Record<string, any>,
  ): Promise<void> {
    if (this.triggerRepo) {
      await this.triggerRepo.update(triggerId, data);
      return;
    }
    await this.databases.updateDocument(
      this.databaseId,
      this.triggersCollectionId,
      triggerId,
      data,
    );
  }

  // ── Alerts Worker ─────────────────────────────────────────────────

  /**
   * Returns all guild_configs docs where moduleName=alerts AND enabled=true,
   * paginated across all guilds. Used exclusively by AlertsWorker.
   */
  async getAllAlertsConfigs(): Promise<Array<{ guildId: string; alerts: any[] }>> {
    if (this.guildConfigRepo) {
      try {
        return await this.guildConfigRepo.getAllAlertsConfigs();
      } catch (error) {
        console.error(
          "[AppwriteService] Postgres getAllAlertsConfigs failed:",
          error,
        );
        return [];
      }
    }
    const results: Array<{ guildId: string; alerts: any[] }> = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      try {
        const response = await this.databases.listDocuments(
          this.databaseId,
          this.guildConfigsCollectionId,
          [
            Query.equal("moduleName", "alerts"),
            Query.equal("enabled", true),
            Query.limit(pageSize),
            Query.offset(offset),
          ],
        );

        for (const doc of response.documents) {
          try {
            const settings = doc.settings ? JSON.parse(doc.settings) : {};
            const alerts = Array.isArray(settings.alerts) ? settings.alerts : [];
            if (alerts.length > 0) {
              results.push({ guildId: doc.guildId, alerts });
            }
          } catch {
            // skip malformed settings
          }
        }

        if (response.documents.length < pageSize) break;
        offset += pageSize;
      } catch (error) {
        console.error("[AppwriteService] Error fetching all alerts configs:", error);
        break;
      }
    }

    return results;
  }

  /**
   * Returns the persisted last-seen state for all alerts in a guild.
   * Shape: Record<`${platform}:${handle}`, lastSeenId: string>
   */
  async getAlertsState(guildId: string): Promise<Record<string, string>> {
    if (this.guildConfigRepo) {
      try {
        return await this.guildConfigRepo.getAlertsState(guildId);
      } catch {
        return {};
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", "alerts_state"),
          Query.limit(1),
        ],
      );
      if (response.total > 0 && response.documents[0].settings) {
        return JSON.parse(response.documents[0].settings);
      }
    } catch {
      // ignore — treat as empty
    }
    return {};
  }

  /**
   * Persists the last-seen state for a guild's alerts.
   */
  async setAlertsState(guildId: string, state: Record<string, string>): Promise<void> {
    if (this.guildConfigRepo) {
      try {
        await this.guildConfigRepo.setAlertsState(guildId, state);
        return;
      } catch (error) {
        console.error(
          `[AppwriteService] Postgres setAlertsState failed for ${guildId}:`,
          error,
        );
        return;
      }
    }
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", "alerts_state"),
          Query.limit(1),
        ],
      );
      const settingsJson = JSON.stringify(state);
      if (response.total > 0) {
        await this.databases.updateDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          response.documents[0].$id,
          { settings: settingsJson },
        );
      } else {
        await this.databases.createDocument(
          this.databaseId,
          this.guildConfigsCollectionId,
          ID.unique(),
          {
            guildId,
            moduleName: "alerts_state",
            enabled: true,
            settings: settingsJson,
          },
        );
      }
    } catch (error) {
      console.error(`[AppwriteService] Error saving alerts state for ${guildId}:`, error);
    }
  }
}
