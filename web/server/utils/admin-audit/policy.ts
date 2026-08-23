import type { AuditState } from './types'

function isAction(action: string, resource: string): boolean {
  return action === resource || action.startsWith(`${resource}.`) || action.includes(`.${resource}.`)
}

export function requiresReason(
  action: string,
  before: AuditState,
  after: AuditState,
): boolean {
  if (action === 'module.disabled' || action === 'music.disabled') return true

  if (isAction(action, 'module')) {
    return before.enabled === true && after.enabled === false
  }

  if (isAction(action, 'music')) {
    return before.enabled === true && after.enabled === false
  }

  if (isAction(action, 'ai')) {
    return typeof before.provider === 'string'
      && typeof after.provider === 'string'
      && before.provider !== after.provider
  }

  if (isAction(action, 'premium')) {
    return typeof before.premium === 'boolean'
      && typeof after.premium === 'boolean'
      && before.premium !== after.premium
  }

  return false
}
