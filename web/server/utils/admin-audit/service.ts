import { AdminAuditEventRepository } from '@modus/db'
import { getRepos } from '../db'
import { requireBotAdmin } from '../session'
import { extractAuditRequestId } from './request-id'
import { executeAuditedMutation } from './service-internal'
import type { AuditedMutationInput, AuditedMutationResult } from './types'

function databaseUnavailable(): Error & { statusCode: number; statusMessage: string } {
  const statusMessage = 'Database unavailable (NUXT_DATABASE_URL not set).'
  return Object.assign(new Error(statusMessage), { statusCode: 503, statusMessage })
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

  return executeAuditedMutation(input, {
    actor,
    requestId: extractAuditRequestId(input.event),
    transaction: (operation) => repos.db.transaction(operation),
    insertAudit: (tx, auditInput) => new AdminAuditEventRepository(tx).insert(auditInput),
  })
}
