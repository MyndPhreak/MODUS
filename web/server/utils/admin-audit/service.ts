import { AdminAuditEventRepository } from '@modus/db'
import { getRepos } from '../db'
import { requireBotAdmin } from '../session'
import { requiresReason } from './policy'
import { sanitizeAuditState } from './redaction'
import {
  AUDIT_REASON_MAX_LENGTH,
  type AuditedMutationInput,
  type AuditedMutationResult,
  type AuditServiceDependencies,
} from './types'

function normalizedReason(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) return null
  const trimmed = reason.trim()
  if (trimmed.length > AUDIT_REASON_MAX_LENGTH) {
    throw auditError(400, `Reason must be ${AUDIT_REASON_MAX_LENGTH} characters or fewer.`)
  }
  return trimmed || null
}

function boundedRequestId(event: Parameters<AuditServiceDependencies['requestId']>[0]): string | null {
  const raw = event.node?.req?.headers?.['x-request-id']
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  return value ? value.slice(0, 200) : null
}

function auditError(statusCode: number, statusMessage: string): Error & { statusCode: number; statusMessage: string } {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage })
}

function productionDependencies(): AuditServiceDependencies {
  return {
    authorize: requireBotAdmin,
    requestId: boundedRequestId,
    transaction: (operation) => {
      const repos = getRepos()
      if (!repos) {
        throw auditError(503, 'Database unavailable (NUXT_DATABASE_URL not set).')
      }
      return repos.db.transaction(operation)
    },
    insertAudit: (tx, input) => new AdminAuditEventRepository(tx).insert(input),
  }
}

function normalizeRequestId(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 200) : null
}

export async function runAuditedMutation<TResult>(
  input: AuditedMutationInput<TResult>,
  dependencies: AuditServiceDependencies = productionDependencies(),
): Promise<AuditedMutationResult<TResult>> {
  const actor = await dependencies.authorize(input.event)
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

  return dependencies.transaction(async (tx) => {
    const result = await input.mutate(tx)
    const audit = await dependencies.insertAudit(tx, {
      actorId: actor.userId,
      actorDisplay: actor.actorDisplay ?? null,
      action: input.action,
      targetType: input.target.type,
      targetId: input.target.id,
      before,
      after,
      reason,
      reasonRequired,
      requestId: normalizeRequestId(dependencies.requestId(input.event)),
    })

    return { result, auditEventId: audit.id }
  })
}
