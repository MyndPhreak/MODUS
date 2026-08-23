export interface AuditRequestEvent {
  node: {
    req: {
      headers: {
        'x-request-id'?: string | string[]
      }
    }
  }
}

export function extractAuditRequestId(event: H3Event): string | null
export function extractAuditRequestId(event: AuditRequestEvent): string | null
export function extractAuditRequestId(event: H3Event | AuditRequestEvent): string | null {
  const raw = event.node.req.headers['x-request-id']
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  return value ? value.slice(0, 200) : null
}
import type { H3Event } from 'h3'
