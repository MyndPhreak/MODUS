import { runAuditedMutation } from './service'
import type { AuditedMutationInput, AuditResource, AuditState, AuditTransaction } from './types'

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
  /** Boolean field name in both the request body and the audit before/after snapshots. */
  stateKey?: 'enabled' | 'premium'
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
  stateKey: string,
  createHttpError: (statusCode: number, statusMessage: string) => unknown,
): { value: boolean; reason: string | null } {
  const body = raw as Record<string, unknown> | null | undefined
  const value = body?.[stateKey]
  if (typeof value !== 'boolean') {
    throw createHttpError(400, `Body must include { ${stateKey}: boolean }.`)
  }
  const reason = typeof body?.reason === 'string' && (body.reason as string).trim()
    ? (body.reason as string)
    : null
  return { value, reason }
}

export function createEnabledToggleRouteHandler<Event>(
  deps: EnabledToggleRouteDependencies<Event>,
) {
  const createHttpError = deps.createHttpError ?? defaultHttpError
  const mutate = deps.mutate ?? runAuditedMutation
  const stateKey = deps.stateKey ?? 'enabled'

  return async (event: Event): Promise<EnabledToggleResult> => {
    const targetId = deps.getTargetId(event)
    if (!targetId) {
      throw createHttpError(400, 'Missing target id.')
    }

    const repository = deps.getRepository(event)
    if (!repository) {
      throw createHttpError(503, 'Database unavailable (NUXT_DATABASE_URL not set).')
    }

    const body = parseToggleBody(await deps.parseBody(event), stateKey, createHttpError)
    const before = { [stateKey]: await repository.getEnabled() }
    const after = { [stateKey]: body.value }

    let auditEventId: string
    try {
      const result = await mutate({
        event,
        action: deps.action,
        target: { type: deps.resource, id: targetId },
        before,
        after,
        reason: body.reason,
        mutate: (tx) => repository.setEnabled(tx, body.value, body.reason ?? 'manual'),
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

export interface GlobalAiConfig {
  aiProvider?: string
  aiApiKey?: string
  aiModel?: string
  aiBaseUrl?: string
  maxInputTokens?: number
  maxOutputTokens?: number
  rateLimitSeconds?: number
}

export interface AiConfigRepository {
  getConfig(): Promise<GlobalAiConfig | null>
  setConfig(tx: AuditTransaction, config: GlobalAiConfig): Promise<void>
}

export interface AiConfigRouteDependencies<Event> {
  parseBody: (event: Event) => Promise<unknown>
  getRepository: (event: Event) => AiConfigRepository | null
  logError: (error: unknown) => void
  createHttpError?: (statusCode: number, statusMessage: string) => unknown
  mutate?: typeof runAuditedMutation
}

function parseAiConfigBody(
  raw: unknown,
  createHttpError: (statusCode: number, statusMessage: string) => unknown,
): { config: GlobalAiConfig; reason: string | null } {
  const body = raw as Record<string, unknown> | null | undefined
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'Body must be a JSON object with the global AI config.')
  }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason : null
  const positiveInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : undefined
  return {
    config: {
      aiProvider: typeof body.aiProvider === 'string' ? body.aiProvider : undefined,
      aiApiKey: typeof body.aiApiKey === 'string' ? body.aiApiKey : undefined,
      aiModel: typeof body.aiModel === 'string' ? body.aiModel : undefined,
      aiBaseUrl: typeof body.aiBaseUrl === 'string' ? body.aiBaseUrl : undefined,
      maxInputTokens: positiveInt(body.maxInputTokens),
      maxOutputTokens: positiveInt(body.maxOutputTokens),
      rateLimitSeconds: positiveInt(body.rateLimitSeconds),
    },
    reason,
  }
}

/** Maps the wire config shape to the safe audit-state field names redaction.ts expects. */
function toAiAuditState(config: GlobalAiConfig | null, rotated: boolean): AuditState {
  return {
    provider: config?.aiProvider,
    model: config?.aiModel,
    baseUrl: config?.aiBaseUrl,
    maxInputTokens: config?.maxInputTokens,
    maxOutputTokens: config?.maxOutputTokens,
    rateLimitSeconds: config?.rateLimitSeconds,
    credentialPresent: Boolean(config?.aiApiKey),
    credentialRotated: rotated,
  }
}

export function createAiConfigRouteHandler<Event>(
  deps: AiConfigRouteDependencies<Event>,
) {
  const createHttpError = deps.createHttpError ?? defaultHttpError
  const mutate = deps.mutate ?? runAuditedMutation

  return async (event: Event): Promise<EnabledToggleResult> => {
    const repository = deps.getRepository(event)
    if (!repository) {
      throw createHttpError(503, 'Database unavailable (NUXT_DATABASE_URL not set).')
    }

    const { config, reason } = parseAiConfigBody(await deps.parseBody(event), createHttpError)
    const previous = await repository.getConfig()
    const rotated = Boolean(config.aiApiKey) && config.aiApiKey !== previous?.aiApiKey

    let auditEventId: string
    try {
      const result = await mutate({
        event,
        action: 'ai.updated',
        target: { type: 'ai', id: 'global' },
        before: toAiAuditState(previous, false),
        after: toAiAuditState(config, rotated),
        reason,
        mutate: (tx) => repository.setConfig(tx, config),
      } as AuditedMutationInput<unknown>)
      auditEventId = result.auditEventId
    } catch (error) {
      if (isRouteError(error)) throw error
      deps.logError(error)
      throw createHttpError(500, 'Failed to save global AI config.')
    }

    return { success: true, auditEventId }
  }
}
