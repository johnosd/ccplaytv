/**
 * Feature 086, T073: a carga da lista espera a primeira tela da sessão aparecer — mas com teto, para nunca travar uma
 * lista que está sendo adicionada agora (ali a carga é justamente o que a pessoa espera).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIRST_REVEAL_WAIT_MS,
  isFirstRevealDone,
  noteFirstReveal,
  resetFirstRevealForTests,
  waitForFirstReveal,
} from './firstReveal'

beforeEach(() => {
  resetFirstRevealForTests()
})
afterEach(() => {
  vi.useRealTimers()
  resetFirstRevealForTests()
})

describe('sinal da primeira revelação (086)', () => {
  it('a espera solta quando a primeira tela revela', async () => {
    vi.useFakeTimers()
    let soltou = false
    const esperando = waitForFirstReveal().then(() => { soltou = true })

    // Antes da revelação, a carga continua esperando.
    await Promise.resolve()
    expect(soltou).toBe(false)

    noteFirstReveal()
    await esperando
    expect(soltou).toBe(true)
    expect(isFirstRevealDone()).toBe(true)
  })

  it('a espera solta pelo teto quando nenhuma tela revela', async () => {
    vi.useFakeTimers()
    const esperando = waitForFirstReveal()
    vi.advanceTimersByTime(FIRST_REVEAL_WAIT_MS)
    await expect(esperando).resolves.toBeUndefined()
  })

  it('depois da primeira revelação, esperar não custa nada', async () => {
    noteFirstReveal()
    // Sem timers falsos: se isto não resolvesse na hora, o teste travaria.
    await expect(waitForFirstReveal()).resolves.toBeUndefined()
  })

  it('só a primeira revelação conta, e avisar de novo não quebra quem já esperou', async () => {
    noteFirstReveal()
    await waitForFirstReveal()
    expect(() => { noteFirstReveal(); noteFirstReveal() }).not.toThrow()
    await expect(waitForFirstReveal()).resolves.toBeUndefined()
  })
})
