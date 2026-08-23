import type { AuditResource, AuditState } from './types'

const SUPPORTED_RESOURCES = new Set<AuditResource>(['module', 'music', 'ai', 'premium'])
const SENSITIVE_KEY = /(api.?key|token|secret|password|credential|access.?key|connection|string|authorization|cookie|(^|_)ip($|_))/i
const SENSITIVE_URL_PARAMETER = /[?&](api.?key|token|secret|password|credential|access.?key)=/i

function safeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (SENSITIVE_URL_PARAMETER.test(value)) return '[REDACTED]'

  try {
    const url = new URL(value)
    if (url.username || url.password) return '[REDACTED]'
  } catch {
    // Ordinary labels (provider/model names) are not URLs.
  }

  return value
}

function stripSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((entry) => stripSecrets(entry, seen))
  if (!value || typeof value !== 'object') return safeString(value) ?? value
  if (seen.has(value)) return '[REDACTED]'
  seen.add(value)

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) && key !== 'credentialPresent' && key !== 'credentialRotated') continue
    output[key] = stripSecrets(child, seen)
  }
  return output
}

function credentialPresent(state: AuditState): boolean {
  if (typeof state.credentialPresent === 'boolean') return state.credentialPresent

  return Object.entries(state).some(([key, value]) => {
    if (!SENSITIVE_KEY.test(key)) return false
    if (typeof value === 'string') return value.length > 0
    return value !== null && value !== undefined && value !== false
  })
}

export function sanitizeAuditState(
  resource: AuditResource,
  state: AuditState,
): AuditState {
  if (!SUPPORTED_RESOURCES.has(resource)) {
    throw new TypeError(`Unsupported audit resource: ${String(resource)}`)
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Audit state must be an object')
  }

  let allowed: AuditState
  switch (resource) {
    case 'module':
    case 'music':
      allowed = typeof state.enabled === 'boolean' ? { enabled: state.enabled } : {}
      break
    case 'premium':
      allowed = typeof state.premium === 'boolean' ? { premium: state.premium } : {}
      break
    case 'ai': {
      allowed = {}
      const provider = safeString(state.provider)
      const model = safeString(state.model)
      const endpointClassification = safeString(state.endpointClassification)
      if (provider !== undefined) allowed.provider = provider
      if (model !== undefined) allowed.model = model
      if (endpointClassification !== undefined) {
        allowed.endpointClassification = endpointClassification
      }
      allowed.credentialPresent = credentialPresent(state)
      if (typeof state.credentialRotated === 'boolean') {
        allowed.credentialRotated = state.credentialRotated
      }
      break
    }
  }

  return stripSecrets(allowed) as AuditState
}
