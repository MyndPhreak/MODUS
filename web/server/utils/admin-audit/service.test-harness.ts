import { executeAuditedMutation, type AuditedMutationBoundary } from './service-internal'
import type { AuditedMutationCommand } from './types'

/** Test-only typed harness. Production endpoints must import runAuditedMutation. */
export function createAuditedMutationTestHarness<TTransaction>(
  boundary: AuditedMutationBoundary<TTransaction>,
) {
  return <TResult>(input: AuditedMutationCommand<TResult, TTransaction>) =>
    executeAuditedMutation(input, boundary)
}
