/**
 * Sweeps for giveaways whose endsAt has passed and draws winners for each.
 * Runs on whichever shard holds the "giveaway-draw" leader lease (see
 * bot/index.ts) — without Redis it falls back to shard 0, same pattern as
 * RecordingRetentionWorker.
 */
import type { Client } from "discord.js";
import type { DatabaseService } from "./DatabaseService";
import type { Logger } from "./Logger";
import { drawAndAnnounce } from "./modules/giveaways/lib/drawAndAnnounce";

const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_BATCH_LIMIT = 25;

export class GiveawayDrawWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private client: Client,
    private db: DatabaseService,
    private logger: Logger,
  ) {}

  start(): void {
    this.runSweep().catch((err) => {
      this.logger.error("Initial giveaway sweep failed", undefined, err, "giveaways");
    });
    this.timer = setInterval(() => {
      this.runSweep().catch((err) => {
        this.logger.error("Giveaway sweep failed", undefined, err, "giveaways");
      });
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSweep(): Promise<void> {
    // Guard against overlapping runs if a sweep (many giveaways, slow
    // Discord edits) takes longer than the 30s interval.
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.db.giveaways.listExpiredActive(new Date(), SWEEP_BATCH_LIMIT);
      for (const giveaway of expired) {
        const result = await drawAndAnnounce(this.client, this.db, this.logger, giveaway.id);
        if ("error" in result) {
          this.logger.warn(
            `Giveaway sweep: ${giveaway.id} — ${result.error}`,
            giveaway.guildId,
            "giveaways",
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
