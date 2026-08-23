import type { AuditResource, AuditState } from './types'

const SUPPORTED_RESOURCES = new Set<AuditResource>(['module', 'music', 'ai', 'premium'])
const SENSITIVE_KEY = /(api.?key|token|secret|password|credential|access.?key|connection|string|authorization|cookie|(^|_)ip($|_))/i
const SENSITIVE_URL_PARAMETER = /[?&](api.?key|token|secret|password|credential|access.?key)=/i
const AI_PROVIDERS = new Set([
  'Groq',
  'OpenAI',
  'Google Gemini',
  'Anthropic Claude',
  'OpenAI Compatible',
])
const SECRET_SHAPED = /(?:^|[^a-z])(sk-|bearer\s|api.?key|token\s*[=:]|secret|password|credential|access.?key|connection.?string)/i
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^\[?[0-9a-f]*:[0-9a-f:]+\]?$/i
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

export type AiEndpointClassification = 'provider-default' | 'custom-public' | 'custom-private' | 'local'

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

function safeAiLabel(field: 'provider' | 'model', value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new TypeError(`Unsafe AI ${field}`)
  }
  if (CONTROL_CHARACTER.test(value) || SECRET_SHAPED.test(value) || IPV4.test(value) || IPV6.test(value)) {
    throw new TypeError(`Unsafe AI ${field}`)
  }
  try {
    new URL(value)
    throw new TypeError(`Unsafe AI ${field}`)
  } catch (error) {
    if (error instanceof TypeError && error.message === `Unsafe AI ${field}`) throw error
  }
  if (field === 'provider' && !AI_PROVIDERS.has(value)) {
    throw new TypeError('Unsafe AI provider')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/ +()-]*$/.test(value)) {
    throw new TypeError(`Unsafe AI ${field}`)
  }
  return value
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127)
}

export function classifyAiEndpoint(value: unknown): AiEndpointClassification {
  if (typeof value !== 'string' || value.trim() === '') return 'provider-default'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Unsafe AI baseUrl')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('Unsafe AI baseUrl')

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1' || hostname === '127.0.0.1') {
    return 'local'
  }
  if (isPrivateIpv4(hostname) || IPV6.test(hostname) || hostname.endsWith('.local') || hostname.includes('private')) {
    return 'custom-private'
  }
  return 'custom-public'
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
      const provider = safeAiLabel('provider', state.provider)
      const model = safeAiLabel('model', state.model)
      if (provider !== undefined) allowed.provider = provider
      if (model !== undefined) allowed.model = model
      allowed.endpointClassification = classifyAiEndpoint(state.baseUrl)
      allowed.credentialPresent = credentialPresent(state)
      if (typeof state.credentialRotated === 'boolean') {
        allowed.credentialRotated = state.credentialRotated
      }
      break
    }
  }

  return stripSecrets(allowed) as AuditState
}
