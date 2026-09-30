import type { TitleMetadataView, TmdbState } from '../../lib/metadata/types'
import { trailerButtonLabel, type TrailerCandidate } from '../../lib/trailer/trailerCandidates'

/**
 * Estado do botão "Trailer" no detalhe de filme e de série (feature 033,
 * `logic/botao-trailer.md`). Puro: quem chama traz o que as consultas já
 * disseram — nada aqui lê rede nem banco.
 */
export type TrailerActionState =
  | { status: 'checking' }
  | { status: 'available'; candidates: TrailerCandidate[] }
  | { status: 'unavailable'; tmdbConfigured: boolean }

export function trailerActionState(input: {
  metadata: TitleMetadataView | undefined
  /** As consultas do detalhe ainda podem trazer um candidato. */
  checking: boolean
  tmdbState: TmdbState | undefined
}): TrailerActionState {
  const trailers = input.metadata?.trailers
  // Um candidato já conhecido serve, mesmo com a metadata ainda atualizando.
  if (trailers && trailers.length > 0) return { status: 'available', candidates: trailers }
  if (input.checking) return { status: 'checking' }
  return { status: 'unavailable', tmdbConfigured: input.tmdbState !== undefined && input.tmdbState !== 'not_configured' }
}

export function trailerActionLabel(state: TrailerActionState): string {
  switch (state.status) {
    case 'checking':
      return 'Trailer…'
    case 'available':
      return trailerButtonLabel(state.candidates[0])
    case 'unavailable':
      return 'Trailer — indisponível'
  }
}

/** Só os estados soft-disabled se declaram como tal (FR-015 da 028). */
export function trailerActionSoftDisabled(state: TrailerActionState): boolean {
  return state.status !== 'available'
}

/** Texto do toast do OK no botão; `null` quando o OK abre a camada. */
export function trailerActionToast(state: TrailerActionState): string | null {
  switch (state.status) {
    case 'checking':
      return 'Consultando trailer'
    case 'unavailable':
      return state.tmdbConfigured
        ? 'Trailer indisponível para este título'
        : 'Trailer indisponível para este título — configure o TMDB em Integrações para encontrar mais trailers.'
    case 'available':
      return null
  }
}
