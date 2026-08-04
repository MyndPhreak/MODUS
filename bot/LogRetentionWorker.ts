/**
 * Nightly sweep that deletes log rows older than LOG_RETENTION_DAYS.
 *
 * The `logs` table is written to continuously by every Logger.info/warn/error
 * call across all shards, so left unbounded it grows without limit. Deletes
 * happen in capped batches (SWEEP_BATCH_LIMIT) via LogRepository.deleteOlderThan
 * so a single sweep never holds a DELETE transaction open over an unbounded
 * row count.
 *
 * Set LOG_RETENTION_DAYS=0 (or unset) to disable.
 */
import type { DatabaseService } from "./DatabaseService";
import type { Logger } from "./Logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Run the sweep once per day. Randomized start offset smooths load across shards. */
const SWEEP_INTERVAL_MS = ONE_DAY_MS;
/** Rows deleted per DELETE statement. Higher than recording/transcript workers — log volume is much higher. */
const SWEEP_BATCH_LIMIT = 5000;
/** Safety cap on batches per sweep, in case the cutoff is misconfigured or a sweep was skipped for a long time. */
const MAX_BATCHES_PER_SWEEP = 200;

export class LogRetentionWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private db: DatabaseService,
    private logger: Logger,
    private retentionDays: number,
  ) {}

  start(): void {
    if (this.retentionDays <= 0) {
      this.logger.info(
        "Log retention disabled (LOG_RETENTION_DAYS=0)",
        undefined,
        "retention",
      );
      return;
    }

    // Stagger the first run by 0–60 min so sharded deployments don't all hit
    // the backend at once on restart.
    const jitter = Math.floor(Math.random() * 60 * 60 * 1000);
    setTimeout(() => {
      this.runSweep().catch((err) => {
        this.logger.error(
          "Initial log retention sweep failed",
          undefined,
          err,
          "retention",
        );
      });
      this.timer = setInterval(() => {
        this.runSweep().catch((err) => {
          this.logger.error(
            "Log retention sweep failed",
            undefined,
            err,
            "retention",
          );
        });
      }, SWEEP_INTERVAL_MS);
    }, jitter);

    this.logger.info(
      `Log retention enabled: ${this.retentionDays} day(s)`,
      undefined,
      "retention",
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSweep(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * ONE_DAY_MS);
    const cutoffIso = cutoff.toISOString();

    let totalDeleted = 0;
    let iterations = 0;

    while (iterations < MAX_BATCHES_PER_SWEEP) {
      iterations++;
      const deleted = await this.db.logs.deleteOlderThan(
        cutoff,
        SWEEP_BATCH_LIMIT,
      );
      totalDeleted += deleted;
      if (deleted < SWEEP_BATCH_LIMIT) break;
    }

    if (totalDeleted === 0) {
      this.logger.info(
        `Log retention sweep: nothing older than ${cutoffIso}`,
        undefined,
        "retention",
      );
      return;
    }

    this.logger.info(
      `Log retention sweep: deleted ${totalDeleted} log row(s) older than ${cutoffIso} across ${iterations} batch(es)`,
      undefined,
      "retention",
    );

    if (iterations >= MAX_BATCHES_PER_SWEEP) {
      this.logger.warn(
        `Log retention sweep hit the ${MAX_BATCHES_PER_SWEEP}-batch safety cap — more rows may remain past the cutoff; next scheduled sweep will continue.`,
        undefined,
        "retention",
      );
    }
  }
}
