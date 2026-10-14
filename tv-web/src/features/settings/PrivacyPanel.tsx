import type { ReactNode } from 'react'
import type { HistoryClearScope, HistoryScopeSummary } from '../../lib/catalog/historyRemoval'
import { useT } from '../../lib/i18n/I18nProvider'
import { describeScope, isScopeEmpty, PRIVACY_ROW_LABEL_KEY, PRIVACY_SCOPES } from './privacyModel'

export interface PrivacyPanelProps {
  /** Nome da lista da tela (Configurações da lista, feature 067). */
  listName: string
  /** Resumo por linha, na ordem de `PRIVACY_SCOPES`; `undefined` enquanto lê. */
  summaries: Record<HistoryClearScope, HistoryScopeSummary> | undefined
  /** `undefined` = nenhuma linha focada agora (zona `tabs`). */
  focusedRow?: number
  onActivateRow: (row: number) => void
}

/**
 * Histórico (feature 036, US2 — `logic/remocao-historico.md` §11): limpar o "↺ Histórico" da lista da tela. Linha vazia
 * fica soft disabled, mas continua focável e diz por quê no nome (FR-026). Desde a feature 067 sempre há uma lista.
 */
export function PrivacyPanel({ listName, summaries, focusedRow, onActivateRow }: PrivacyPanelProps): ReactNode {
  const t = useT()
  return (
    <div className="privacy-panel">
      <h2 className="privacy-panel-heading">{t('settings.privacy.heading', { list: listName })}</h2>
      <p className="privacy-panel-note">{t('settings.privacy.note')}</p>
      {PRIVACY_SCOPES.map((scope, row) => {
        const label = t(PRIVACY_ROW_LABEL_KEY[scope])
        const summary = summaries?.[scope]
        const empty = summary !== undefined && isScopeEmpty(summary)
        const value = summary === undefined ? t('common.loading') : empty ? t('settings.privacy.empty') : describeScope(summary, t)
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
