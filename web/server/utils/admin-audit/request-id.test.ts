import { describe, expect, it } from 'vitest'
import { extractAuditRequestId, type AuditRequestEvent } from './request-id'

function event(value: string | string[] | undefined): AuditRequestEvent {
  return { node: { req: { headers: { 'x-request-id': value } } } }
}

describe('audit request ID extraction', () => {
  it('reads and trims a scalar H3 request header', () => {
    expect(extractAuditRequestId(event('  request-123  '))).toBe('request-123')
  })

  it('uses the first value from an H3 array header', () => {
    expect(extractAuditRequestId(event([' first ', 'second']))).toBe('first')
  })

  it.each([undefined, '', '   ', []])('returns null for blank or absent values', (value) => {
    expect(extractAuditRequestId(event(value))).toBeNull()
  })

  it('caps request IDs at 200 characters after trimming', () => {
    expect(extractAuditRequestId(event(`  ${'x'.repeat(250)}  `))).toBe('x'.repeat(200))
  })
})
