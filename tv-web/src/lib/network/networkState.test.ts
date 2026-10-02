import { describe, expect, it } from 'vitest'
import { initialNetworkState, reduceNetworkState } from './networkState'

describe('reduceNetworkState (feature 042, FR-001/FR-002)', () => {
  it('começa de navigator.onLine e segue os eventos online/offline', () => {
    let state = initialNetworkState(true)
    expect(state).toEqual({ online: true, phase: 'online' })
    state = reduceNetworkState(state, { type: 'offline' })
    expect(state).toEqual({ online: false, phase: 'offline' })
    state = reduceNetworkState(state, { type: 'online' })
    expect(state).toEqual({ online: true, phase: 'online' })
  })

  it('o resultado real da verificação prevalece sobre navigator.onLine', () => {
    let state = reduceNetworkState(initialNetworkState(true), { type: 'verify-start' })
    expect(state.phase).toBe('verifying')
    state = reduceNetworkState(state, { type: 'verify-done', ok: false })
    expect(state).toEqual({ online: false, phase: 'offline' })
    state = reduceNetworkState(state, { type: 'verify-done', ok: true })
    expect(state).toEqual({ online: true, phase: 'online' })
  })

  it('oculto vira suspenso e voltar vira retomado; eventos de rede enquanto suspenso não derrubam a fase', () => {
    let state = reduceNetworkState(initialNetworkState(true), { type: 'hidden' })
    expect(state.phase).toBe('suspended')
    state = reduceNetworkState(state, { type: 'offline' })
    expect(state).toEqual({ online: false, phase: 'suspended' })
    state = reduceNetworkState(state, { type: 'visible' })
    expect(state).toEqual({ online: false, phase: 'resumed' })
  })

  it('visível sem ter estado oculto não muda nada', () => {
    const state = initialNetworkState(true)
    expect(reduceNetworkState(state, { type: 'visible' })).toBe(state)
  })
})
