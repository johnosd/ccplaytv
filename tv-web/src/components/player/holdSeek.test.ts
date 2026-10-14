import { describe, expect, it } from 'vitest'
import { createHoldSeek, holdStepMs } from './holdSeek'

describe('holdStepMs', () => {
  it('degraus: 10 s, 30 s após 1 s, 60 s após 3 s, 120 s (teto) após 6 s', () => {
    expect([0, 999, 1000, 2999, 3000, 5999, 6000, 60_000].map(holdStepMs)).toEqual([
      10_000, 10_000, 30_000, 30_000, 60_000, 60_000, 120_000, 120_000,
    ])
  })
})

describe('createHoldSeek', () => {
  /** Segura `direction` com um evento a cada `everyMs`, por `forMs`, e devolve o salto de cada evento. */
  function hold(seek = createHoldSeek(), direction: 'left' | 'right' = 'right', everyMs = 100, forMs = 7000, from = 0) {
    const jumps: number[] = []
    for (let t = 0; t <= forMs; t += everyMs) jumps.push(seek.next(direction, from + t))
    return jumps
  }

  it('o primeiro toque salta 10 s e segurar acelera até 120 s', () => {
    const jumps = hold()
    expect(jumps[0]).toBe(10_000)
    expect(jumps[5]).toBe(10_000) // 0,5 s
    expect(jumps[10]).toBe(30_000) // 1 s
    expect(jumps[30]).toBe(60_000) // 3 s
    expect(jumps[60]).toBe(120_000) // 6 s
    expect(Math.max(...jumps)).toBe(120_000)
  })

  it('esquerda é o mesmo, com sinal negativo', () => {
    const jumps = hold(createHoldSeek(), 'left')
    expect(jumps[0]).toBe(-10_000)
    expect(jumps[10]).toBe(-30_000)
  })

  it('soltar e tocar de novo volta a 10 s; trocar de direção também', () => {
    const seek = createHoldSeek()
    hold(seek, 'right', 100, 3500)
    expect(seek.next('right', 3500 + 1500)).toBe(10_000) // pausa longa: toque novo
    for (let t = 5100; t < 6000; t += 100) seek.next('right', t)
    expect(seek.next('right', 6000)).toBe(30_000) // segurando de novo: 1 s depois do toque novo
    expect(seek.next('left', 6100)).toBe(-10_000) // trocar de direção zera
  })

  it('toques soltos (mais de 0,6 s entre eles) nunca aceleram', () => {
    const seek = createHoldSeek()
    expect([0, 700, 1400, 2100, 2800].map((t) => seek.next('right', t))).toEqual([10_000, 10_000, 10_000, 10_000, 10_000])
  })
})
