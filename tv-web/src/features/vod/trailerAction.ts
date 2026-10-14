import { createTranslator, type Translator } from '../../lib/i18n/translate'
import type { TitleMetadataView, TmdbState } from '../../lib/metadata/types'
import { trailerButtonLabel, type TrailerCandidate } from '../../lib/trailer/trailerCandidates'

/**
 * Estado do botão "Trailer" no detalhe de filme e de série (feature 033,
 * `logic/botao-trailer.md`). Puro: quem chama traz o que as consultas já
 * disseram — nada aqui lê rede nem banco. Os textos vêm do catálogo (feature
 * 054); `t` omitido = português.
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

export function trailerActionLabel(state: TrailerActionState, t: Translator = createTranslator('pt')): string {
  switch (state.status) {
    case 'checking':
      return t('trailer.checking')
    case 'available':
      return trailerButtonLabel(state.candidates[0], t)
    case 'unavailable':
      return t('trailer.unavailable')
  }
}

/** Só os estados soft-disabled se declaram como tal (FR-015 da 028). */
export function trailerActionSoftDisabled(state: TrailerActionState): boolean {
  return state.status !== 'available'
}

/** Texto do toast do OK no botão; `null` quando o OK abre a camada. */
export function trailerActionToast(state: TrailerActionState, t: Translator = createTranslator('pt')): string | null {
  switch (state.status) {
    case 'checking':
      return t('trailer.toastChecking')
    case 'unavailable':
      return state.tmdbConfigured ? t('trailer.toastUnavailable') : t('trailer.toastUnavailableNoTmdb')
    case 'available':
      return null
  }
}
