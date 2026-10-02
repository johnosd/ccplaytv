import type { ReactNode } from 'react'
import { OfflineBanner } from '../../components/OfflineBanner'
import { HintBar, type HintItem } from './HintBar'

export interface AppShellProps {
  /** A `TopBar` já montada — quem usa o shell decide o foco dela. */
  topBar: ReactNode
  /** Teclas úteis do contexto atual (FR-021). */
  hints: HintItem[]
  children: ReactNode
}

/**
 * Moldura do Início (feature 023, D-002 do plan.md): topbar, banner de
 * conexão, conteúdo e a `HintBar`, dentro da safe zone do palco 1920×1080.
 * O banner é só um sinal — nunca bloqueia a navegação; o catálogo local
 * continua disponível offline (ADR-002). A ação "Tentar de novo" é um item da
 * topbar, alcançável pelo controle remoto (feature 042, D-007).
 */
export function AppShell({ topBar, hints, children }: AppShellProps): ReactNode {
  return (
    <div className="app-shell">
      {topBar}
      <OfflineBanner />
      <main className="app-shell-content">{children}</main>
      <HintBar hints={hints} />
    </div>
  )
}
