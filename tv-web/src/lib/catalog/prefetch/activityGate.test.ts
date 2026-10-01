import { describe, expect, it, vi } from 'vitest'
import { createActivityGate } from './activityGate'

describe('activityGate (feature 038)', () => {
  it('duas camadas de reprodução: só libera quando as duas fecham; soltar duas vezes não desconta', () => {
    const gate = createActivityGate()
    const player = gate.acquirePlayback()
    const trailer = gate.acquirePlayback()
    player()
    player()
    expect(gate.blockReason(0, 2000)).toBe('playback')
    trailer()
    expect(gate.blockReason(0, 2000)).toBeUndefined()
  })

  it('tecla bloqueia até o fim da janela e informa quando ela acaba', () => {
    const gate = createActivityGate()
    expect(gate.keyIdleAt(2000)).toBeUndefined()
    gate.noteKey(1000)
    expect(gate.blockReason(2999, 2000)).toBe('key')
    expect(gate.blockReason(3000, 2000)).toBeUndefined()
    expect(gate.keyIdleAt(2000)).toBe(3000)
  })

  it('avisa só quando player/visibilidade/rede mudam de fato', () => {
    const gate = createActivityGate()
    const listener = vi.fn()
    gate.subscribe(listener)
    gate.setHidden(false) // já era
    gate.setOnline(true) // já era
    gate.noteKey(1) // tecla não avisa
    expect(listener).not.toHaveBeenCalled()
    gate.setOnline(false)
    expect(gate.blockReason(10_000, 2000)).toBe('offline')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
