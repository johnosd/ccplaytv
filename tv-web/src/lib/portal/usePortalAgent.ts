import { useEffect } from 'react'
import type { CatalogDb } from '../catalog/db'
import { sharedPortalAgent, type PortalAgentPorts } from './portalAgent'
import { registerPortalRefresh } from './portalRuntime'
import { onLocalSourceChanged } from './sourceChangeSignal'

/** Montar no App com portas estáveis. Sem timers: só registra o Atualizar e acompanha visibilidade/rede. */
export function usePortalAgent(database: CatalogDb, ports: PortalAgentPorts, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const agent = sharedPortalAgent(database, ports)
    const lifecycle = () => agent.lifecycle(document.visibilityState !== 'hidden', navigator.onLine)
    lifecycle()
    const detach = agent.attach()
    const unregister = registerPortalRefresh(scope => agent.refresh(scope))
    // 071/FR-008: criar/editar uma lista tenta o envio no ato (uma tentativa; falha mantém a fila).
    const unlisten = onLocalSourceChanged(() => agent.uploadNow())
    document.addEventListener('visibilitychange', lifecycle)
    window.addEventListener('online', lifecycle)
    window.addEventListener('offline', lifecycle)
    window.addEventListener('pageshow', lifecycle)
    const hide = () => agent.lifecycle(false, navigator.onLine)
    window.addEventListener('pagehide', hide)
    return () => {
      document.removeEventListener('visibilitychange', lifecycle)
      window.removeEventListener('online', lifecycle)
      window.removeEventListener('offline', lifecycle)
      window.removeEventListener('pageshow', lifecycle)
      window.removeEventListener('pagehide', hide)
      unregister()
      unlisten()
      detach()
    }
  }, [database, ports, enabled])
}
