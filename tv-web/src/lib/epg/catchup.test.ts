/** Feature 058 (T026, `logic/arquivo.md` §1/§5): bordas da disponibilidade e da sequência do arquivo. */
import { describe, expect, it } from 'vitest'
import { CONTIGUOUS_TOLERANCE_MS, isArchiveAvailable, nextArchiveStep, type ArchiveProgram } from './catchup'

const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H
const NOW = Date.UTC(2026, 9, 4, 15, 0)

const p = (start: number, end: number, title = 'P'): ArchiveProgram => ({ start, end, title })

describe('isArchiveAvailable', () => {
  it('programa que começa exatamente no limite dos dias está disponível; um milissegundo antes, não', () => {
    expect(isArchiveAvailable(3, p(NOW - 3 * DAY, NOW - 3 * DAY + H), NOW)).toBe(true)
    expect(isArchiveAvailable(3, p(NOW - 3 * DAY - 1, NOW - 3 * DAY + H), NOW)).toBe(false)
  })

  it('dias fracionários contam como estão; inválidos nunca disponibilizam', () => {
    expect(isArchiveAvailable(0.5, p(NOW - 11 * H, NOW - 10 * H), NOW)).toBe(true)
    expect(isArchiveAvailable(0.5, p(NOW - 13 * H, NOW - 12 * H), NOW)).toBe(false)
    for (const days of [-1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(isArchiveAvailable(days, p(NOW - H, NOW - 30 * MIN), NOW)).toBe(false)
    }
  })

  it('programa que começa exatamente agora está disponível (o atual conta)', () => {
    expect(isArchiveAvailable(1, p(NOW, NOW + H), NOW)).toBe(true)
  })
})

describe('nextArchiveStep', () => {
  it('aceita a folga de 60 s do XMLTV entre o fim de um e o início do outro', () => {
    const a = p(NOW - 3 * H, NOW - 2 * H)
    const b = p(NOW - 2 * H + CONTIGUOUS_TOLERANCE_MS, NOW - H)
    expect(nextArchiveStep([a, b], a, 7, NOW)).toEqual({ kind: 'archive', program: b })
    const late = p(NOW - 2 * H + CONTIGUOUS_TOLERANCE_MS + 1, NOW - H)
    expect(nextArchiveStep([a, late], a, 7, NOW)).toEqual({ kind: 'live' })
  })

  it('sobreposição pequena (o seguinte começa antes do fim) ainda é contígua', () => {
    const a = p(NOW - 3 * H, NOW - 2 * H)
    const b = p(NOW - 2 * H - 30_000, NOW - H)
    expect(nextArchiveStep([a, b], a, 7, NOW)).toEqual({ kind: 'archive', program: b })
  })

  it('fim da programação guardada vai ao ao vivo', () => {
    const a = p(NOW - 3 * H, NOW - 2 * H)
    expect(nextArchiveStep([a], a, 7, NOW)).toEqual({ kind: 'live' })
  })
})
