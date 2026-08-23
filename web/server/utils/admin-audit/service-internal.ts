import type { NewAdminAuditEvent } from '@modus/db'
import { requiresReason } from './policy'
import { sanitizeAuditState } from './redaction'
import {
  AUDIT_REASON_MAX_LENGTH,
  type AuditActor,
  type AuditedMutationCommand,
  type AuditedMutationResult,
  type AuditPersistence,
} from './types'

export interface AuditedMutationBoundary<TTransaction> extends AuditPersistence<TTransaction> {
  actor: AuditActor
  requestId: string | null
}

function auditError(statusCode: number, statusMessage: string): Error & { statusCode: number; statusMessage: string } {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage })
}

function normalizedReason(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) return null
  const trimmed = reason.trim()
  if (trimmed.length > AUDIT_REASON_MAX_LENGTH) {
    throw auditError(400, `Reason must be ${AUDIT_REASON_MAX_LENGTH} characters or fewer.`)
  }
  return trimmed || null
}

/** Internal orchestration primitive. Production callers use runAuditedMutation. */
export async function executeAuditedMutation<TResult, TTransaction>(
  input: AuditedMutationCommand<TResult, TTransaction>,
  boundary: AuditedMutationBoundary<TTransaction>,
): Promise<AuditedMutationResult<TResult>> {
  const before = sanitizeAuditState(input.target.type, input.before)
  const after = sanitizeAuditState(input.target.type, input.after)
  const reasonRequired = requiresReason(`${input.target.type}.${input.action}`, before, after)
  const reason = normalizedReason(input.reason)

  if (!input.action.trim() || !input.target.id.trim()) {
    throw auditError(400, 'Audit action and target ID are required.')
  }
  if (reasonRequired && !reason) {
    throw auditError(400, 'A reason is required for this change.')
  }

  return boundary.transaction(async (tx) => {
    const result = await input.mutate(tx)
    const auditInput: NewAdminAuditEvent = {
      actorId: boundary.actor.userId,
      actorDisplay: boundary.actor.actorDisplay ?? null,
      action: input.action,
      targetType: input.target.type,
      targetId: input.target.id,
      before,
      after,
      reason,
      reasonRequired,
      requestId: boundary.requestId,
    }
    const audit = await boundary.insertAudit(tx, auditInput)
    return { result, auditEventId: audit.id }
  })
}
