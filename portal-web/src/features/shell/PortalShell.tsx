import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../../lib/i18n'
import { NavBar } from './NavBar'
import { TvSummary } from './TvSummary'
import type { Destination, NavState } from './navigation'

/**
 * Casca autenticada (feature 077): resumo da TV, conteúdo e a navegação única (barra inferior no celular, lateral no
 * PC). Ao trocar de destino/sub-tela, rola ao topo e leva o foco ao título da nova tela (`[data-page-title]`).
 */
export function PortalShell({ state, onGo, children }: { state: NavState; onGo: (destination: Destination) => void; children: ReactNode }) {
  const t = useT()
  // Compara com a tela anterior (e não com "primeira execução"): o StrictMode repete o efeito e tomaria o foco no carregamento.
  const shown = useRef(state.destination + '|' + state.view)
  useEffect(() => {
    const now = state.destination + '|' + state.view
    if (shown.current === now) return
    shown.current = now
    window.scrollTo(0, 0)
    // Só toma o foco se ninguém o tem (o controle clicado sumiu); o item de origem de uma sub-tela o reivindica antes.
    const active = document.activeElement
    if (!active || active === document.body) document.querySelector<HTMLElement>('[data-page-title]')?.focus()
  }, [state.destination, state.view])
  return <div className="portal-shell" lang={t('lang')} data-view={state.view || undefined}>
    <NavBar current={state.destination} onSelect={onGo} />
    <main className="portal-main">
      <TvSummary onRenew={() => onGo('license')} />
      <div className="portal-content">{children}</div>
    </main>
  </div>
}
