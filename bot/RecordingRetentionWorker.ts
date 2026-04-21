/**
 * Nightly sweep that deletes recordings older than RECORDING_RETENTION_DAYS.
 *
 * Controls cost by ensuring stale files don't accumulate indefinitely. Works
 * the same whether recordings live in R2 or Appwrite Storage — delegates to
 * AppwriteService.deleteRecording which routes each file to its backend.
 *
 * Set RECORDING_RETENTION_DAYS=0 (or unset) to disable.
 */
import type { AppwriteService } from "./AppwriteService";
import type { Logger } from "./Logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Run the sweep once per day. Randomized start offset smooths load across shards. */
const SWEEP_INTERVAL_MS = ONE_DAY_MS;
/** Max deletions per sweep — caps blast radius if the cutoff is misconfigured. */
const SWEEP_BATCH_LIMIT = 500;

export class RecordingRetentionWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private appwrite: AppwriteService,
    private logger: Logger,
    private retentionDays: number,
  ) {}

  start(): void {
    if (this.retentionDays <= 0) {
      this.logger.info(
        "Recording retention disabled (RECORDING_RETENTION_DAYS=0)",
        undefined,
        "retention",
      );
      return;
    }

    // Stagger the first run by 0–60 min so sharded deployments don't all hit
    // Appwrite at once on restart.
    const jitter = Math.floor(Math.random() * 60 * 60 * 1000);
    setTimeout(() => {
      this.runSweep().catch((err) => {
        this.logger.error("Initial retention sweep failed", undefined, err, "retention");
      });
      this.timer = setInterval(() => {
        this.runSweep().catch((err) => {
          this.logger.error("Retention sweep failed", undefined, err, "retention");
        });
      }, SWEEP_INTERVAL_MS);
    }, jitter);

    this.logger.info(
      `Recording retention enabled: ${this.retentionDays} day(s)`,
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

    const recordings = await this.appwrite.getRecordingsOlderThan(
      cutoffIso,
      SWEEP_BATCH_LIMIT,
    );

    if (recordings.length === 0) {
      this.logger.info(
        `Retention sweep: nothing older than ${cutoffIso}`,
        undefined,
        "retention",
      );
      return;
    }

    this.logger.info(
      `Retention sweep: deleting ${recordings.length} recording(s) older than ${cutoffIso}`,
      undefined,
      "retention",
    );

    let deleted = 0;
    let failed = 0;
    for (const rec of recordings) {
      try {
        await this.appwrite.deleteRecording(rec.$id);
        deleted++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Retention: failed to delete recording ${rec.$id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          rec.guild_id,
          "retention",
        );
      }
    }

    this.logger.info(
      `Retention sweep complete: ${deleted} deleted, ${failed} failed`,
      undefined,
      "retention",
    );
  }
}
