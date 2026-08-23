import { describe, expect, it } from 'vitest'
import { sealedSessionIdentity } from '../session'

describe('sealed bot-admin actor display', () => {
  it('prefers the sealed session global name', () => {
    expect(sealedSessionIdentity({
      id: 'actor-1', username: 'operator', discriminator: '0', avatar: null, globalName: 'Display Name',
    })).toEqual({ userId: 'actor-1', actorDisplay: 'Display Name' })
  })

  it('falls back to the sealed session username', () => {
    expect(sealedSessionIdentity({
      id: 'actor-1', username: 'operator', discriminator: '0', avatar: null, globalName: null,
    })).toEqual({ userId: 'actor-1', actorDisplay: 'operator' })
  })
})
