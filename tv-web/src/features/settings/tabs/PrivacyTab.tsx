import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { useT } from '../../../lib/i18n/I18nProvider'
import type { HistoryClearScope, HistoryRemovalMode } from '../../../lib/catalog/historyRemoval'
import { useClearHistory, useHistorySummary } from '../../catalog/catalogApi'
import { HistoryRemovalModal } from '../../history/HistoryRemovalModal'
import { PrivacyPanel } from '../PrivacyPanel'
import { isScopeEmpty, PRIVACY_SCOPE_LABEL_KEY, PRIVACY_SCOPES, scopeSummaries } from '../privacyModel'
import type { ListSettingsTabProps } from './settingsTab'

/**
 * Histórico (feature 036, US2 — `logic/remocao-historico.md` §11): limpar o "↺ Histórico" de uma lista. Desde a
 * feature 067 é a aba Histórico de Configurações da lista e age sobre a lista DA TELA, ativa ou não (D-005). O resumo só
 * é lido com a aba montada — e a aba só monta quando está ativa, então abrir a tela não lê nada (T026 da 036).
 */
export function PrivacyTab({ focused, source, exitToTabs, showToast, handleRef }: ListSettingsTabProps): ReactNode {
  const t = useT()
  const sourceId = source.id
  const listName = source.display_name
  const summaryQuery = useHistorySummary(sourceId, true)
  const summaries = summaryQuery.data ? scopeSummaries(summaryQuery.data) : undefined
  const clearHistory = useClearHistory()

  const [row, setRow] = useState(0)
  const [confirm, setConfirm] = useState<{ scope: HistoryClearScope; error: boolean } | null>(null)
  const rowCount = PRIVACY_SCOPES.length

  function activateRow(target: number) {
    setRow(target)
    const scope = PRIVACY_SCOPES[target]
    const summary = summaries?.[scope]
    if (!summary) return // ainda lendo
    // Linha vazia: soft disabled — explica, nunca abre a confirmação (FR-026).
    if (isScopeEmpty(summary)) {
      showToast(t('settings.privacy.alreadyEmpty', { scope: t(PRIVACY_SCOPE_LABEL_KEY[scope]) }))
      return
    }
    setConfirm({ scope, error: false })
  }

  function confirmClear(mode: HistoryRemovalMode) {
    if (!confirm || clearHistory.isPending) return
    const { scope } = confirm
    clearHistory.mutate(
      { sourceId, scope, mode },
      {
        // O foco fica na linha, agora vazia (FR-028).
        onSuccess: () => {
          setConfirm(null)
          showToast(t('settings.privacy.cleared', { scope: t(PRIVACY_SCOPE_LABEL_KEY[scope]) }))
        },
        onError: () => setConfirm((current) => (current ? { ...current, error: true } : current)),
      },
    )
  }

  useImperativeHandle(handleRef, () => ({
    onEnter: () => setRow(0),
    onDirection: (direction) => {
      if (direction === 'left') {
        exitToTabs()
        return
      }
      if (direction === 'up' || direction === 'down') {
        setRow((r) => clamp(r + (direction === 'down' ? 1 : -1), 0, rowCount - 1))
      }
    },
    onSelect: () => activateRow(row),
  }))

  return (
    <>
      <PrivacyPanel
        listName={listName}
        summaries={summaries}
        focusedRow={focused && !confirm ? row : undefined}
        onActivateRow={activateRow}
      />
      {confirm && summaries && (
        <HistoryRemovalModal
          subject={{ kind: 'batch', scope: confirm.scope }}
          hasProgress={summaries[confirm.scope].hasProgress}
          error={confirm.error}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmClear}
        />
      )}
    </>
  )
}
