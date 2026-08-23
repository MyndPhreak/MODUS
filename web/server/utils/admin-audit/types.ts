import type { H3Event } from 'h3'
import type { Database, NewAdminAuditEvent } from '@modus/db'

export const AUDIT_REASON_MAX_LENGTH = 1000

export type AuditResource = 'module' | 'music' | 'ai' | 'premium'
export type AuditState = Record<string, unknown>
export type AuditTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface AuditActor {
  userId: string
  actorDisplay?: string | null
}

export interface AuditedMutationInput<TResult> {
  event: H3Event
  action: string
  target: {
    type: AuditResource
    id: string
  }
  before: AuditState
  after: AuditState
  reason?: string | null
  mutate: (tx: AuditTransaction) => Promise<TResult>
}

export type AuditedMutationCommand<TResult, TTransaction> = Omit<
  AuditedMutationInput<TResult>,
  'event' | 'mutate'
> & {
  mutate: (tx: TTransaction) => Promise<TResult>
}

export interface AuditedMutationResult<TResult> {
  result: TResult
  auditEventId: string
}

export interface AuditPersistence<TTransaction> {
  transaction: <T>(operation: (tx: TTransaction) => Promise<T>) => Promise<T>
  insertAudit: (
    tx: TTransaction,
    input: NewAdminAuditEvent,
  ) => Promise<{ id: string }>
}
