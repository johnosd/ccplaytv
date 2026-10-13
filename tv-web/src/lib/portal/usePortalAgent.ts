import { useEffect } from 'react'
import type { CatalogDb } from '../catalog/db'
import { sharedPortalAgent, type PortalAgentPorts } from './portalAgent'
import { registerPortalSyncNow } from './portalRuntime'

/** Montar no App com portas estáveis; quick só para QR/configuração/compra aberta. */
export function usePortalAgent(database: CatalogDb, ports: PortalAgentPorts, quick = false, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const agent = sharedPortalAgent(database, ports)
    const lifecycle = () => agent.lifecycle(document.visibilityState !== 'hidden', navigator.onLine)
    lifecycle()
    const detach = agent.attach(quick)
    const unregister = registerPortalSyncNow(() => agent.syncNow())
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
      detach()
    }
  }, [database, ports, quick, enabled])
}
