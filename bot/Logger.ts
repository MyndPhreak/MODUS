import { DatabaseService } from "./DatabaseService";

export class Logger {
  private databaseService: DatabaseService;
  private shardId: number;

  constructor(databaseService: DatabaseService, shardId: number = 0) {
    this.databaseService = databaseService;
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

  /**
   * Callers routinely fire-and-forget logger calls, so a DB hiccup here
   * must never escape as an unhandled rejection — console output above
   * has already happened, persistence is best-effort.
   */
  private async persist(
    message: string,
    level: "info" | "warn" | "error",
    guildId?: string,
    source?: string,
  ) {
    try {
      await this.databaseService.logServerMessage(
        guildId || "global",
        message,
        level,
        this.shardId,
        source,
      );
    } catch (err) {
      console.error("[Logger] Failed to persist log entry:", err);
    }
  }

  public async info(message: string, guildId?: string, source?: string) {
    const formatted = this.format(message, guildId);
    console.log(`[INFO] ${formatted}`);
    await this.persist(message, "info", guildId, source);
  }

  public async warn(message: string, guildId?: string, source?: string) {
    const formatted = this.format(message, guildId);
    console.warn(`[WARN] ${formatted}`);
    await this.persist(message, "warn", guildId, source);
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
    await this.persist(errorMessage, "error", guildId, source);
  }
}
