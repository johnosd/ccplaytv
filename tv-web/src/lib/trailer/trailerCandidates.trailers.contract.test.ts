/**
 * Contrato da feature 033 (trailers) — travado em
 * `sdd/specs/033-trailers-filmes-series/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/candidatos-de-trailer.md`.
 */
import { describe, expect, it } from 'vitest'
import { buildTrailerCandidates, trailerButtonLabel, trailerRefsFromTmdbVideos } from './trailerCandidates'

describe('trailerCandidates — contrato da feature 033', () => {
  // FR-003/FR-004/FR-007; Constitution: "IA e Classificação Nunca Inventam Dados" (teaser nunca vira trailer; making-of, Vimeo e id inválido ficam fora)
  it('provedor primeiro e TMDB ordenado (trailer>teaser, pt>outro, oficial>não), só YouTube com id válido, sem repetir; rótulo só diz tipo/idioma fora do trailer em português', () => {
    const tmdb = trailerRefsFromTmdbVideos({
      results: [
        { site: 'YouTube', type: 'Teaser', key: 'teaserPt001', iso_639_1: 'pt', official: true },
        { site: 'YouTube', type: 'Trailer', key: 'trailerEn01', iso_639_1: 'en', official: true },
        { site: 'YouTube', type: 'Trailer', key: 'trailerPt02', iso_639_1: 'pt', official: false },
        { site: 'YouTube', type: 'Trailer', key: 'trailerPt01', iso_639_1: 'pt', official: true },
        { site: 'YouTube', type: 'Featurette', key: 'makingOf001', iso_639_1: 'pt', official: true },
        { site: 'Vimeo', type: 'Trailer', key: 'vimeoTrl01X', iso_639_1: 'pt', official: true },
        { site: 'YouTube', type: 'Trailer', key: 'curto', iso_639_1: 'pt', official: true },
        { site: 'YouTube', type: 'Trailer', key: 'provTrail01', iso_639_1: 'pt', official: true },
      ],
    })

    const candidates = buildTrailerCandidates([{ videoId: 'provTrail01', kind: 'trailer' }], tmdb)

    expect(candidates.map((c) => [c.videoId, c.origin])).toEqual([
      ['provTrail01', 'provider'],
      ['trailerPt01', 'tmdb'],
      ['trailerPt02', 'tmdb'],
      ['trailerEn01', 'tmdb'],
      ['teaserPt001', 'tmdb'],
    ])

    expect(trailerButtonLabel(candidates[0])).toBe('▶ Trailer')
    expect(trailerButtonLabel(candidates[1])).toBe('▶ Trailer')
    expect(trailerButtonLabel(candidates[3])).toBe('▶ Trailer · Inglês')
    expect(trailerButtonLabel(candidates[4])).toBe('▶ Teaser')
    expect(trailerButtonLabel({ videoId: 'teaserEn001', kind: 'teaser', language: 'en', origin: 'tmdb' })).toBe(
      '▶ Teaser · Inglês',
    )

    expect(buildTrailerCandidates(undefined, undefined)).toEqual([])
    expect(buildTrailerCandidates([{ videoId: 'curto', kind: 'trailer' }], [])).toEqual([])
  })
})
