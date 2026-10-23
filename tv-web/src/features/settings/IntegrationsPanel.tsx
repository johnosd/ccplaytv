import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { RefreshStatusLine } from '../../components/RefreshButton'
import type { RefreshAction } from '../../lib/portal/useRefreshAction'
import { ComingSoon } from '../../components/ComingSoon'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_LOCALE } from '../../lib/i18n/languages'
import type { TmdbStatusView } from '../../lib/metadata/types'
import type { SpeedTestResult } from '../../lib/network/speedTest'
import { SpeedTestMetrics } from './SpeedTestMetrics'
import {
  INTEGRATION_SOON_CARDS,
  TMDB_ACTION_LABEL_KEY,
  TMDB_STATE_CODE,
  TMDB_STATE_LABEL_KEY,
  tmdbActions,
  SOON_ROW_START,
  SPEED_TEST_ROW,
} from './integrationsModel'

export interface IntegrationsPanelProps {
  /** `undefined` enquanto a leitura local ainda não voltou — tratado como "Não configurado" (a leitura é só IndexedDB). */
  status: TmdbStatusView | undefined
  /** `undefined` = nenhuma linha focada agora (zona `tabs`) — nada ganha `.tv-focus`. */
  focusedRow?: number
  /** Coluna de ação dentro da linha 0 (card do TMDB). */
  focusedCol: number
  /** "Testar" em andamento — a ação ignora novo OK e sinaliza `aria-busy`. */
  testing: boolean
  onActivate: (row: number, col: number) => void
  /** Atualizar da chave TMDB (busca a chave enviada pelo portal); a linha de resultado fica logo abaixo das ações. */
  refresh: RefreshAction
  /** Último resultado salvo (só leitura do IndexedDB); `undefined` = nenhum teste salvo. */
  lastSpeedTest?: SpeedTestResult
  speedTestReadFailed?: boolean
  /** Seção "Legendas" (chaves pessoais, feature 090): fica logo abaixo do card do TMDB. */
  subtitleKeys?: ReactNode
}

function formatWhen(epochMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(epochMs))
}

/**
 * Integrações & BYOK (feature 032, US2, `logic/integracoes-e-dock.md` §1):
 * card real do TMDB (estado, chave só mascarada, capacidades, atribuição e as
 * ações), diagnóstico de conexão real e cards "Em breve" para IA e Clima. Foco por
 * estado (ADR-009), como `AccessibilityPanel`: sempre há um elemento
 * focável, em qualquer estado.
 */
export function IntegrationsPanel({ status, focusedRow, focusedCol, testing, onActivate, refresh, lastSpeedTest, speedTestReadFailed, subtitleKeys }: IntegrationsPanelProps): ReactNode {
  const t = useT()
  const language = useLanguage()
  const view: TmdbStatusView = status ?? { state: 'not_configured' }
  const actions = tmdbActions(view)

  return (
    <div className="integrations-panel">
      <section className="integration-card" aria-label="TMDB">
        <header className="integration-card-header">
          <h2 className="integration-card-title">TMDB</h2>
          <span className="integration-card-state" data-state={view.state}>
            {t(TMDB_STATE_LABEL_KEY[view.state])}
          </span>
          {TMDB_STATE_CODE[view.state] && (
            <span data-testid="tmdb-state-code" className="error-state-code">
              {TMDB_STATE_CODE[view.state]}
            </span>
          )}
        </header>
        <p className="integration-card-description">{t('settings.integrations.tmdbDescription')}</p>
        <dl className="integration-card-facts">
          {view.maskedKey && (
            <div className="integration-card-fact">
              <dt>{t('settings.integrations.key')}</dt>
              <dd>
                {view.maskedKey}
                {view.format ? ` (${view.format})` : ''}
              </dd>
            </div>
          )}
          {view.lastTestedAt !== undefined && (
            <div className="integration-card-fact">
              <dt>{t('settings.integrations.lastTested')}</dt>
              <dd>{formatWhen(view.lastTestedAt, APP_LANGUAGE_LOCALE[language])}</dd>
            </div>
          )}
          <div className="integration-card-fact">
            <dt>{t('settings.integrations.usedFor')}</dt>
            <dd>{t('settings.integrations.usedForValue')}</dd>
          </div>
        </dl>
        <p className="integration-card-attribution">{t('settings.integrations.attribution')}</p>
        <div className="integration-card-actions">
          {actions.map((action, col) => (
            <Button
              key={action}
              variant={action === 'remove' ? 'secondary' : action === 'configure' ? 'accent' : 'secondary'}
              focused={focusedRow === 0 && focusedCol === col}
              loading={(action === 'test' && testing) || (action === 'refresh' && refresh.status === 'loading')}
              softDisabled={action === 'refresh' && refresh.paused}
              onSelect={() => onActivate(0, col)}
            >
              {t(TMDB_ACTION_LABEL_KEY[action])}
            </Button>
          ))}
        </div>
        <RefreshStatusLine action={refresh} scope="tmdb" />
      </section>

      {subtitleKeys}

      {INTEGRATION_SOON_CARDS.map((card, index) => (
        <section key={card.id} className="integration-card integration-card--soon" aria-label={t(card.titleKey)}>
          <h2 className="integration-card-title">{t(card.titleKey)}</h2>
          {/* Sem `onSelect`: `ComingSoon` já anuncia "Em breve" no clique; o teclado passa por `onActivate` na tela. */}
          <ComingSoon id={card.id} focused={focusedRow === SOON_ROW_START + index} />
        </section>
      ))}
      <section className="integration-card" data-service="speedtest" aria-label={t('settings.speed.title')}>
        <h2 className="integration-card-title">{t('settings.speed.title')}</h2>
        <p className="integration-card-description">{t('settings.speed.destination')}</p>
        <p className="integration-card-description">{t('settings.speed.description')}</p>
        {lastSpeedTest !== undefined
          ? <>
            <p className="integration-card-description">{`${t('settings.speed.last')} · ${formatWhen(lastSpeedTest.measuredAt, APP_LANGUAGE_LOCALE[language])}`}</p>
            <SpeedTestMetrics result={lastSpeedTest} label={t('settings.speed.last')} />
          </>
          : <p className="integration-card-description">{t('settings.speed.empty')}</p>}
        {speedTestReadFailed && <p className="integration-card-description">{t('settings.speed.storage')}</p>}
        <Button variant="accent" focused={focusedRow === SPEED_TEST_ROW} onSelect={() => onActivate(SPEED_TEST_ROW, 0)}>{t('settings.speed.open')}</Button>
      </section>
    </div>
  )
}
