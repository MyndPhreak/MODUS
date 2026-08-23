import { describe, expect, expectTypeOf, it } from 'vitest'
import { runAuditedMutation } from './service'
import { createAuditedMutationTestHarness } from './service.test-harness'
import type { AuditedMutationInput } from './types'

interface TestTransaction {
  staged: string[]
}

const event = { node: { req: { headers: {} } } }

function createHarness(options: { failAudit?: boolean } = {}) {
  const committed: string[] = []
  const trace: string[] = []
  let inserted: Record<string, unknown> | undefined

  const run = createAuditedMutationTestHarness<TestTransaction>({
    actor: { userId: 'sealed-actor', actorDisplay: 'Sealed Operator' },
    requestId: 'request-123',
    transaction: async (operation) => {
      const tx: TestTransaction = { staged: [] }
      const result = await operation(tx)
      committed.push(...tx.staged)
      return result
    },
    insertAudit: async (tx, auditInput) => {
      trace.push('audit')
      if (options.failAudit) throw new Error('audit insert failed')
      tx.staged.push('audit')
      inserted = auditInput
      return { id: 'audit-1' }
    },
  })

  return { run, committed, trace, getInserted: () => inserted }
}

function input<TResult>(mutate: (tx: TestTransaction) => Promise<TResult>) {
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

describe('runAuditedMutation production contract', () => {
  it('exposes only the sealed one-argument production API', () => {
    expectTypeOf(runAuditedMutation).parameters.toEqualTypeOf<[
      AuditedMutationInput<unknown>,
    ]>()
  })
})

describe('audited mutation internal test harness', () => {
  it('uses only the sealed actor and request context supplied by its boundary', async () => {
    const harness = createHarness()
    await harness.run(input(async (tx) => {
      tx.staged.push('mutation')
      return 'done'
    }))

    expect(harness.getInserted()).toMatchObject({
      actorId: 'sealed-actor',
      actorDisplay: 'Sealed Operator',
      requestId: 'request-123',
      reason: 'Routine rollout',
    })
    expect(JSON.stringify(harness.getInserted())).not.toContain('198.51.100.2')
    expect(JSON.stringify(harness.getInserted())).not.toContain('caller-override')
  })

  it('rejects a missing required reason before opening a transaction or mutating', async () => {
    const trace: string[] = []
    const run = createAuditedMutationTestHarness<TestTransaction>({
      actor: { userId: 'actor-1' },
      requestId: null,
      transaction: async () => {
        trace.push('transaction')
        throw new Error('must not run')
      },
      insertAudit: async () => ({ id: 'must-not-run' }),
    })

    await expect(run({
      ...input(async () => {
        trace.push('mutation')
        return 'done'
      }),
      before: { enabled: true },
      after: { enabled: false },
      reason: '   ',
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(trace).toEqual([])
  })

  it('orders mutation before audit insertion in one transaction callback', async () => {
    const harness = createHarness()
    const result = await harness.run(input(async (tx) => {
      harness.trace.push('mutation')
      tx.staged.push('mutation')
      return { success: true }
    }))

    expect(harness.trace).toEqual(['mutation', 'audit'])
    expect(harness.committed).toEqual(['mutation', 'audit'])
    expect(result).toEqual({ result: { success: true }, auditEventId: 'audit-1' })
  })

  it('propagates audit failure from the shared transaction callback', async () => {
    const harness = createHarness({ failAudit: true })
    await expect(harness.run(input(async (tx) => {
      harness.trace.push('mutation')
      tx.staged.push('mutation')
      return 'done'
    }))).rejects.toThrow('audit insert failed')

    expect(harness.trace).toEqual(['mutation', 'audit'])
    expect(harness.committed).toEqual([])
  })

  it('rejects overlong reasons before mutation', async () => {
    const harness = createHarness()
    let mutated = false
    await expect(harness.run({
      ...input(async () => {
        mutated = true
        return 'done'
      }),
      reason: 'x'.repeat(1001),
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mutated).toBe(false)
  })

  it('rejects unsupported resources before mutation', async () => {
    const harness = createHarness()
    let mutated = false
    await expect(harness.run({
      ...input(async () => {
        mutated = true
        return 'done'
      }),
      target: { type: 'server-manager' as never, id: 'guild-1' },
    })).rejects.toThrow('Unsupported audit resource')
    expect(mutated).toBe(false)
  })
})
