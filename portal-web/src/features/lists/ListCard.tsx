import { useT, type MessageKey } from '../../lib/i18n'
import type { Source } from '../api'
import type { ListState } from './listStatus'

// Mesmo par de cores estável por id que a tela de listas da TV (tv-web/src/features/profiles/listAvatar.ts).
function avatarVariant(sourceId: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < sourceId.length; i++) { hash ^= sourceId.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0 }
  return hash % 6
}
function initials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : words[0]?.slice(0, 2) ?? '?').toUpperCase()
}

const badge = { onTv: ['statusOnTv', 'success'], waiting: ['statusWaitingTv', 'warning'], error: ['statusError', 'danger'], none: undefined } as const
const stateText: Record<string, MessageKey> = { conflict: 'conflict', expired: 'expired', error: 'error' }

/**
 * Cartão de lista (feature 077, FR-005): nome, tipo, selo de estado (texto + forma, nunca só cor) e as ações que fazem
 * sentido agora — Editar e Excluir sempre (exceto em exclusão pendente), Cancelar envio só com envio pendente,
 * Reenviar só com problema. `resendDisabled`: o snapshot está velho, então reenviar não é seguro (continua visível).
 */
export function ListCard({ source, saved, state, resendDisabled, busy, onEdit, onDelete, onCancelSend, onResend, onRetryDelete }: {
  source: Source; saved: boolean; state: ListState; resendDisabled: boolean; busy: boolean
  onEdit: () => void; onDelete: () => void; onCancelSend: () => void; onResend: () => void; onRetryDelete: () => void
}) {
  const t = useT()
  const marker = badge[state.status]
  const detailKey = state.status === 'error' && state.operation ? stateText[state.operation.state] : undefined
  const id = 'list-' + source.id
  return <article className="list-card" aria-labelledby={id}>
    <span className={'list-avatar list-avatar--' + avatarVariant(source.id)} aria-hidden="true">{initials(source.displayName)}</span>
    <div className="list-card-body">
      <h3 id={id} title={source.displayName}>{source.displayName}</h3>
      <p className="list-meta">{t(source.type === 'provider_credentials' ? 'xtream' : 'm3u')}<span aria-hidden="true"> · </span>{t(saved ? 'saved' : 'notSaved')}</p>
      {marker && <p><span className={'status-badge is-' + marker[1]}>{t(marker[0])}</span></p>}
      {detailKey && <p className="list-detail">{t(detailKey)}</p>}
      {state.deleting && <p className="list-detail">{t('deleteSentNextStep')}</p>}
      {!state.deleting && state.status === 'waiting' && state.canCancel && <p className="list-detail">{t('sentNextStep')}</p>}
    </div>
    <div className="list-card-actions">
      {!state.deleting && <>
        <button type="button" className="small ghost" data-focus-key={'edit-' + source.id} disabled={busy} onClick={onEdit}>{t('edit')}</button>
        <button type="button" className="small ghost danger" disabled={busy} onClick={onDelete}>{t('listDelete')}</button>
      </>}
      {state.canCancel && <button type="button" className="small" disabled={busy} onClick={onCancelSend}>{t('cancelSend')}</button>}
      {state.canResend && <button type="button" className="small" disabled={busy} aria-disabled={resendDisabled || undefined} title={resendDisabled ? t('resendHint') : undefined}
        onClick={() => { if (!resendDisabled) onResend() }}>{t('resendList')}</button>}
      {state.canRetryDelete && <button type="button" className="small" disabled={busy} onClick={onRetryDelete}>{t('retryRemoval')}</button>}
    </div>
  </article>
}
