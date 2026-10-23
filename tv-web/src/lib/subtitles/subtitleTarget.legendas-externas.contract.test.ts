/**
 * Contrato da feature 090 — o pedido de busca usa o ID da obra quando existe e só os campos permitidos
 * (`logic/legenda-externa.md` §3). Pela interface pública: `buildSearchRequest`.
 */
import { describe, expect, it } from 'vitest'
import { buildSearchRequest } from './subtitleTarget'
import type { SubtitleTarget } from './types'

const MOVIE: SubtitleTarget = { stableId: 'src-x|movie|id:10', sourceId: 'src-x', kind: 'movie', title: 'Matrix', year: 1999 }
const EPISODE: SubtitleTarget = {
  stableId: 'src-x|episode|id:77|s1|e2', sourceId: 'src-x', kind: 'episode', title: 'Breaking Bad', year: 2008, season: 1, episode: 2,
}

describe('buildSearchRequest (feature 090)', () => {
  // FR-005 (ID quando existe, nome como último recurso) + FR-017 / Constitution: Segredos — só os campos da busca, nada da lista.
  it('usa TMDB do filme ou da série com temporada/episódio; sem ID busca pelo nome (sinalizado); nunca leva identidade da lista', () => {
    expect(buildSearchRequest({ ...MOVIE, tmdbId: 603 }, 'pt-BR')).toEqual({ request: { language: 'pt-BR', tmdbId: 603 }, byName: false })
    expect(buildSearchRequest({ ...EPISODE, parentTmdbId: 1396 }, 'en')).toEqual({
      request: { language: 'en', parentTmdbId: 1396, season: 1, episode: 2 },
      byName: false,
    })
    expect(buildSearchRequest(MOVIE, 'es')).toEqual({ request: { language: 'es', query: 'Matrix', year: 1999 }, byName: true })
    expect(buildSearchRequest(EPISODE, 'pt-BR')).toEqual({
      request: { language: 'pt-BR', query: 'Breaking Bad', season: 1, episode: 2 },
      byName: true,
    })

    for (const target of [MOVIE, EPISODE, { ...MOVIE, tmdbId: 603 }, { ...EPISODE, parentTmdbId: 1396 }]) {
      const serialized = JSON.stringify(buildSearchRequest(target, 'pt-BR').request)
      expect(serialized).not.toContain('src-x')
      expect(serialized).not.toContain('id:')
    }
  })
})
