/**
 * Contrato da feature 061 (classificação indicativa e nota TMDB) — travado em
 * `sdd/specs/061-classificacao-nota-tmdb/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/classificacao-e-nota.md` §1–§2 e §4.
 */
import { describe, expect, it } from 'vitest'
import { certificationsFromTmdb, tmdbRatingFromTmdb, tmdbRatingToShow } from './contentRating'

describe('contentRating — contrato da feature 061', () => {
  // FR-006, FR-007; Edge Cases (vazio/formato inesperado, série); Constitution: "IA e Classificação Nunca Inventam Dados"
  it('extrai só valores válidos de BR, US e ES: filme escolhe pela ordem do tipo de lançamento e ignora vazio, NR e fora da escala; série lê content_ratings', () => {
    const movie = certificationsFromTmdb('movie', {
      release_dates: {
        results: [
          // Brasil: a estreia em cinema (tipo 3) vence a digital (tipo 4), mesmo vindo depois; vazio nunca vale.
          {
            iso_3166_1: 'BR',
            release_dates: [
              { certification: '', type: 1 },
              { certification: '16', type: 4 },
              { certification: '14', type: 3 },
            ],
          },
          // EUA: "NR" (não classificado) não é classificação.
          { iso_3166_1: 'US', release_dates: [{ certification: 'NR', type: 3 }] },
          // Espanha: "X" está fora da escala aceita.
          { iso_3166_1: 'ES', release_dates: [{ certification: 'X', type: 3 }] },
          // País que o app não guarda.
          { iso_3166_1: 'FR', release_dates: [{ certification: '12', type: 3 }] },
        ],
      },
    })
    expect(movie).toEqual({ BR: '14' })

    const series = certificationsFromTmdb('tv', {
      content_ratings: {
        results: [
          { iso_3166_1: 'BR', rating: 'AL' }, // fora da escala L/10/12/14/16/18
          { iso_3166_1: 'US', rating: 'TV-MA' },
          { iso_3166_1: 'ES', rating: '13' },
        ],
      },
    })
    expect(series).toEqual({ US: 'TV-MA', ES: '13' })

    // Escala de filme não vale para série (e vice-versa).
    expect(certificationsFromTmdb('tv', { content_ratings: { results: [{ iso_3166_1: 'US', rating: 'PG-13' }] } })).toEqual({})
    // Resposta sem a chave ou malformada: objeto vazio, nunca exceção.
    expect(certificationsFromTmdb('movie', {})).toEqual({})
    expect(certificationsFromTmdb('movie', { release_dates: { results: 'x' } })).toEqual({})
  })

  // FR-002, FR-008, SC-004
  it('nota do TMDB: lida de vote_average/vote_count; só aparece com média > 0 e pelo menos 50 votos', () => {
    expect(tmdbRatingFromTmdb({ vote_average: 7.83, vote_count: 1200 })).toEqual({ average: 7.83, votes: 1200 })
    expect(tmdbRatingFromTmdb({ vote_average: '7.8', vote_count: 1200 })).toBeUndefined()
    expect(tmdbRatingFromTmdb({})).toBeUndefined()

    expect(tmdbRatingToShow({ average: 7.83, votes: 50 })).toBe(7.83)
    expect(tmdbRatingToShow({ average: 9.8, votes: 49 })).toBeNull()
    expect(tmdbRatingToShow({ average: 0, votes: 5000 })).toBeNull()
    expect(tmdbRatingToShow(undefined)).toBeNull()
  })
})
