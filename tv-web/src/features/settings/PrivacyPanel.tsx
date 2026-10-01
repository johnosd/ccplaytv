import type { ReactNode } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { HistoryClearScope, HistoryScopeSummary } from '../../lib/catalog/historyRemoval'
import { describeScope, isScopeEmpty, PRIVACY_ROW_LABEL, PRIVACY_SCOPES } from './privacyModel'

export interface PrivacyPanelProps {
  /** Nome da lista ativa; `null` = sem lista ativa (FR-027). */
  listName: string | null
  /** Resumo por linha, na ordem de `PRIVACY_SCOPES`; `undefined` enquanto lê. */
  summaries: Record<HistoryClearScope, HistoryScopeSummary> | undefined
  /** `undefined` = nenhuma linha focada agora (zona `tabs`). */
  focusedRow?: number
  onActivateRow: (row: number) => void
  /** "Voltar às abas" do estado sem lista ativa. */
  onBack: () => void
}

/**
 * Privacidade (feature 036, US2 — `logic/remocao-historico.md` §11): limpar
 * o "↺ Histórico" da lista ativa. Linha vazia fica soft disabled, mas
 * continua focável e diz por quê no nome (FR-026). Sem lista ativa, explica e
 * mantém um botão focável (FR-027).
 */
export function PrivacyPanel({ listName, summaries, focusedRow, onActivateRow, onBack }: PrivacyPanelProps): ReactNode {
  if (listName === null) {
    return (
      <EmptyState
        title="Privacidade"
        description="O histórico é guardado por lista. Entre numa lista para limpar o histórico dela."
        action={{ label: 'Voltar às abas', onSelect: onBack }}
        focused={focusedRow !== undefined}
      />
    )
  }

  return (
    <div className="privacy-panel">
      <h2 className="privacy-panel-heading">Histórico de {listName}</h2>
      <p className="privacy-panel-note">Favoritos e marcações de assistido não são alterados.</p>
      {PRIVACY_SCOPES.map((scope, row) => {
        const label = PRIVACY_ROW_LABEL[scope]
        const summary = summaries?.[scope]
        const empty = summary !== undefined && isScopeEmpty(summary)
        const value = summary === undefined ? 'Carregando…' : empty ? 'histórico vazio' : describeScope(summary)
        return (
          <button
            key={scope}
            type="button"
            className={`privacy-panel-row no-scale${empty ? ' is-soft-disabled' : ''}${focusedRow === row ? ' tv-focus' : ''}`}
            aria-disabled={empty ? 'true' : undefined}
            aria-label={`${label} — ${value}`}
            onClick={() => onActivateRow(row)}
          >
            <span>{label}</span>
            <span className="privacy-panel-value">{value}</span>
          </button>
        )
      })}
    </div>
  )
}
