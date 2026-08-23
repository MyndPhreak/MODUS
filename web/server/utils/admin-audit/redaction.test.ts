import { describe, expect, it } from 'vitest'
import { sanitizeAuditState } from './redaction'

const forbiddenValues = [
  'api-key-value',
  'token-value',
  'secret-value',
  'password-value',
  'access-key-value',
  'connection-value',
  'url-user',
  'url-password',
]

function expectNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value)
  for (const secret of forbiddenValues) expect(serialized).not.toContain(secret)
}

describe('admin audit state sanitization', () => {
  it('uses resource allowlists before recursively stripping nested and case-variant secrets', () => {
    const hostile = {
      enabled: false,
      ignored: 'must-not-survive',
      nested: {
        apiKey: 'api-key-value',
        TOKEN: 'token-value',
        child: [{ Secret: 'secret-value' }, { PASSWORD: 'password-value' }],
      },
      accessKeyId: 'access-key-value',
      connectionString: 'connection-value',
      endpoint: 'https://url-user:url-password@example.com/path?token=token-value',
    }

    const result = sanitizeAuditState('module', hostile)

    expect(result).toEqual({ enabled: false })
    expectNoSecrets(result)
  })

  it('emits only AI provider, model, safe endpoint classification, and credential state', () => {
    const result = sanitizeAuditState('ai', {
      provider: 'OpenAI Compatible',
      model: 'model-1',
      apiKey: 'api-key-value',
      baseUrl: 'https://url-user:url-password@private.example/v1?token=token-value',
      endpointClassification: 'secret-value',
      credentialRotated: true,
      nested: [{ token: 'token-value' }],
    })

    expect(result).toEqual({
      provider: 'OpenAI Compatible',
      model: 'model-1',
      endpointClassification: 'custom-private',
      credentialPresent: true,
      credentialRotated: true,
    })
    expectNoSecrets(result)
  })

  it.each([
    ['provider', '203.0.113.8'],
    ['provider', '2001:db8::1'],
    ['provider', 'https://10.0.0.4/v1'],
    ['provider', 'sk-secret-value'],
  ])('rejects unsafe AI %s content: %s', (field, value) => {
    expect(() => sanitizeAuditState('ai', {
      provider: 'OpenAI',
      model: 'gpt-5',
      [field]: value,
    })).toThrow(`Unsafe AI ${field}`)
  })

  const embeddedSensitiveValues = [
    '203.0.113.8',
    '[2001:db8::1]',
    'model-10.0.0.4-release',
    'model-2001:db8::1-release',
    'https://localhost:11434/v1',
    'prefix-https://user:password@private.example/v1',
    'token=secret-value',
    'line-one\nsecret-value',
    'model/path/ghp_abcdefghijklmnopqrstuvwxyz123456',
    'model#github_pat_11AA0abcdefghijklmnopqrstuvwxyz',
    'AKIAIOSFODNN7EXAMPLE',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
    'Bearer abcdefghijklmnopqrstuvwxyz123456',
    'Basic dXNlcjpwYXNzd29yZA==',
    'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
    'xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx',
    'npm_abcdefghijklmnopqrstuvwxyz1234567890',
    'aZ9kLm2Pq7Rx4Tv8Wy1Bc6Df0Gh3Jk5Mn9Qr2St7',
  ]

  it.each(embeddedSensitiveValues)('redacts unsafe model metadata without rejecting mutation: %s', (payload) => {
    expect(sanitizeAuditState('ai', {
      provider: 'OpenAI',
      model: payload,
    })).toMatchObject({
      provider: 'OpenAI',
      model: '[redacted-model]',
      endpointClassification: 'provider-default',
    })
  })

  it.each(embeddedSensitiveValues)('rejects payloads placed in the closed provider field: %s', (payload) => {
    expect(() => sanitizeAuditState('ai', {
      provider: payload,
      model: 'gpt-5',
    })).toThrow('Unsafe AI provider')
  })

  it.each(embeddedSensitiveValues)('ignores payloads placed in caller endpoint classification: %s', (payload) => {
    expect(sanitizeAuditState('ai', {
      provider: 'OpenAI',
      model: 'gpt-5',
      endpointClassification: payload,
    }).endpointClassification).toBe('provider-default')
  })

  it.each([
    'gpt-5',
    'llama-3.3-70b-versatile',
    'anthropic/claude-3.5-sonnet',
    'openai:gpt-4.1-mini',
    'Qwen2.5-Coder-32B-Instruct',
  ])('preserves normal model identifier %s', (model) => {
    expect(sanitizeAuditState('ai', { provider: 'OpenAI', model }).model).toBe(model)
  })

  it.each([
    ['https://203.0.113.8/v1', 'custom-public'],
    ['https://10.0.0.4/v1', 'custom-private'],
    ['http://[2001:db8::1]/v1', 'custom-private'],
    ['http://[::1]/v1', 'local'],
    ['http://localhost:11434/v1', 'local'],
    ['https://public.example/v1/key/secret-value', 'custom-public'],
    ['https://public.example/v1#token=secret-value', 'custom-public'],
    ['https://public.example/v1?apiKey=secret-value', 'custom-public'],
  ])('derives a closed endpoint classification without retaining %s', (baseUrl, classification) => {
    const result = sanitizeAuditState('ai', {
      provider: 'OpenAI Compatible',
      model: 'model-1',
      baseUrl,
      endpointClassification: 'secret-value',
    })

    expect(result.endpointClassification).toBe(classification)
    expect(JSON.stringify(result)).not.toContain(baseUrl)
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it('accepts every closed AI field while dropping caller-provided classification', () => {
    expect(sanitizeAuditState('ai', {
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      credentialPresent: true,
      credentialRotated: false,
      endpointClassification: 'secret-value',
    })).toEqual({
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      endpointClassification: 'provider-default',
      credentialPresent: true,
      credentialRotated: false,
    })
  })

  it('sanitizes nested arrays and credential-bearing URLs in any allowed future value', () => {
    const result = sanitizeAuditState('music', {
      enabled: true,
      reasonMetadata: [{ Token: 'token-value' }],
      callbackUrl: 'https://url-user:url-password@example.com/?secret=secret-value',
    })

    expect(result).toEqual({ enabled: true })
    expectNoSecrets(result)
  })

  it('rejects unsupported resources instead of persisting arbitrary objects', () => {
    expect(() => sanitizeAuditState('server-manager' as never, {
      token: 'token-value',
    })).toThrow('Unsupported audit resource')
  })
})
