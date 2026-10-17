/**
 * Estado da chave TMDB mostrado no portal (feature 077, FR-011): junta a operação pendente, o último resultado e o
 * que a própria TV informou no snapshot. O valor da chave NUNCA entra aqui. Regras e prioridade em
 * `sdd/specs/077-redesenho-portal-web/logic/tmdb-estado.md`.
 */
export type TmdbView = 'none' | 'configured_on_tv' | 'pending' | 'applied' | 'rejected'

export interface TmdbServiceState {
  /** Operação ainda não aplicada pela TV (substitui qualquer anterior). `retryReason`: a TV tentou e não conseguiu. */
  pending?: { action: 'set' | 'remove'; retryReason?: 'offline' | 'rate_limited' }
  /** Última operação que a TV concluiu. */
  last?: { action: 'set' | 'remove'; result: 'applied' | 'rejected'; reason?: 'refused' | 'invalid_format' }
  /** O que a TV disse no último snapshot; ausente = a TV ainda não informou. */
  tvReported?: 'none' | 'configured'
}

export interface TmdbPresentation {
  view: TmdbView
  /** Há chave na TV (ou aplicada) que dá para remover. */
  canRemove: boolean
  /** Pendente com nova tentativa por falha transitória da TV. */
  needsRetry: boolean
  /** Motivo da recusa quando `view === 'rejected'`. */
  reason?: 'refused' | 'invalid_format'
}

export function resolveTmdbView({ pending, last, tvReported }: TmdbServiceState): TmdbPresentation {
  const appliedSet = last?.action === 'set' && last.result === 'applied'
  if (pending) return { view: 'pending', canRemove: tvReported === 'configured' || appliedSet, needsRetry: pending.retryReason != null }
  if (last?.result === 'rejected') return { view: 'rejected', canRemove: tvReported === 'configured', needsRetry: false, reason: last.reason }
  // A TV é a fonte da verdade do que existe: um snapshot dizendo "none" desfaz o "aplicada".
  if (appliedSet && tvReported === 'none') return { view: 'none', canRemove: false, needsRetry: false }
  if (appliedSet) return { view: 'applied', canRemove: true, needsRetry: false }
  if (last?.action === 'remove' && last.result === 'applied') return { view: 'none', canRemove: false, needsRetry: false }
  if (tvReported === 'configured') return { view: 'configured_on_tv', canRemove: true, needsRetry: false }
  return { view: 'none', canRemove: false, needsRetry: false }
}
