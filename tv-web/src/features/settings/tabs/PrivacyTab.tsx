import { useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import type { HistoryClearScope, HistoryRemovalMode } from '../../../lib/catalog/historyRemoval'
import { useClearHistory, useHistorySummary } from '../../catalog/catalogApi'
import { useSources } from '../../import/importApi'
import { HistoryRemovalModal } from '../../history/HistoryRemovalModal'
import { PrivacyPanel } from '../PrivacyPanel'
import { isScopeEmpty, PRIVACY_SCOPE_LABEL, PRIVACY_SCOPES, scopeSummaries } from '../privacyModel'
import type { SettingsTabProps } from './settingsTab'

/**
 * Privacidade (feature 036, US2 — `logic/remocao-historico.md` §11): limpar o
 * "↺ Histórico" da lista ativa. O resumo só é lido com a aba montada — e a
 * aba só monta quando está ativa (registro de abas, R-005), então abrir
 * Configurações não lê nada (T026).
 */
export function PrivacyTab({ focused, activeSourceId, exitToTabs, goToTopbar, showToast, handleRef }: SettingsTabProps): ReactNode {
  const sourcesQuery = useSources()
  const activeSource = sourcesQuery.data?.sources.find((source) => source.id === activeSourceId)
  const listName = activeSourceId === null ? null : (activeSource?.display_name ?? '')
  const summaryQuery = useHistorySummary(activeSourceId, true)
  const summaries = summaryQuery.data ? scopeSummaries(summaryQuery.data) : undefined
  const clearHistory = useClearHistory()

  const [row, setRow] = useState(0)
  const [confirm, setConfirm] = useState<{ scope: HistoryClearScope; error: boolean } | null>(null)
  const rowCount = listName === null ? 1 : PRIVACY_SCOPES.length

  function activateRow(target: number) {
    setRow(target)
    if (listName === null) {
      exitToTabs()
      return
    }
    const scope = PRIVACY_SCOPES[target]
    const summary = summaries?.[scope]
    if (!summary) return // ainda lendo
    // Linha vazia: soft disabled — explica, nunca abre a confirmação (FR-026).
    if (isScopeEmpty(summary)) {
      showToast(`O histórico de ${PRIVACY_SCOPE_LABEL[scope]} já está vazio.`)
      return
    }
    setConfirm({ scope, error: false })
  }

  function confirmClear(mode: HistoryRemovalMode) {
    if (!confirm || activeSourceId === null || clearHistory.isPending) return
    const { scope } = confirm
    clearHistory.mutate(
      { sourceId: activeSourceId, scope, mode },
      {
        // O foco fica na linha, agora vazia (FR-028).
        onSuccess: () => {
          setConfirm(null)
          showToast(`Histórico de ${PRIVACY_SCOPE_LABEL[scope]} limpo.`)
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
      if (direction === 'up' && row === 0) {
        goToTopbar()
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
        onBack={exitToTabs}
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
