import { describe, expect, it, vi } from 'vitest'
import { createEnabledToggleRouteHandler } from './admin-mutations'
import type { AuditedMutationInput, AuditedMutationResult } from './types'

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    resource: 'module' as const,
    action: 'module.updated',
    getTargetId: () => 'tickets',
    parseBody: async () => ({ enabled: false, reason: 'Routine rollout' }),
    getRepository: () => ({
      getEnabled: async () => true,
      setEnabled: async () => undefined,
    }),
    logError: () => undefined,
    ...overrides,
  }
}

function fakeMutate(handler: (input: AuditedMutationInput<unknown>) => Promise<AuditedMutationResult<unknown>>) {
  return handler
}

describe('createEnabledToggleRouteHandler', () => {
  it('returns 503 before parsing the body when repositories are unavailable', async () => {
    let bodyParsed = false
    const handler = createEnabledToggleRouteHandler(createDeps({
      getRepository: () => null,
      parseBody: async () => {
        bodyParsed = true
        return { enabled: false }
      },
    }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 503,
      statusMessage: 'Database unavailable (NUXT_DATABASE_URL not set).',
    })
    expect(bodyParsed).toBe(false)
  })

  it('rejects a missing target id before touching the repository', async () => {
    let repositoryChecked = false
    const handler = createEnabledToggleRouteHandler(createDeps({
      getTargetId: () => '',
      getRepository: () => {
        repositoryChecked = true
        return null
      },
    }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 400,
      statusMessage: 'Missing target id.',
    })
    expect(repositoryChecked).toBe(false)
  })

  it('rejects a body missing the enabled flag', async () => {
    const handler = createEnabledToggleRouteHandler(createDeps({
      parseBody: async () => ({}),
    }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 400,
      statusMessage: 'Body must include { enabled: boolean }.',
    })
  })

  it('requires a non-empty reason to disable a module', async () => {
    let mutated = false
    const handler = createEnabledToggleRouteHandler(createDeps({
      parseBody: async () => ({ enabled: false, reason: '   ' }),
      getRepository: () => ({
        getEnabled: async () => true,
        setEnabled: async () => {
          mutated = true
        },
      }),
      mutate: fakeMutate(async (input) => {
        throw Object.assign(new Error('should not run mutate'), {
          statusCode: 400,
          statusMessage: 'A reason is required for this change.',
        })
      }),
    }))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(mutated).toBe(false)
  })

  it('allows enabling a module without a reason', async () => {
    const handler = createEnabledToggleRouteHandler(createDeps({
      action: 'module.updated',
      parseBody: async () => ({ enabled: true }),
      getRepository: () => ({
        getEnabled: async () => false,
        setEnabled: async () => undefined,
      }),
      mutate: fakeMutate(async (input) => {
        expect(input.reason).toBeNull()
        expect(input.before).toEqual({ enabled: false })
        expect(input.after).toEqual({ enabled: true })
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-1' }
      }),
    }))

    await expect(handler({})).resolves.toEqual({ success: true, auditEventId: 'audit-1' })
  })

  it('requires a reason to disable music and forwards it to the mutation', async () => {
    let capturedReason: string | null | undefined
    const handler = createEnabledToggleRouteHandler(createDeps({
      resource: 'music',
      action: 'music.updated',
      getTargetId: () => 'music',
      parseBody: async () => ({ enabled: false, reason: '  Outage rollback  ' }),
      getRepository: () => ({
        getEnabled: async () => true,
        setEnabled: async () => undefined,
      }),
      mutate: fakeMutate(async (input) => {
        capturedReason = input.reason
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-2' }
      }),
    }))

    await expect(handler({})).resolves.toEqual({ success: true, auditEventId: 'audit-2' })
    expect(capturedReason).toBe('  Outage rollback  ')
  })

  it('runs the repository write inside the audited transaction executor', async () => {
    const trace: string[] = []
    const handler = createEnabledToggleRouteHandler(createDeps({
      getRepository: () => ({
        getEnabled: async () => true,
        setEnabled: async (tx: unknown) => {
          trace.push(tx === 'the-tx' ? 'write:tx' : 'write:wrong')
        },
      }),
      mutate: fakeMutate(async (input) => {
        await input.mutate('the-tx' as never)
        trace.push('audited')
        return { result: undefined, auditEventId: 'audit-3' }
      }),
    }))

    await handler({})
    expect(trace).toEqual(['write:tx', 'audited'])
  })

  it('sanitizes repository/mutation failures into a generic 500', async () => {
    const secret = 'connection refused to postgres://user:pw@host/db'
    const logged: unknown[] = []
    const handler = createEnabledToggleRouteHandler(createDeps({
      mutate: fakeMutate(async () => {
        throw new Error(secret)
      }),
      logError: (error: unknown) => logged.push(error),
    }))

    let thrown: unknown
    try {
      await handler({})
    } catch (error) {
      thrown = error
    }

    expect(thrown).toEqual({ statusCode: 500, statusMessage: 'Failed to update module.' })
    expect(JSON.stringify(thrown)).not.toContain(secret)
    expect(logged).toHaveLength(1)
  })

  it('propagates sealed audit rejections (statusCode already set) without rewrapping', async () => {
    const handler = createEnabledToggleRouteHandler(createDeps({
      mutate: fakeMutate(async () => {
        throw Object.assign(new Error('A reason is required for this change.'), {
          statusCode: 400,
          statusMessage: 'A reason is required for this change.',
        })
      }),
    }))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'A reason is required for this change.',
    })
  })

  it('returns a syncWarning instead of failing when post-commit sync throws', async () => {
    const logged: unknown[] = []
    const handler = createEnabledToggleRouteHandler(createDeps({
      mutate: fakeMutate(async (input) => {
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-4' }
      }),
      onCommitted: async () => {
        throw new Error('redis unavailable')
      },
      logError: (error: unknown) => logged.push(error),
    }))

    await expect(handler({})).resolves.toEqual({
      success: true,
      auditEventId: 'audit-4',
      syncWarning: 'The change was saved, but fleet sync may be delayed.',
    })
    expect(logged).toHaveLength(1)
  })
})
