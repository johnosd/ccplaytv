import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import type { HistoryClearScope, HistoryRemovalMode } from '../../lib/catalog/historyRemoval'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'

/** Um título (grade/detalhe) ou um lote (aba Privacidade). */
export type HistoryRemovalSubject = { kind: 'item'; name: string } | { kind: 'batch'; scope: HistoryClearScope }

export interface HistoryRemovalModalProps {
  subject: HistoryRemovalSubject
  /** Há posição de retomada no alvo — só então existe a 3ª ação (FR-007/FR-024). */
  hasProgress: boolean
  /** A última tentativa falhou (FR-020): título de erro e "Tentar de novo". */
  error?: boolean
  onCancel: () => void
  onConfirm: (mode: HistoryRemovalMode) => void
}

const SCOPE_LABEL_KEY: Record<HistoryClearScope, MessageKey> = {
  movies: 'settings.privacy.scope.movies',
  series: 'settings.privacy.scope.series',
  both: 'settings.privacy.scope.both',
}

interface Action {
  label: string
  mode: HistoryRemovalMode | null
}

/**
 * Confirmação de remover/limpar o "↺ Histórico" (feature 036,
 * `logic/remocao-historico.md` §6) — um componente para grade, detalhe e
 * Privacidade (D-006). "Cancelar" no índice 0, focado ao abrir (FR-011);
 * ←/→ alternam; RETURN cancela (FR-010). Foco por estado (ADR-009): o `Modal`
 * intercepta o teclado e devolve à tela ao fechar.
 */
export function HistoryRemovalModal({
  subject,
  hasProgress,
  error = false,
  onCancel,
  onConfirm,
}: HistoryRemovalModalProps): ReactNode {
  const t = useT()
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [lastMode, setLastMode] = useState<HistoryRemovalMode>('history-only')
  // Entrar no estado de erro volta o foco ao "Cancelar" (§6).
  const [shownError, setShownError] = useState(error)
  if (shownError !== error) {
    setShownError(error)
    setFocusedIdx(0)
  }

  const isItem = subject.kind === 'item'
  const actions: Action[] = error
    ? [
        { label: t('common.cancel'), mode: null },
        { label: t('common.retry'), mode: lastMode },
      ]
    : [
        { label: t('common.cancel'), mode: null },
        { label: t(isItem ? 'hist.removeItem' : 'hist.clear'), mode: 'history-only' },
        ...(hasProgress
          ? [{ label: t(isItem ? 'hist.removeItemAndProgress' : 'hist.clearAndProgress'), mode: 'history-and-progress' as const }]
          : []),
      ]
  const current = Math.min(focusedIdx, actions.length - 1)

  function activate(action: Action) {
    if (action.mode === null) {
      onCancel()
      return
    }
    setLastMode(action.mode)
    onConfirm(action.mode)
  }

  const question = isItem
    ? t('hist.removeQuestion', { name: subject.name })
    : t('hist.clearQuestion', { scope: t(SCOPE_LABEL_KEY[subject.scope]) })

  return (
    <Modal
      ariaLabel={question}
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setFocusedIdx(Math.max(0, current - 1))
        if (direction === 'right') setFocusedIdx(Math.min(actions.length - 1, current + 1))
      }}
      onSelect={() => activate(actions[current])}
    >
      <p className="modal-title">{error ? t('hist.errorTitle') : question}</p>
      <p className="modal-description">
        {t('hist.note')}
        {!error && hasProgress && t('hist.keepResume')}
      </p>
      <div className="modal-actions">
        {actions.map((action, index) => (
          <Button
            key={action.label}
            variant={action.mode === null ? 'secondary' : 'accent'}
            focused={index === current}
            onSelect={() => activate(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
