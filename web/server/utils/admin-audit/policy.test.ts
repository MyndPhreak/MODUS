import { describe, expect, it } from 'vitest'
import { requiresReason } from './policy'

describe('admin audit reason policy', () => {
  it.each([
    ['module.updated', { enabled: true }, { enabled: false }],
    ['module.disabled', { enabled: true }, { enabled: false }],
    ['music.updated', { enabled: true }, { enabled: false }],
    ['music.disabled', { enabled: true }, { enabled: false }],
    ['ai.updated', { provider: 'OpenAI', model: 'gpt-5' }, { provider: 'Anthropic', model: 'claude' }],
    ['premium.updated', { premium: false }, { premium: true }],
    ['premium.updated', { premium: true }, { premium: false }],
  ])('requires a reason for %s high-impact transitions', (action, before, after) => {
    expect(requiresReason(action, before, after)).toBe(true)
  })

  it.each([
    ['module.updated', { enabled: false }, { enabled: true }],
    ['music.updated', { enabled: false }, { enabled: true }],
    ['ai.updated', { provider: 'OpenAI', model: 'gpt-4.1' }, { provider: 'OpenAI', model: 'gpt-5' }],
    ['module.updated', { enabled: true }, { enabled: true }],
  ])('allows an optional reason for ordinary %s changes', (action, before, after) => {
    expect(requiresReason(action, before, after)).toBe(false)
  })
})
