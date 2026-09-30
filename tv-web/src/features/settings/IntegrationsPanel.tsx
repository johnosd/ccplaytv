import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { ComingSoon } from '../../components/ComingSoon'
import type { TmdbStatusView } from '../../lib/metadata/types'
import {
  INTEGRATION_SOON_CARDS,
  TMDB_ACTION_LABEL,
  TMDB_STATE_LABEL,
  tmdbActions,
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
}

function formatWhen(epochMs: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(epochMs))
}

/**
 * Integrações & BYOK (feature 032, US2, `logic/integracoes-e-dock.md` §1):
 * card real do TMDB (estado, chave só mascarada, capacidades, atribuição e as
 * ações) + cards "Em breve" para IA, Clima e Teste de velocidade. Foco por
 * estado (ADR-009), como `AccessibilityPanel`: sempre há um elemento
 * focável, em qualquer estado.
 */
export function IntegrationsPanel({ status, focusedRow, focusedCol, testing, onActivate }: IntegrationsPanelProps): ReactNode {
  const view: TmdbStatusView = status ?? { state: 'not_configured' }
  const actions = tmdbActions(view)

  return (
    <div className="integrations-panel">
      <section className="integration-card" aria-label="TMDB">
        <header className="integration-card-header">
          <h2 className="integration-card-title">TMDB</h2>
          <span className="integration-card-state" data-state={view.state}>
            {TMDB_STATE_LABEL[view.state]}
          </span>
        </header>
        <p className="integration-card-description">
          Sinopses, imagens e detalhes de filmes e séries que a sua lista não traz. Usa a sua própria chave da conta TMDB.
        </p>
        <dl className="integration-card-facts">
          {view.maskedKey && (
            <div className="integration-card-fact">
              <dt>Chave</dt>
              <dd>
                {view.maskedKey}
                {view.format ? ` (${view.format})` : ''}
              </dd>
            </div>
          )}
          {view.lastTestedAt !== undefined && (
            <div className="integration-card-fact">
              <dt>Última verificação</dt>
              <dd>{formatWhen(view.lastTestedAt)}</dd>
            </div>
          )}
          <div className="integration-card-fact">
            <dt>Usado para</dt>
            <dd>Metadata, Imagens</dd>
          </div>
        </dl>
        <p className="integration-card-attribution">
          Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
        </p>
        <div className="integration-card-actions">
          {actions.map((action, col) => (
            <Button
              key={action}
              variant={action === 'remove' ? 'secondary' : action === 'configure' ? 'accent' : 'secondary'}
              focused={focusedRow === 0 && focusedCol === col}
              loading={action === 'test' && testing}
              onSelect={() => onActivate(0, col)}
            >
              {TMDB_ACTION_LABEL[action]}
            </Button>
          ))}
        </div>
      </section>

      {INTEGRATION_SOON_CARDS.map((card, index) => (
        <section key={card.id} className="integration-card integration-card--soon" aria-label={card.title}>
          <h2 className="integration-card-title">{card.title}</h2>
          {/* Sem `onSelect`: `ComingSoon` já anuncia "Em breve" no clique; o teclado passa por `onActivate` na tela. */}
          <ComingSoon id={card.id} focused={focusedRow === index + 1} />
        </section>
      ))}
    </div>
  )
}
