import type { ReactNode } from 'react'
import { OfflineBanner } from '../../components/OfflineBanner'
import { HintBar, type HintItem } from './HintBar'

export interface AppShellProps {
  /** A `TopBar` já montada — quem usa o shell decide o foco dela. */
  topBar: ReactNode
  /** Teclas úteis do contexto atual (FR-021). */
  hints: HintItem[]
  children: ReactNode
  /** Opcional. Padrão: re-lê o estado real do navegador (`recheckConnection`). */
  onTestConnection?: () => void
}

/**
 * "Testar conexão" sem inventar conectividade: a única fonte da verdade é
 * `navigator.onLine`, que `useOnlineStatus` já lê e escuta. Republicar o
 * evento correspondente ao valor real faz o banner se recalcular sem
 * consultar rede nenhuma.
 */
function recheckConnection() {
  window.dispatchEvent(new Event(navigator.onLine ? 'online' : 'offline'))
}

/**
 * Moldura do Início (feature 023, D-002 do plan.md): topbar, banner de
 * conexão, conteúdo e a `HintBar`, dentro da safe zone do palco 1920×1080.
 * O banner é só um sinal — nunca bloqueia a navegação; o catálogo local
 * continua disponível offline (ADR-002).
 */
export function AppShell({ topBar, hints, children, onTestConnection = recheckConnection }: AppShellProps): ReactNode {
  return (
    <div className="app-shell">
      {topBar}
      <OfflineBanner onTestConnection={onTestConnection} />
      <main className="app-shell-content">{children}</main>
      <HintBar hints={hints} />
    </div>
  )
}
