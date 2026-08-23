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
      endpointClassification: 'custom',
      credentialRotated: true,
      nested: [{ token: 'token-value' }],
    })

    expect(result).toEqual({
      provider: 'OpenAI Compatible',
      model: 'model-1',
      endpointClassification: 'custom',
      credentialPresent: true,
      credentialRotated: true,
    })
    expectNoSecrets(result)
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
