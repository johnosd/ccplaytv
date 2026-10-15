import { describe, expect, it } from 'vitest'
import { nextReconnect, RECONNECT_DELAYS_MS } from './reconnectPolicy'

describe('nextReconnect (feature 042, D-003)', () => {
  it('tentativas 0, 1 e 2 esperam 2 s, 5 s e 10 s', () => {
    expect(nextReconnect({ attempt: 0, online: true, autoReconnect: true })).toEqual({ action: 'retry', delayMs: 2_000 })
    expect(nextReconnect({ attempt: 1, online: true, autoReconnect: true })).toEqual({ action: 'retry', delayMs: 5_000 })
    expect(nextReconnect({ attempt: 2, online: true, autoReconnect: true })).toEqual({ action: 'retry', delayMs: 10_000 })
  })

  it('a 4ª nunca vem sozinha', () => {
    expect(nextReconnect({ attempt: RECONNECT_DELAYS_MS.length, online: true, autoReconnect: true })).toEqual({ action: 'give-up' })
    expect(nextReconnect({ attempt: 99, online: true, autoReconnect: true })).toEqual({ action: 'give-up' })
  })

  it('sem rede ou sem permissão do diagnóstico desiste', () => {
    expect(nextReconnect({ attempt: 0, online: false, autoReconnect: true })).toEqual({ action: 'give-up' })
    expect(nextReconnect({ attempt: 0, online: true, autoReconnect: false })).toEqual({ action: 'give-up' })
  })
})
