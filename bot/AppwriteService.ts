import { Client, Databases, Query, Storage, ID } from "node-appwrite";
// @ts-ignore — subpath export resolves at runtime; legacy moduleResolution can't see it
import { InputFile } from "node-appwrite/file";
import { Client as AppwriteClient } from "appwrite";
import WebSocket from "ws";

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
  public storage: Storage;

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
        return response.documents[0].enabled;
      }

      return true; // Default to enabled
    } catch (error: any) {
      console.error(
        `[AppwriteService] Error checking module status for Guild:${guildId} Module:${moduleName}:`,
        error.message || error,
      );
      // If it's a 404/Not Found or similar index error, defaulting to true is safer but we should know it happened
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
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.guildConfigsCollectionId,
        [
          Query.equal("guildId", guildId),
          Query.equal("moduleName", moduleName.toLowerCase()),
        ],
      );

      if (response.total > 0 && response.documents[0].settings) {
        return JSON.parse(response.documents[0].settings);
      }
      return {};
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
    } catch (error) {
      console.error(
        `[AppwriteService] Error setting module settings for ${guildId}/${moduleName}:`,
        error,
      );
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
    ping: number,
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
          ping,
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
}
