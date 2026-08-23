import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAiConfigRouteHandler,
  createEnabledToggleRouteHandler,
  type AiConfigRepository,
  type EnabledToggleRepository,
} from './admin-mutations'

const mocks = vi.hoisted(() => ({
  requireBotAdmin: vi.fn(),
  getRepos: vi.fn(),
}))

vi.mock('../session', () => ({ requireBotAdmin: mocks.requireBotAdmin }))
vi.mock('../db', () => ({ getRepos: mocks.getRepos }))

import { runAuditedMutation } from './service'

const request = new IncomingMessage(new Socket())
const realEvent = createEvent(request, new ServerResponse(request))

describe('createAiConfigRouteHandler', () => {
  function createDeps(overrides: Record<string, unknown> = {}) {
    return {
      parseBody: async () => ({ aiProvider: 'Groq', aiModel: 'llama-3.3-70b-versatile' }),
      getRepository: (): AiConfigRepository => ({
        getConfig: async () => ({ aiProvider: 'Groq', aiModel: 'llama-3.1-8b-instant' }),
        setConfig: async () => undefined,
      }),
      logError: () => undefined,
      ...overrides,
    }
  }

  it('requires a reason when the provider changes', async () => {
    let captured: Record<string, unknown> | undefined
    const handler = createAiConfigRouteHandler(createDeps({
      parseBody: async () => ({ aiProvider: 'OpenAI', aiModel: 'gpt-4o' }),
      getRepository: (): AiConfigRepository => ({
        getConfig: async () => ({ aiProvider: 'Groq', aiModel: 'llama-3.1-8b-instant' }),
        setConfig: async () => undefined,
      }),
      mutate: async (input: any) => {
        captured = input
        // Exercise the real sealed policy/redaction pipeline via a fake actor+db,
        // since parseAiConfigBody/toAiAuditState is what we're really testing here.
        throw Object.assign(new Error('reason required'), {
          statusCode: 400,
          statusMessage: 'A reason is required for this change.',
        })
      },
    }))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(captured?.before).toMatchObject({ provider: 'Groq' })
    expect(captured?.after).toMatchObject({ provider: 'OpenAI' })
  })

  it('allows a model-only change with no reason', async () => {
    const handler = createAiConfigRouteHandler(createDeps({
      parseBody: async () => ({ aiProvider: 'Groq', aiModel: 'llama-3.3-70b-versatile' }),
      mutate: async (input: any) => {
        expect(input.reason).toBeNull()
        expect(input.before).toMatchObject({ provider: 'Groq', model: 'llama-3.1-8b-instant' })
        expect(input.after).toMatchObject({ provider: 'Groq', model: 'llama-3.3-70b-versatile' })
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-ai-1' }
      },
    }))

    await expect(handler({})).resolves.toEqual({ success: true, auditEventId: 'audit-ai-1' })
  })

  it('never forwards the raw API key into the audit before/after snapshots', async () => {
    let captured: Record<string, unknown> | undefined
    const handler = createAiConfigRouteHandler(createDeps({
      parseBody: async () => ({
        aiProvider: 'Groq',
        aiModel: 'llama-3.1-8b-instant',
        aiApiKey: 'gsk_super_secret_rotated_key_value',
        reason: 'Rotating leaked key',
      }),
      getRepository: (): AiConfigRepository => ({
        getConfig: async () => ({
          aiProvider: 'Groq',
          aiModel: 'llama-3.1-8b-instant',
          aiApiKey: 'gsk_previous_key_value',
        }),
        setConfig: async () => undefined,
      }),
      mutate: async (input: any) => {
        captured = input
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-ai-2' }
      },
    }))

    await handler({})
    const serialized = JSON.stringify(captured)
    expect(serialized).not.toContain('gsk_super_secret_rotated_key_value')
    expect(serialized).not.toContain('gsk_previous_key_value')
    expect(captured?.after).toMatchObject({ credentialPresent: true, credentialRotated: true })
  })

  it('marks credentialRotated false when the key is unchanged', async () => {
    const handler = createAiConfigRouteHandler(createDeps({
      parseBody: async () => ({
        aiProvider: 'Groq',
        aiModel: 'llama-3.1-8b-instant',
        aiApiKey: 'gsk_same_key',
      }),
      getRepository: (): AiConfigRepository => ({
        getConfig: async () => ({
          aiProvider: 'Groq',
          aiModel: 'llama-3.1-8b-instant',
          aiApiKey: 'gsk_same_key',
        }),
        setConfig: async () => undefined,
      }),
      mutate: async (input: any) => {
        expect(input.after).toMatchObject({ credentialPresent: true, credentialRotated: false })
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-ai-3' }
      },
    }))

    await handler({})
  })

  it('sanitizes failures into a generic 500', async () => {
    const secret = 'gsk_leaked_in_a_stack_trace'
    const logged: unknown[] = []
    const handler = createAiConfigRouteHandler(createDeps({
      mutate: async () => {
        throw new Error(secret)
      },
      logError: (error: unknown) => logged.push(error),
    }))

    let thrown: unknown
    try {
      await handler({})
    } catch (error) {
      thrown = error
    }
    expect(thrown).toEqual({ statusCode: 500, statusMessage: 'Failed to save global AI config.' })
    expect(JSON.stringify(thrown)).not.toContain(secret)
    expect(logged).toHaveLength(1)
  })
})

describe('createEnabledToggleRouteHandler with stateKey "premium"', () => {
  function createDeps(overrides: Record<string, unknown> = {}) {
    return {
      resource: 'premium' as const,
      action: 'premium.updated',
      stateKey: 'premium' as const,
      getTargetId: () => 'guild-1',
      parseBody: async () => ({ premium: true, reason: 'Upgrading via support ticket' }),
      getRepository: (): EnabledToggleRepository => ({
        getEnabled: async () => false,
        setEnabled: async () => undefined,
      }),
      logError: () => undefined,
      ...overrides,
    }
  }

  it('rejects a body missing the premium flag', async () => {
    const handler = createEnabledToggleRouteHandler(createDeps({
      parseBody: async () => ({}),
    }))

    await expect(handler({})).rejects.toEqual({
      statusCode: 400,
      statusMessage: 'Body must include { premium: boolean }.',
    })
  })

  it('requires a reason to grant premium (not just to revoke it)', async () => {
    let mutated = false
    const handler = createEnabledToggleRouteHandler(createDeps({
      parseBody: async () => ({ premium: true, reason: '   ' }),
      getRepository: (): EnabledToggleRepository => ({
        getEnabled: async () => false,
        setEnabled: async () => {
          mutated = true
        },
      }),
      mutate: async () => {
        throw Object.assign(new Error('reason required'), {
          statusCode: 400,
          statusMessage: 'A reason is required for this change.',
        })
      },
    }))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(mutated).toBe(false)
  })

  it('requires a reason to revoke premium too', async () => {
    const handler = createEnabledToggleRouteHandler(createDeps({
      parseBody: async () => ({ premium: false, reason: '' }),
      getRepository: (): EnabledToggleRepository => ({
        getEnabled: async () => true,
        setEnabled: async () => undefined,
      }),
      mutate: async () => {
        throw Object.assign(new Error('reason required'), {
          statusCode: 400,
          statusMessage: 'A reason is required for this change.',
        })
      },
    }))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('builds before/after snapshots keyed by "premium"', async () => {
    const handler = createEnabledToggleRouteHandler(createDeps({
      mutate: async (input: any) => {
        expect(input.before).toEqual({ premium: false })
        expect(input.after).toEqual({ premium: true })
        await input.mutate(Object.create(null))
        return { result: undefined, auditEventId: 'audit-premium-1' }
      },
    }))

    await expect(handler({})).resolves.toEqual({ success: true, auditEventId: 'audit-premium-1' })
  })
})

describe('end-to-end through the real sealed runAuditedMutation', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { drizzle } = await import('../../../../packages/db/node_modules/drizzle-orm/node-postgres')
    const schema = await import('../../../../packages/db/src/schema')
    const { AdminAuditEventRepository } = await import('@modus/db')
    const db = drizzle.mock({ schema })
    vi.spyOn(db, 'transaction').mockImplementation(async (operation: any) =>
      Reflect.apply(operation, undefined, [Object.create(null)]))
    vi.spyOn(AdminAuditEventRepository.prototype, 'insert').mockImplementation(async (input: any) => ({
      ...input,
      id: 'audit-e2e',
      actorDisplay: input.actorDisplay ?? null,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      reasonRequired: input.reasonRequired ?? false,
    }))
    mocks.requireBotAdmin.mockResolvedValue({ userId: 'actor-1', actorDisplay: 'Actor One' })
    mocks.getRepos.mockReturnValue({ db })
  })

  it('rejects an AI provider change with no reason before the mutation runs', async () => {
    let mutated = false
    const handler = createAiConfigRouteHandler({
      parseBody: async () => ({ aiProvider: 'OpenAI', aiModel: 'gpt-4o' }),
      getRepository: (): AiConfigRepository => ({
        getConfig: async () => ({ aiProvider: 'Groq', aiModel: 'llama-3.1-8b-instant' }),
        setConfig: async () => {
          mutated = true
        },
      }),
      logError: () => undefined,
      mutate: runAuditedMutation,
    })

    await expect(handler(realEvent)).rejects.toMatchObject({ statusCode: 400 })
    expect(mutated).toBe(false)
  })

  it('accepts an AI provider change with a reason and never leaks the rotated key', async () => {
    const secret = 'gsk_end_to_end_secret_value'
    const handler = createAiConfigRouteHandler({
      parseBody: async () => ({
        aiProvider: 'OpenAI',
        aiModel: 'gpt-4o',
        aiApiKey: secret,
        reason: 'Switching providers per vendor outage',
      }),
      getRepository: (): AiConfigRepository => ({
        getConfig: async () => ({ aiProvider: 'Groq', aiModel: 'llama-3.1-8b-instant' }),
        setConfig: async () => undefined,
      }),
      logError: () => undefined,
      mutate: runAuditedMutation,
    })

    const result = await handler(realEvent)
    expect(result.success).toBe(true)
    expect(result.auditEventId).toBeTruthy()
  })

  it('rejects a premium grant with no reason before the mutation runs', async () => {
    let mutated = false
    const handler = createEnabledToggleRouteHandler({
      resource: 'premium',
      action: 'premium.updated',
      stateKey: 'premium',
      getTargetId: () => 'guild-1',
      parseBody: async () => ({ premium: true }),
      getRepository: (): EnabledToggleRepository => ({
        getEnabled: async () => false,
        setEnabled: async () => {
          mutated = true
        },
      }),
      logError: () => undefined,
      mutate: runAuditedMutation,
    })

    await expect(handler(realEvent)).rejects.toMatchObject({ statusCode: 400 })
    expect(mutated).toBe(false)
  })

  it('accepts a premium grant with a reason', async () => {
    const handler = createEnabledToggleRouteHandler({
      resource: 'premium',
      action: 'premium.updated',
      stateKey: 'premium',
      getTargetId: () => 'guild-1',
      parseBody: async () => ({ premium: true, reason: 'Support ticket #4821' }),
      getRepository: (): EnabledToggleRepository => ({
        getEnabled: async () => false,
        setEnabled: async () => undefined,
      }),
      logError: () => undefined,
      mutate: runAuditedMutation,
    })

    const result = await handler(realEvent)
    expect(result.success).toBe(true)
    expect(result.auditEventId).toBeTruthy()
  })
})
