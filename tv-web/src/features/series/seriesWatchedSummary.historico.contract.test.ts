/**
 * Contrato da feature 019 (Histórico e Continuar Assistindo) — agregação
 * "Em dia" por série (D-007/D-008, `logic/agregacao-serie.md`).
 *
 * Seletor fixado por este contrato: `summarizeSeriesWatched(episodes)`.
 */
import { describe, it, expect } from 'vitest'
import { summarizeSeriesWatched } from './seriesWatchedSummary'

describe('summarizeSeriesWatched (feature 019, US3 AC1/AC3, FR-007/FR-008, Constitution: Progresso e Capacidades São Reais)', () => {
  it('"Em dia" só com cobertura completa E tudo assistido; cobertura parcial nunca produz "Em dia"', () => {
    const upToDate = summarizeSeriesWatched([{ completedAt: 1 }, { completedAt: 2 }])
    expect(upToDate).toEqual({ known: 2, watched: 2, upToDate: true })

    const partial = summarizeSeriesWatched([{ completedAt: 1 }, { completedAt: undefined }])
    expect(partial.upToDate).toBe(false)
    expect(partial).toEqual({ known: 2, watched: 1, upToDate: false })

    // Cobertura zero (série nunca lida) nunca é "Em dia" — nada a mostrar.
    const empty = summarizeSeriesWatched([])
    expect(empty).toEqual({ known: 0, watched: 0, upToDate: false })
  })
})
