import type { ReactNode } from 'react'
import { Button } from '../../../components/Button'
import { RefreshStatusLine } from '../../../components/RefreshButton'
import { useT } from '../../../lib/i18n/I18nProvider'
import type { RefreshAction } from '../../../lib/portal/useRefreshAction'
import type { SubtitleKeyStatus } from '../../../lib/subtitles/subtitleCredentials'
import type { SubtitleProvider } from '../../../lib/subtitles/types'
import { subtitleKeyFeedbackLabel, type SubtitleKeyFeedback } from '../../../lib/portal/subtitleKeyFeedback'
import {
  SUBTITLE_KEY_ACTION_LABEL,
  SUBTITLE_KEY_ROWS,
  SUBTITLE_PROVIDER_NAME,
  subtitleKeyActions,
  subtitleKeyStateLabel,
} from '../subtitleKeysModel'

export interface SubtitleKeysSectionProps {
  statuses: readonly SubtitleKeyStatus[]
  feedback?: SubtitleKeyFeedback
  /** O padrão do ccplayTv existe nesta TV (portal visível); senão a linha sem chave diz "Sem chave". */
  hasDefault: boolean
  /** Linha (0–1) focada agora; `undefined` = nenhuma (outra zona ou diálogo aberto). */
  focusedRow?: number
  focusedCol: number
  testing: SubtitleProvider | null
  onActivate: (row: number, col: number) => void
  /**
   * Atualizar só das legendas (feature 091): busca no portal as chaves enviadas por lá. Presente só com o portal visível;
   * é a linha `SUBTITLE_KEY_ROWS.length` da seção (depois dos fornecedores).
   */
  refresh?: RefreshAction
}

/**
 * Seção "Legendas" da aba Integrações (feature 090, US3, `logic §10.2`): uma linha por fornecedor com o estado e as
 * ações. Foco por estado (ADR-009): toda linha tem ao menos uma ação, em qualquer estado. A chave aparece só mascarada.
 */
export function SubtitleKeysSection({ statuses, feedback, hasDefault, focusedRow, focusedCol, testing, onActivate, refresh }: SubtitleKeysSectionProps): ReactNode {
  const t = useT()
  const hasUnapplied = hasDefault && Object.values(feedback ?? {}).some(ack => ack.state !== 'applied')
  const hasResultMessage = hasUnapplied && (refresh?.status === 'done' || refresh?.status === 'nothing')
  return (
    <section className="integration-card" data-service="subtitle-keys" aria-label={t('subtitles.keys.title')}>
      <h2 className="integration-card-title">{t('subtitles.keys.title')}</h2>
      <p className="integration-card-description">{t('subtitles.keys.description')}</p>
      {SUBTITLE_KEY_ROWS.map((provider, row) => {
        const status = statuses.find((item) => item.provider === provider)
        const actions = subtitleKeyActions(status)
        const feedbackLabel = hasDefault ? subtitleKeyFeedbackLabel(feedback?.[provider]) : undefined
        return (
          <div key={provider} className="integration-card-fact" data-provider={provider}>
            <p className="integration-card-description">
              {`${SUBTITLE_PROVIDER_NAME[provider]} — ${t(subtitleKeyStateLabel(status, hasDefault))}`}
              {status?.maskedKey ? ` (${status.maskedKey})` : ''}
            </p>
            {feedbackLabel && <p className="integration-card-description" role="status">{t(feedbackLabel)}</p>}
            <div className="integration-card-actions">
              {actions.map((action, col) => (
                <Button
                  key={action}
                  variant={action === 'add' ? 'accent' : 'secondary'}
                  focused={focusedRow === row && focusedCol === col}
                  loading={action === 'test' && testing === provider}
                  onSelect={() => onActivate(row, col)}
                >
                  {t(SUBTITLE_KEY_ACTION_LABEL[action])}
                </Button>
              ))}
            </div>
          </div>
        )
      })}
      {refresh && (
        <>
          <div className="integration-card-actions" data-row="subtitle-refresh">
            <Button
              variant="secondary"
              focused={focusedRow === SUBTITLE_KEY_ROWS.length}
              loading={refresh.status === 'loading'}
              softDisabled={refresh.paused}
              onSelect={() => onActivate(SUBTITLE_KEY_ROWS.length, 0)}
            >
              {t('portal.refresh.label')}
            </Button>
          </div>
          {!hasResultMessage && <RefreshStatusLine action={refresh} scope="subtitles" />}
        </>
      )}
    </section>
  )
}
