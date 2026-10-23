/**
 * Do alvo ao pedido de busca (feature 090, `logic/legenda-externa.md` §3) — função pura. Mora fora de
 * `subtitleTarget.ts` (que lê catálogo e metadata) para o player importá-la sem puxar esses módulos (D-012).
 */
import type { SubtitleLanguage, SubtitleSearchRequest, SubtitleTarget } from './types'

export interface BuiltSearchRequest {
  request: SubtitleSearchRequest
  /** `true` quando não havia ID TMDB e a busca vai pelo nome — a lista avisa "confira a sincronia" (FR-005). */
  byName: boolean
}

/** Só os campos da busca (FR-017): nunca identidade da lista, URL ou nome cru do provedor. */
export function buildSearchRequest(target: SubtitleTarget, language: SubtitleLanguage): BuiltSearchRequest {
  if (target.kind === 'movie' && target.tmdbId !== undefined) {
    return { request: { language, tmdbId: target.tmdbId }, byName: false }
  }
  if (
    target.kind === 'episode' &&
    target.parentTmdbId !== undefined &&
    target.season !== undefined &&
    target.episode !== undefined
  ) {
    return {
      request: { language, parentTmdbId: target.parentTmdbId, season: target.season, episode: target.episode },
      byName: false,
    }
  }
  const request: SubtitleSearchRequest = { language, query: target.title }
  if (target.kind === 'movie') {
    if (target.year !== undefined) request.year = target.year
  } else {
    if (target.season !== undefined) request.season = target.season
    if (target.episode !== undefined) request.episode = target.episode
  }
  return { request, byName: true }
}
