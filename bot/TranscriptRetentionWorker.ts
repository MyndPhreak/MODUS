/**
 * Purges expired ticket transcripts. Cadence: every 6 hours.
 *
 * `expires_at` is frozen at ticket close time, so this worker ignores
 * the current per-guild retention setting — it only acts on rows whose
 * stored expires_at has elapsed.
 *
 * Gated by LeaderElection in bot/index.ts so only one shard runs it.
 */
import type { DatabaseService } from "./DatabaseService";
import type { Logger } from "./Logger";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SWEEP_BATCH_LIMIT = 500;

export class TranscriptRetentionWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private db: DatabaseService,
    private logger: Logger,
  ) {}

  start(): void {
    // First run offset by 0–30 min so sharded restarts don't all sweep
    // at once.
    const jitter = Math.floor(Math.random() * 30 * 60 * 1000);
    setTimeout(() => {
      this.runSweep().catch((err) => {
        this.logger.error(
          "Initial transcript retention sweep failed",
          undefined,
          err,
          "transcripts",
        );
      });
      this.timer = setInterval(() => {
        this.runSweep().catch((err) => {
          this.logger.error(
            "Transcript retention sweep failed",
            undefined,
            err,
            "transcripts",
          );
        });
      }, SIX_HOURS_MS);
    }, jitter);

    this.logger.info(
      "Transcript retention worker started (6h interval)",
      undefined,
      "transcripts",
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSweep(): Promise<void> {
    const now = new Date();
    const expired = await this.db.transcripts.getExpired(
      now,
      SWEEP_BATCH_LIMIT,
    );

    if (expired.length === 0) {
      this.logger.info(
        "Transcript retention sweep: nothing expired",
        undefined,
        "transcripts",
      );
      return;
    }

    let deleted = 0;
    for (const { id } of expired) {
      try {
        await this.db.deleteTicketTranscript(id);
        deleted++;
      } catch (err) {
        this.logger.warn(
          `Failed to delete transcript ${id}`,
          undefined,
          "transcripts",
        );
      }
    }

    this.logger.info(
      `Transcript retention sweep: purged ${deleted}/${expired.length}`,
      undefined,
      "transcripts",
    );
  }
}
