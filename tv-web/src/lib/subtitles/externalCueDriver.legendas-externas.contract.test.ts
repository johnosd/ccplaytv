/**
 * Contrato da feature 090 — a agenda das falas segue o tempo da MÍDIA (`logic/legenda-externa.md` §2).
 * Pela interface pública: `createExternalCueDriver` (subscribe/update), com relógio falso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubtitleCue } from '../player/tracks'
import { createExternalCueDriver } from './externalCueDriver'

const CUES = [
  { startMs: 1000, endMs: 3000, text: 'A' },
  { startMs: 5000, endMs: 7000, text: 'B' },
]

describe('createExternalCueDriver (feature 090)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // US1/AC4, SC-004: seek para frente/trás apaga a fala anterior antes da nova (sem resíduo); pausa congela; tocar avança sozinho; atraso positivo atrasa.
  it('segue a posição da mídia: salto apaga antes de mostrar, pausa não agenda nada, tocar troca de fala no tempo certo e atraso positivo atrasa', () => {
    const received: (SubtitleCue | null)[] = []
    const driver = createExternalCueDriver(CUES, { now: () => Date.now() })
    driver.subscribeSubtitles((cue) => received.push(cue))
    const texts = () => received.map((cue) => (cue ? cue.text : null))

    driver.update(1500, true)
    expect(received).toEqual([{ text: 'A', durationMs: 1500 }])

    // Salto para frente, dentro de B: apaga A primeiro, depois B com o tempo que resta.
    driver.update(5200, true)
    expect(texts().slice(-2)).toEqual([null, 'B'])
    expect(received.at(-1)).toEqual({ text: 'B', durationMs: 1800 })

    // Salto para trás, dentro de A.
    driver.update(1200, true)
    expect(texts().slice(-2)).toEqual([null, 'A'])

    // Pausado: nada é agendado, por mais tempo que passe.
    const beforePause = received.length
    driver.update(1300, false)
    vi.advanceTimersByTime(10_000)
    expect(received).toHaveLength(beforePause)

    // Volta a tocar em 1300: A termina em 3000 (apaga) e B entra em 5000, sem novos updates.
    driver.update(1300, true)
    vi.advanceTimersByTime(1700)
    expect(texts().at(-1)).toBeNull()
    vi.advanceTimersByTime(2000)
    expect(texts().at(-1)).toBe('B')
    expect(texts().filter((text) => text === 'A')).toHaveLength(2)
    driver.dispose()

    // Atraso positivo: a fala que começa em 1000 só aparece com a mídia em 2000.
    const delayed: (SubtitleCue | null)[] = []
    const late = createExternalCueDriver(CUES, { delayMs: 1000, now: () => Date.now() })
    late.subscribeSubtitles((cue) => delayed.push(cue))
    late.update(1500, true)
    expect(delayed).toEqual([])
    vi.advanceTimersByTime(500)
    expect(delayed.map((cue) => cue?.text ?? null)).toEqual(['A'])
    late.dispose()
  })
})
