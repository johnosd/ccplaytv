// Feature 021, Fase 6 (T037) — casos extras de `motionPreference`, além do
// já coberto pelo contrato (`motionPreference.fundacao-visual.contract.
// test.ts`): resolução do `localStorage` real do navegador (omitido) e o
// `root` padrão (`document.documentElement`).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REDUCED_MOTION_CLASS,
  applyMotionPreference,
  readReducedMotionPreference,
} from './motionPreference'

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove(REDUCED_MOTION_CLASS)
  window.localStorage.clear()
})

describe('motionPreference — casos extras', () => {
  it('sem argumento, usa window.localStorage; se o getter lançar, devolve false sem lançar', () => {
    // Sem nada gravado ainda: false, lendo do localStorage real.
    expect(readReducedMotionPreference()).toBe(false)

    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(() => readReducedMotionPreference()).not.toThrow()
    expect(readReducedMotionPreference()).toBe(false)
  })

  it('sem root, aplica em document.documentElement', () => {
    window.localStorage.setItem('ccplaytv:reduce-motion', 'true')
    applyMotionPreference()
    expect(document.documentElement.classList.contains(REDUCED_MOTION_CLASS)).toBe(true)
  })
})
