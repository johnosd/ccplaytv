import type { ReactNode } from 'react'

export interface AboutPanelProps {
  focused: boolean
}

/**
 * Sobre & créditos (feature 026, US2 — FR-030): nome e versão reais do
 * app (`__APP_VERSION__`, D-012 do plan.md) e as licenças das fontes
 * embarcadas. Sem atribuição de serviço que o app não usa (nunca TMDB
 * enquanto o app não consumir a API de verdade).
 */
export function AboutPanel({ focused }: AboutPanelProps): ReactNode {
  return (
    <div className="about-panel">
      <div className={`about-panel-version no-scale${focused ? ' tv-focus' : ''}`}>
        <span className="about-panel-name">CCPlayTV</span>
        <span className="about-panel-value">Versão {__APP_VERSION__}</span>
      </div>
      <div className="about-panel-licenses">
        <p className="about-panel-licenses-title">Licenças das fontes tipográficas</p>
        <p>Poppins — SIL Open Font License 1.1</p>
        <p>Inter — SIL Open Font License 1.1</p>
      </div>
    </div>
  )
}
