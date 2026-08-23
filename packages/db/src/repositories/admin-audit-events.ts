import { and, desc, eq, gte, lt, lte, or, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import { requireReturningRow } from "../client";
import {
  adminAuditEvents,
  type AdminAuditEvent,
  type NewAdminAuditEvent,
} from "../schema";

export type AdminAuditExecutor = Pick<Database, "insert" | "select">;
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Assert<T extends true> = T;
type TransactionExecutorContract = Assert<
  DatabaseTransaction extends AdminAuditExecutor ? true : false
>;

export interface AdminAuditSearchInput {
  actorId: string | null;
  action: string | null;
  targetType: string | null;
  targetId: string | null;
  from: Date | null;
  to: Date | null;
  limit: number;
  cursor: { createdAt: Date; id: string } | null;
}

export interface AdminAuditSearchPage {
  items: AdminAuditEvent[];
  nextCursorRow: { createdAt: Date; id: string } | null;
}

function assertSearchInput(input: AdminAuditSearchInput): void {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new RangeError("limit must be an integer between 1 and 100");
  }

  for (const key of ["actorId", "action", "targetType", "targetId"] as const) {
    const value = input[key];
    if (value !== null && value.length === 0) {
      throw new TypeError(`${key} must be non-empty when provided`);
    }
  }

  for (const key of ["from", "to"] as const) {
    const value = input[key];
    if (value !== null && !Number.isFinite(value.getTime())) {
      throw new TypeError(`${key} must be a valid date`);
    }
  }

  if (input.cursor && (
    !Number.isFinite(input.cursor.createdAt.getTime()) || input.cursor.id.length === 0
  )) {
    throw new TypeError("cursor must contain a valid date and non-empty id");
  }
}

export function buildAdminAuditSearchQuery(
  db: Pick<Database, "select">,
  input: AdminAuditSearchInput,
) {
  assertSearchInput(input);
  const conditions: SQL[] = [];

  if (input.actorId) conditions.push(eq(adminAuditEvents.actorId, input.actorId));
  if (input.action) conditions.push(eq(adminAuditEvents.action, input.action));
  if (input.targetType) conditions.push(eq(adminAuditEvents.targetType, input.targetType));
  if (input.targetId) conditions.push(eq(adminAuditEvents.targetId, input.targetId));
  if (input.from) conditions.push(gte(adminAuditEvents.createdAt, input.from));
  if (input.to) conditions.push(lte(adminAuditEvents.createdAt, input.to));
  if (input.cursor) {
    conditions.push(or(
      lt(adminAuditEvents.createdAt, input.cursor.createdAt),
      and(
        eq(adminAuditEvents.createdAt, input.cursor.createdAt),
        lt(adminAuditEvents.id, input.cursor.id),
      ),
    )!);
  }

  return db
    .select()
    .from(adminAuditEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id))
    .limit(input.limit + 1);
}

export function finalizeAdminAuditSearchPage(
  rows: AdminAuditEvent[],
  limit: number,
): AdminAuditSearchPage {
  const hasNextPage = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = hasNextPage ? items.at(-1) : undefined;

  return {
    items,
    nextCursorRow: last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export class AdminAuditEventRepository {
  constructor(private db: AdminAuditExecutor) {}

  async insert(input: NewAdminAuditEvent): Promise<AdminAuditEvent> {
    const [row] = await this.db
      .insert(adminAuditEvents)
      .values(input)
      .returning();

    return requireReturningRow(row, "Admin audit event insert");
  }

  async searchPage(input: AdminAuditSearchInput): Promise<AdminAuditSearchPage> {
    const rows = await buildAdminAuditSearchQuery(this.db, input);
    return finalizeAdminAuditSearchPage(rows, input.limit);
  }
}
