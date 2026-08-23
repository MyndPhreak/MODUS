import { runAuditedMutation } from './service'
import type { AuditedMutationInput, AuditResource, AuditTransaction } from './types'

interface RouteError {
  statusCode: number
  statusMessage: string
}

export interface EnabledToggleRepository {
  getEnabled(): Promise<boolean>
  setEnabled(tx: AuditTransaction, enabled: boolean, reason: string | null): Promise<void>
}

export interface EnabledToggleResult {
  success: true
  auditEventId: string
  syncWarning?: string
}

export interface EnabledToggleRouteDependencies<Event> {
  resource: AuditResource
  action: string
  getTargetId: (event: Event) => string
  parseBody: (event: Event) => Promise<unknown>
  getRepository: (event: Event) => EnabledToggleRepository | null
  logError: (error: unknown) => void
  /** Runs after the audited mutation commits — e.g. publishing a Redis fleet-invalidation event. */
  onCommitted?: () => Promise<void>
  createHttpError?: (statusCode: number, statusMessage: string) => unknown
  mutate?: typeof runAuditedMutation
}

function defaultHttpError(statusCode: number, statusMessage: string): RouteError {
  return { statusCode, statusMessage }
}

function isRouteError(error: unknown): error is RouteError {
  return typeof error === 'object' && error !== null && 'statusCode' in error
}

function parseToggleBody(
  raw: unknown,
  createHttpError: (statusCode: number, statusMessage: string) => unknown,
): { enabled: boolean; reason: string | null } {
  const body = raw as Record<string, unknown> | null | undefined
  if (typeof body?.enabled !== 'boolean') {
    throw createHttpError(400, 'Body must include { enabled: boolean }.')
  }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason : null
  return { enabled: body.enabled, reason }
}

export function createEnabledToggleRouteHandler<Event>(
  deps: EnabledToggleRouteDependencies<Event>,
) {
  const createHttpError = deps.createHttpError ?? defaultHttpError
  const mutate = deps.mutate ?? runAuditedMutation

  return async (event: Event): Promise<EnabledToggleResult> => {
    const targetId = deps.getTargetId(event)
    if (!targetId) {
      throw createHttpError(400, 'Missing target id.')
    }

    const repository = deps.getRepository(event)
    if (!repository) {
      throw createHttpError(503, 'Database unavailable (NUXT_DATABASE_URL not set).')
    }

    const body = parseToggleBody(await deps.parseBody(event), createHttpError)
    const before = { enabled: await repository.getEnabled() }
    const after = { enabled: body.enabled }

    let auditEventId: string
    try {
      const result = await mutate({
        event,
        action: deps.action,
        target: { type: deps.resource, id: targetId },
        before,
        after,
        reason: body.reason,
        mutate: (tx) => repository.setEnabled(tx, body.enabled, body.reason ?? 'manual'),
      } as AuditedMutationInput<unknown>)
      auditEventId = result.auditEventId
    } catch (error) {
      if (isRouteError(error)) throw error
      deps.logError(error)
      throw createHttpError(500, `Failed to update ${deps.resource}.`)
    }

    if (deps.onCommitted) {
      try {
        await deps.onCommitted()
      } catch (error) {
        deps.logError(error)
        return {
          success: true,
          auditEventId,
          syncWarning: 'The change was saved, but fleet sync may be delayed.',
        }
      }
    }

    return { success: true, auditEventId }
  }
}
