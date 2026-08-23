import { describe, expect, it } from 'vitest'
import { drizzle } from '../../../../packages/db/node_modules/drizzle-orm/node-postgres'
import {
  buildAdminAuditSearchQuery,
  finalizeAdminAuditSearchPage,
  type AdminAuditSearchInput,
} from '../../../../packages/db/src/repositories/admin-audit-events'
import type { AdminAuditEvent } from '../../../../packages/db/src/schema'

const at = (value: string) => new Date(value)

function input(overrides: Partial<AdminAuditSearchInput> = {}): AdminAuditSearchInput {
  return {
    actorId: null,
    action: null,
    targetType: null,
    targetId: null,
    from: null,
    to: null,
    limit: 50,
    cursor: null,
    ...overrides,
  }
}

function row(id: string, createdAt: string): AdminAuditEvent {
  return {
    id,
    actorId: 'actor-1',
    actorDisplay: 'Operator',
    action: 'module.disabled',
    targetType: 'module',
    targetId: 'music',
    before: { enabled: true },
    after: { enabled: false },
    reason: 'Maintenance',
    reasonRequired: true,
    requestId: 'request-1',
    createdAt: at(createdAt),
  }
}

describe('admin audit repository query', () => {
  it('builds all filters with a strict descending cursor and limit plus one', () => {
    const cursorTime = at('2026-08-23T12:00:00.000Z')
    const query = buildAdminAuditSearchQuery(drizzle.mock(), input({
      actorId: 'actor-1',
      action: 'module.disabled',
      targetType: 'module',
      targetId: 'music',
      from: at('2026-08-22T00:00:00.000Z'),
      to: at('2026-08-23T13:00:00.000Z'),
      cursor: { createdAt: cursorTime, id: '11111111-1111-4111-8111-111111111111' },
    })).toSQL()

    expect(query.sql).toBe(
      'select "id", "actor_id", "actor_display", "action", "target_type", "target_id", '
      + '"before", "after", "reason", "reason_required", "request_id", "created_at" '
      + 'from "admin_audit_events" where ("admin_audit_events"."actor_id" = $1 '
      + 'and "admin_audit_events"."action" = $2 and "admin_audit_events"."target_type" = $3 '
      + 'and "admin_audit_events"."target_id" = $4 and "admin_audit_events"."created_at" >= $5 '
      + 'and "admin_audit_events"."created_at" <= $6 and ("admin_audit_events"."created_at" < $7 '
      + 'or ("admin_audit_events"."created_at" = $8 and "admin_audit_events"."id" < $9))) '
      + 'order by "admin_audit_events"."created_at" desc, "admin_audit_events"."id" desc limit $10',
    )
    expect(query.params).toEqual([
      'actor-1',
      'module.disabled',
      'module',
      'music',
      '2026-08-22T00:00:00.000Z',
      '2026-08-23T13:00:00.000Z',
      '2026-08-23T12:00:00.000Z',
      '2026-08-23T12:00:00.000Z',
      '11111111-1111-4111-8111-111111111111',
      51,
    ])
  })

  it('rejects values outside the repository search contract', () => {
    const db = drizzle.mock()

    expect(() => buildAdminAuditSearchQuery(db, input({ limit: 0 }))).toThrow('limit')
    expect(() => buildAdminAuditSearchQuery(db, input({ actorId: '' }))).toThrow('actorId')
    expect(() => buildAdminAuditSearchQuery(db, input({ from: new Date('invalid') }))).toThrow('from')
    expect(() => buildAdminAuditSearchQuery(db, input({
      cursor: { createdAt: at('2026-08-23T12:00:00.000Z'), id: '' },
    }))).toThrow('cursor')
    expect(() => buildAdminAuditSearchQuery(db, input({
      cursor: { createdAt: at('2026-08-23T12:00:00.000Z'), id: 'not-a-uuid' },
    }))).toThrow('cursor')
  })

  it('returns a continuation cursor only when an extra row proves another page', () => {
    const rows = [
      row('newest', '2026-08-23T12:00:03.000Z'),
      row('middle', '2026-08-23T12:00:02.000Z'),
      row('extra', '2026-08-23T12:00:01.000Z'),
    ]

    expect(finalizeAdminAuditSearchPage(rows, 2)).toEqual({
      items: rows.slice(0, 2),
      nextCursorRow: {
        createdAt: at('2026-08-23T12:00:02.000Z'),
        id: 'middle',
      },
    })
    expect(finalizeAdminAuditSearchPage(rows.slice(0, 2), 2).nextCursorRow).toBeNull()
  })
})
