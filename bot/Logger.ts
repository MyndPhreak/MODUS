import { AppwriteService } from "./AppwriteService";

export class Logger {
  private appwriteService: AppwriteService;
  private shardId: number;

  constructor(appwriteService: AppwriteService, shardId: number = 0) {
    this.appwriteService = appwriteService;
    this.shardId = shardId;
  }

  public getShardId(): number {
    return this.shardId;
  }

  private format(message: string, guildId?: string): string {
    const shardPrefix = `[Shard ${this.shardId}]`;
    const guildPrefix = guildId ? `[Guild ${guildId}]` : "";
    return `${shardPrefix}${guildPrefix} ${message}`;
  }

  public async info(message: string, guildId?: string, source?: string) {
    const formatted = this.format(message, guildId);
    console.log(`[INFO] ${formatted}`);
    await this.appwriteService.logServerMessage(
      guildId || "global",
      message,
      "info",
      this.shardId,
      source,
    );
  }

  public async warn(message: string, guildId?: string, source?: string) {
    const formatted = this.format(message, guildId);
    console.warn(`[WARN] ${formatted}`);
    await this.appwriteService.logServerMessage(
      guildId || "global",
      message,
      "warn",
      this.shardId,
      source,
    );
  }

  public async error(
    message: string,
    guildId?: string,
    error?: any,
    source?: string,
  ) {
    const formatted = this.format(message, guildId);
    console.error(`[ERROR] ${formatted}`, error);
    const errorMessage =
      error instanceof Error ? `${message}: ${error.message}` : message;
    await this.appwriteService.logServerMessage(
      guildId || "global",
      errorMessage,
      "error",
      this.shardId,
      source,
    );
  }
}
