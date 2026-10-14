import type { ReactNode } from 'react'
import { OfflineBanner } from '../../components/OfflineBanner'
import { HintBar, type HintItem } from './HintBar'

export interface AppShellProps {
  /** A `TopBar` já montada — quem usa o shell decide o foco dela. */
  topBar: ReactNode
  /** Teclas úteis do contexto atual (FR-021). Sem hints, não há rodapé (Filmes/Séries, feature 052). */
  hints?: HintItem[]
  /**
   * Feature 060 (D-004): camada de fundo da tela (ex.: o fundo ambiente do Início), atrás da topbar e do conteúdo. Fica
   * DENTRO do shell — que é filho do `.screen` — para sumir junto com ele quando o player abre (plano de hardware, FR-027);
   * nunca estilo no próprio `.screen`. Sem a prop o DOM é idêntico ao de antes.
   */
  backdrop?: ReactNode
  children: ReactNode
}

/**
 * Moldura do Início (feature 023, D-002 do plan.md): topbar, banner de
 * conexão, conteúdo e a `HintBar`, dentro da safe zone do palco 1920×1080.
 * O banner é só um sinal — nunca bloqueia a navegação; o catálogo local
 * continua disponível offline (ADR-002). A ação "Tentar de novo" é um item da
 * topbar, alcançável pelo controle remoto (feature 042, D-007).
 */
export function AppShell({ topBar, hints, backdrop, children }: AppShellProps): ReactNode {
  return (
    <div className={backdrop ? 'app-shell app-shell--backdrop' : 'app-shell'}>
      {backdrop && (
        <div className="app-shell-backdrop" aria-hidden="true">
          {backdrop}
        </div>
      )}
      {topBar}
      <OfflineBanner />
      <main className="app-shell-content">{children}</main>
      {hints && <HintBar hints={hints} />}
    </div>
  )
}
