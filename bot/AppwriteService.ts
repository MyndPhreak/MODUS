import { Client, Databases, Query, Storage, ID } from "node-appwrite";
// @ts-ignore — subpath export resolves at runtime; legacy moduleResolution can't see it
import { InputFile } from "node-appwrite/file";
import { Client as AppwriteClient } from "appwrite";
import WebSocket from "ws";

// ── In-Memory TTL Cache ────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlSeconds = 60) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all entries whose key starts with the given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  get size(): number {
    return this.store.size;
  }
}

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
  public storage: Storage;

  // TTL cache for guild config lookups (60s default)
  private configCache = new TTLCache<any>(60);

  constructor() {
    this.client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_API_KEY!);

    this.databases = new Databases(this.client);
    this.storage = new Storage(this.client);

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
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", moduleName.toLowerCase()),
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
            moduleName: moduleName.toLowerCase(),
            enabled,
            settings: "{}",
          },
        );
      }

      // Invalidate cache for this module
      this.configCache.invalidate(
        `enabled:${guildId}:${moduleName.toLowerCase()}`,
      );
      this.configCache.invalidate(
        `settings:${guildId}:${moduleName.toLowerCase()}`,
      );
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
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", moduleName.toLowerCase()),
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
            moduleName: moduleName.toLowerCase(),
            enabled: true,
            settings: settingsJson,
          },
        );
      }

      // Invalidate cache for this module
      this.configCache.invalidate(
        `settings:${guildId}:${moduleName.toLowerCase()}`,
      );
      this.configCache.invalidate(
        `enabled:${guildId}:${moduleName.toLowerCase()}`,
      );
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
      // Invalidate everything
      this.configCache.invalidatePrefix("");
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
        // Try to update existing document by ID
        await this.databases.updateDocument(
          this.databaseId,
          this.botStatusCollectionId,
          documentId,
          data,
        );
      } catch (error: any) {
        // If not found (404), create it
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

  async deleteRecordingFile(fileId: string) {
    await this.storage.deleteFile(this.recordingsBucketId, fileId);
  }

  getRecordingFileUrl(fileId: string): string {
    const endpoint = process.env.APPWRITE_ENDPOINT!;
    const projectId = process.env.APPWRITE_PROJECT_ID!;
    return `${endpoint}/storage/buckets/${this.recordingsBucketId}/files/${fileId}/view?project=${projectId}`;
  }

  async getRecordingFileBuffer(fileId: string): Promise<Buffer> {
    const result = await this.storage.getFileView(
      this.recordingsBucketId,
      fileId,
    );
    return Buffer.from(result);
  }

  // ── Recording Metadata ─────────────────────────────────────────────────

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
  }): Promise<string> {
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.recordingsCollectionId,
      ID.unique(),
      data,
    );
    return doc.$id;
  }

  async updateRecording(recordingId: string, data: Record<string, any>) {
    await this.databases.updateDocument(
      this.databaseId,
      this.recordingsCollectionId,
      recordingId,
      data,
    );
  }

  async getRecordings(guildId: string, limit = 50): Promise<any[]> {
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

  async deleteRecording(recordingId: string) {
    // Delete tracks first
    const tracks = await this.databases.listDocuments(
      this.databaseId,
      this.recordingTracksCollectionId,
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );
    for (const track of tracks.documents) {
      try {
        await this.storage.deleteFile(this.recordingsBucketId, track.file_id);
      } catch {}
      await this.databases.deleteDocument(
        this.databaseId,
        this.recordingTracksCollectionId,
        track.$id,
      );
    }

    // Delete mixed file
    const recording = await this.databases.getDocument(
      this.databaseId,
      this.recordingsCollectionId,
      recordingId,
    );
    if (recording.mixed_file_id) {
      try {
        await this.storage.deleteFile(
          this.recordingsBucketId,
          recording.mixed_file_id,
        );
      } catch {}
    }

    // Delete recording document
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
  }): Promise<string> {
    const doc = await this.databases.createDocument(
      this.databaseId,
      this.recordingTracksCollectionId,
      ID.unique(),
      data,
    );
    return doc.$id;
  }

  async getRecordingTracks(recordingId: string): Promise<any[]> {
    const response = await this.databases.listDocuments(
      this.databaseId,
      this.recordingTracksCollectionId,
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );
    return response.documents;
  }

  // ── Milestone Tracking ──────────────────────────────────────────────────

  async getMilestoneUser(guildId: string, userId: string): Promise<any | null> {
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
    await this.databases.deleteDocument(
      this.databaseId,
      this.automodRulesCollectionId,
      ruleId,
    );
  }

  // ── Global AI Config (admin-set fallback) ────────────────────────
  // Stored as guild_configs { guildId: "__global__", moduleName: "ai" }

  async getGlobalAIConfig(): Promise<Record<string, any> | null> {
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
    await this.databases.updateDocument(
      this.databaseId,
      this.tagsCollectionId,
      tagId,
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
    );
    // Invalidate tag cache for this guild
    if (data.guild_id) {
      this.configCache.invalidatePrefix(`tag:${data.guild_id}:`);
    }
  }

  async deleteTag(tagId: string, guildId?: string): Promise<void> {
    await this.databases.deleteDocument(
      this.databaseId,
      this.tagsCollectionId,
      tagId,
    );
    if (guildId) {
      this.configCache.invalidatePrefix(`tag:${guildId}:`);
    }
  }
}
