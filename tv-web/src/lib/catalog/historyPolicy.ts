import type { UserStateRecord } from './db'

/**
 * Regra única de "está no ↺ Histórico" (feature 036, `logic/remocao-
 * historico.md` §1): reproduzido e não escondido depois da última
 * reprodução. Remover do Histórico grava `historyHiddenAt` em vez de apagar
 * `lastWatched` — que "Continuar assistindo" também lê —, e uma reprodução
 * nova (`lastWatched` maior) traz o item de volta sozinha. Vive em um módulo
 * puro para compartilhar a regra sem import circular.
 */
export function isInHistory(state: Pick<UserStateRecord, 'lastWatched' | 'historyHiddenAt'> | null | undefined): boolean {
  if (state?.lastWatched == null) return false
  return state.historyHiddenAt == null || state.lastWatched > state.historyHiddenAt
}

