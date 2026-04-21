/**
 * AIUsageLogRepository — append-only token/cost tracking.
 *
 * Write path is fire-and-forget on the bot hot path; AppwriteService wrapped
 * it in a try/catch so ingestion failures never break the command handler.
 * Same contract here: callers who want that must call this inside a try.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { aiUsageLog, type AIUsageLogEntry } from "../schema";

export type AIUsageLogDoc = AIUsageLogEntry & {
  $id: string;
  guildId: string;
  userId: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  key_source: string | null;
  timestamp: Date;
};

function toDoc(row: AIUsageLogEntry): AIUsageLogDoc {
  return {
    ...row,
    $id: row.id,
    guildId: row.guildId,
    userId: row.userId,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    total_tokens: row.totalTokens,
    estimated_cost: row.estimatedCost,
    key_source: row.keySource,
  };
}

export class AIUsageLogRepository {
  constructor(private db: Database) {}

  async log(data: {
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
    await this.db.insert(aiUsageLog).values({
      guildId: data.guildId,
      userId: data.userId,
      provider: data.provider,
      model: data.model,
      inputTokens: data.input_tokens ?? null,
      outputTokens: data.output_tokens ?? null,
      totalTokens: data.total_tokens ?? null,
      estimatedCost: data.estimated_cost ?? null,
      action: data.action ?? "chat",
      keySource: data.key_source,
      timestamp: new Date(),
    });
  }

  async listByGuild(guildId: string, limit = 50): Promise<AIUsageLogDoc[]> {
    const rows = await this.db
      .select()
      .from(aiUsageLog)
      .where(eq(aiUsageLog.guildId, guildId))
      .orderBy(desc(aiUsageLog.timestamp))
      .limit(limit);
    return rows.map(toDoc);
  }

  async upsertMigrated(input: {
    id: string;
    guildId: string;
    userId: string;
    provider: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    estimated_cost: number | null;
    action: string;
    key_source: string | null;
    timestamp: string | Date;
  }): Promise<void> {
    await this.db
      .insert(aiUsageLog)
      .values({
        id: input.id,
        guildId: input.guildId,
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        inputTokens: input.input_tokens,
        outputTokens: input.output_tokens,
        totalTokens: input.total_tokens,
        estimatedCost: input.estimated_cost,
        action: input.action,
        keySource: input.key_source,
        timestamp:
          input.timestamp instanceof Date
            ? input.timestamp
            : new Date(input.timestamp),
      })
      .onConflictDoNothing({ target: aiUsageLog.id });
  }
}
