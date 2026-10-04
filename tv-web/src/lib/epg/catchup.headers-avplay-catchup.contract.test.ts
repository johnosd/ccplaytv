/**
 * Contrato da feature 058 (US2, `logic/arquivo.md` §1/§5) — quando um programa
 * está no arquivo e o que vem depois dele.
 */
import { describe, expect, it } from 'vitest'
import { isArchiveAvailable, nextArchiveStep, type ArchiveProgram } from './catchup'

const MIN = 60_000
const H = 60 * MIN
const NOW = Date.UTC(2026, 9, 4, 15, 0)

describe('catchup — disponibilidade e sequência (feature 058)', () => {
  // FR-008, FR-013; US2-AC5/AC6; edge cases "fora dos dias do arquivo" e "EPG com lacuna".
  it('disponível só com arquivo, já começado e dentro dos dias; o fim segue para o contíguo, o atual vai ao vivo e lacuna vai ao vivo', () => {
    const early: ArchiveProgram = { start: NOW - 3 * H, end: NOW - 2 * H, title: 'Manhã' }
    const middle: ArchiveProgram = { start: NOW - 2 * H, end: NOW - 30 * MIN, title: 'Tarde' }
    const current: ArchiveProgram = { start: NOW - 30 * MIN, end: NOW + 30 * MIN, title: 'Agora' }
    const future: ArchiveProgram = { start: NOW + 30 * MIN, end: NOW + 2 * H, title: 'Depois' }

    expect(isArchiveAvailable(7, early, NOW)).toBe(true)
    expect(isArchiveAvailable(7, current, NOW)).toBe(true)
    expect(isArchiveAvailable(7, future, NOW)).toBe(false)
    expect(isArchiveAvailable(null, early, NOW)).toBe(false)
    expect(isArchiveAvailable(0, early, NOW)).toBe(false)
    // Arquivo de 1 dia: começou há 25 h → fora, mesmo que tenha acabado há menos de 24 h.
    expect(isArchiveAvailable(1, { start: NOW - 25 * H, end: NOW - 23 * H }, NOW)).toBe(false)

    const programs = [current, future, early, middle] // fora de ordem de propósito
    expect(nextArchiveStep(programs, early, 7, NOW)).toEqual({ kind: 'archive', program: middle })
    expect(nextArchiveStep(programs, middle, 7, NOW)).toEqual({ kind: 'archive', program: current })
    expect(nextArchiveStep(programs, current, 7, NOW)).toEqual({ kind: 'live' })

    const gap: ArchiveProgram = { start: NOW - H, end: NOW - 40 * MIN, title: 'Depois da lacuna' }
    expect(nextArchiveStep([early, gap], early, 7, NOW)).toEqual({ kind: 'live' })
    // Sem arquivo declarado não há "seguinte" no arquivo.
    expect(nextArchiveStep(programs, early, null, NOW)).toEqual({ kind: 'live' })
  })
})
