import { describe, expect, it } from 'vitest'
import { runAuditedMutation } from './service'
import type { AuditServiceDependencies } from './types'

const event = { headers: { 'x-request-id': 'request-123', 'x-forwarded-for': '203.0.113.8' } } as never

function createHarness(options: { failAudit?: boolean } = {}) {
  const committed: string[] = []
  const trace: string[] = []
  let inserted: Record<string, unknown> | undefined

  const dependencies: AuditServiceDependencies = {
    authorize: async () => ({ userId: 'sealed-actor', actorDisplay: 'Sealed Operator' }),
    requestId: () => 'request-123',
    transaction: async (operation) => {
      const staged: string[] = []
      try {
        const result = await operation({ staged } as never)
        committed.push(...staged)
        return result
      } catch (error) {
        throw error
      }
    },
    insertAudit: async (tx, input) => {
      trace.push('audit')
      if (options.failAudit) throw new Error('audit insert failed')
      ;(tx as unknown as { staged: string[] }).staged.push('audit')
      inserted = input as Record<string, unknown>
      return { id: 'audit-1' }
    },
  }

  return { dependencies, committed, trace, getInserted: () => inserted }
}

function input<TResult>(mutate: (tx: unknown) => Promise<TResult>) {
  return {
    event,
    action: 'module.updated',
    target: { type: 'module' as const, id: 'music' },
    before: { enabled: false },
    after: { enabled: true },
    reason: '  Routine rollout  ',
    mutate,
    // Deliberate hostile fields: the service API must never trust these.
    actorId: 'caller-override',
    actorDisplay: 'Caller Override',
    requestId: 'caller-request',
    ip: '198.51.100.2',
  }
}

describe('runAuditedMutation', () => {
  it('derives actor identity from authorization and retains request ID without IP data', async () => {
    const harness = createHarness()

    await runAuditedMutation(input(async (tx) => {
      ;(tx as { staged: string[] }).staged.push('mutation')
      return 'done'
    }), harness.dependencies)

    expect(harness.getInserted()).toMatchObject({
      actorId: 'sealed-actor',
      actorDisplay: 'Sealed Operator',
      requestId: 'request-123',
      reason: 'Routine rollout',
    })
    expect(JSON.stringify(harness.getInserted())).not.toContain('203.0.113.8')
    expect(JSON.stringify(harness.getInserted())).not.toContain('198.51.100.2')
    expect(JSON.stringify(harness.getInserted())).not.toContain('caller-override')
  })

  it('rejects a missing required reason before opening a transaction or mutating', async () => {
    const trace: string[] = []
    const harness = createHarness()
    harness.dependencies.transaction = async () => {
      trace.push('transaction')
      throw new Error('must not run')
    }

    await expect(runAuditedMutation({
      ...input(async () => {
        trace.push('mutation')
        return 'done'
      }),
      before: { enabled: true },
      after: { enabled: false },
      reason: '   ',
    }, harness.dependencies)).rejects.toMatchObject({ statusCode: 400 })

    expect(trace).toEqual([])
  })

  it('runs mutation before audit insertion in the same transaction and returns both results', async () => {
    const harness = createHarness()

    const result = await runAuditedMutation(input(async (tx) => {
      harness.trace.push('mutation')
      ;(tx as { staged: string[] }).staged.push('mutation')
      return { success: true }
    }), harness.dependencies)

    expect(harness.trace).toEqual(['mutation', 'audit'])
    expect(harness.committed).toEqual(['mutation', 'audit'])
    expect(result).toEqual({ result: { success: true }, auditEventId: 'audit-1' })
  })

  it('rolls back the resource mutation when audit insertion fails', async () => {
    const harness = createHarness({ failAudit: true })

    await expect(runAuditedMutation(input(async (tx) => {
      harness.trace.push('mutation')
      ;(tx as { staged: string[] }).staged.push('mutation')
      return 'done'
    }), harness.dependencies)).rejects.toThrow('audit insert failed')

    expect(harness.trace).toEqual(['mutation', 'audit'])
    expect(harness.committed).toEqual([])
  })

  it('rejects overlong reasons before mutation', async () => {
    const harness = createHarness()
    let mutated = false

    await expect(runAuditedMutation({
      ...input(async () => {
        mutated = true
        return 'done'
      }),
      reason: 'x'.repeat(1001),
    }, harness.dependencies)).rejects.toMatchObject({ statusCode: 400 })

    expect(mutated).toBe(false)
  })

  it('rejects unsupported resources before mutation', async () => {
    const harness = createHarness()
    let mutated = false

    await expect(runAuditedMutation({
      ...input(async () => {
        mutated = true
        return 'done'
      }),
      target: { type: 'server-manager' as never, id: 'guild-1' },
    }, harness.dependencies)).rejects.toThrow('Unsupported audit resource')

    expect(mutated).toBe(false)
  })
})
