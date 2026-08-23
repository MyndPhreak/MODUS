import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { beforeEach, describe, expect, expectTypeOf, it, vi, type MockInstance } from 'vitest'
import { drizzle } from '../../../../packages/db/node_modules/drizzle-orm/node-postgres'
import * as schema from '../../../../packages/db/src/schema'
import {
  AdminAuditEventRepository,
  type AdminAuditEvent,
  type Database,
  type NewAdminAuditEvent,
} from '@modus/db'
import type { AuditedMutationInput, AuditTransaction } from './types'

const mocks = vi.hoisted(() => ({
  requireBotAdmin: vi.fn(),
  getRepos: vi.fn(),
}))

vi.mock('../session', () => ({ requireBotAdmin: mocks.requireBotAdmin }))
vi.mock('../db', () => ({ getRepos: mocks.getRepos }))

import { runAuditedMutation } from './service'

const request = new IncomingMessage(new Socket())
request.headers['x-request-id'] = ' request-123 '
const event = createEvent(request, new ServerResponse(request))

function auditRow(auditInput: NewAdminAuditEvent): AdminAuditEvent {
  return {
    ...auditInput,
    id: 'audit-1',
    actorDisplay: auditInput.actorDisplay ?? null,
    reason: auditInput.reason ?? null,
    requestId: auditInput.requestId ?? null,
    createdAt: new Date('2026-08-23T12:00:00.000Z'),
    reasonRequired: auditInput.reasonRequired ?? false,
  }
}

function input<TResult>(mutate: (tx: AuditTransaction) => Promise<TResult>) {
  return {
    event,
    action: 'module.updated',
    target: { type: 'module' as const, id: 'music' },
    before: { enabled: false },
    after: { enabled: true },
    reason: '  Routine rollout  ',
    mutate,
    actorId: 'caller-override',
    actorDisplay: 'Caller Override',
    requestId: 'caller-request',
    ip: '198.51.100.2',
  }
}

describe('runAuditedMutation sealed production boundary', () => {
  let db: Database
  let inserted: NewAdminAuditEvent | undefined
  let insertSpy: MockInstance<AdminAuditEventRepository['insert']>

  beforeEach(() => {
    vi.clearAllMocks()
    inserted = undefined
    db = drizzle.mock({ schema })
    vi.spyOn(db, 'transaction').mockImplementation(async (operation) =>
      Reflect.apply(operation, undefined, [Object.create(null)]))
    mocks.requireBotAdmin.mockResolvedValue({
      userId: 'sealed-actor',
      actorDisplay: 'Sealed Operator',
    })
    mocks.getRepos.mockReturnValue({ db })
    insertSpy = vi.spyOn(AdminAuditEventRepository.prototype, 'insert')
      .mockImplementation(async (auditInput) => {
        inserted = auditInput
        return auditRow(auditInput)
      })
  })

  it('exposes only the sealed one-argument production API', () => {
    expectTypeOf(runAuditedMutation).parameters.toEqualTypeOf<[
      AuditedMutationInput<unknown>,
    ]>()
  })

  it('authorizes through requireBotAdmin and persists only its sealed actor', async () => {
    const result = await runAuditedMutation(input(async () => ({ success: true })))

    expect(mocks.requireBotAdmin).toHaveBeenCalledWith(event)
    expect(inserted).toMatchObject({
      actorId: 'sealed-actor',
      actorDisplay: 'Sealed Operator',
      requestId: 'request-123',
      reason: 'Routine rollout',
    })
    expect(JSON.stringify(inserted)).not.toContain('caller-override')
    expect(JSON.stringify(inserted)).not.toContain('198.51.100.2')
    expect(result).toEqual({ result: { success: true }, auditEventId: 'audit-1' })
  })

  it('runs mutation before audit insertion in the real Drizzle transaction callback', async () => {
    const trace: string[] = []
    insertSpy.mockImplementation(async (auditInput) => {
      trace.push('audit')
      return auditRow(auditInput)
    })

    await runAuditedMutation(input(async () => {
      trace.push('mutation')
      return 'done'
    }))
    expect(trace).toEqual(['mutation', 'audit'])
  })

  it('rejects required empty reasons before opening persistence transaction', async () => {
    const transactionSpy = vi.spyOn(db, 'transaction')
    let mutated = false

    await expect(runAuditedMutation({
      ...input(async () => {
        mutated = true
        return 'done'
      }),
      before: { enabled: true },
      after: { enabled: false },
      reason: '   ',
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(transactionSpy).not.toHaveBeenCalled()
    expect(mutated).toBe(false)
  })

  it('propagates audit insertion failure from the Drizzle transaction callback', async () => {
    insertSpy.mockRejectedValue(new Error('audit insert failed'))
    await expect(runAuditedMutation(input(async () => 'done')))
      .rejects.toThrow('audit insert failed')
  })
})

describe('audit service import boundary', () => {
  it.each(['./service-internal', './service.test-harness'])(
    'does not expose the actor-injectable %s module',
    async (specifier) => {
      await expect(import(/* @vite-ignore */ specifier)).rejects.toThrow()
    },
  )
})
