import { AdminAuditEventRepository, type NewAdminAuditEvent } from '@modus/db'
import { getRepos } from '../db'
import { requireBotAdmin } from '../session'
import { extractAuditRequestId } from './request-id'
import { requiresReason } from './policy'
import { sanitizeAuditState } from './redaction'
import {
  AUDIT_REASON_MAX_LENGTH,
  type AuditedMutationInput,
  type AuditedMutationResult,
} from './types'

function databaseUnavailable(): Error & { statusCode: number; statusMessage: string } {
  const statusMessage = 'Database unavailable (NUXT_DATABASE_URL not set).'
  return Object.assign(new Error(statusMessage), { statusCode: 503, statusMessage })
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

/**
 * Production audited mutation boundary. Authorization is intentionally sealed:
 * endpoints can provide only the mutation input and cannot replace auth or persistence.
 */
export async function runAuditedMutation<TResult>(
  input: AuditedMutationInput<TResult>,
): Promise<AuditedMutationResult<TResult>> {
  const actor = await requireBotAdmin(input.event)
  const repos = getRepos()
  if (!repos) throw databaseUnavailable()

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

  return repos.db.transaction(async (tx) => {
    const result = await input.mutate(tx)
    const auditInput: NewAdminAuditEvent = {
      actorId: actor.userId,
      actorDisplay: actor.actorDisplay,
      action: input.action,
      targetType: input.target.type,
      targetId: input.target.id,
      before,
      after,
      reason,
      reasonRequired,
      requestId: extractAuditRequestId(input.event),
    }
    const audit = await new AdminAuditEventRepository(tx).insert(auditInput)
    return { result, auditEventId: audit.id }
  })
}
