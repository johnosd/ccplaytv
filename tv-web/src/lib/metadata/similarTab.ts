import type { SimilarTabStatus, TitleMetadataView, TmdbState } from './types'

/**
 * Estado da aba Semelhantes (feature 035, `logic/aba-semelhantes.md` §1) — puro.
 *
 * Dado já guardado vence estado ruim do serviço: um `matched` em cache aparece
 * mesmo com o TMDB offline agora.
 */
export function similarTabStatus(input: {
  tmdbState: TmdbState | undefined
  metadata: TitleMetadataView | undefined
  /** A resolução local (cruzamento com o catálogo) ainda está rodando. */
  resolving: boolean
}): SimilarTabStatus {
  const { tmdbState, metadata, resolving } = input
  if (tmdbState === 'not_configured') return 'no_key'
  if (metadata === undefined) return 'loading'

  if (metadata.tmdbMatch === 'matched') {
    if (metadata.similar === undefined) return 'loading'
    if (metadata.similar.length === 0) return 'empty'
    return resolving ? 'loading' : 'ready'
  }
  if (metadata.tmdbMatch === 'no_match' || metadata.tmdbMatch === 'dead_id') return 'no_match'
  if (tmdbState === 'refused' || tmdbState === 'offline' || tmdbState === 'rate_limited') return 'unavailable'
  return 'loading'
}
