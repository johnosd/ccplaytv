import { db } from '../catalog/db'
import { createPortalClient } from './portalClient'
import { PortalConnection } from './portalConnection'

let connection: PortalConnection | undefined
/** Sem configuração não inicia rede nem cria identidade alternativa no desktop. */
export function getPortalConnection(): PortalConnection | undefined {
  const origin = import.meta.env.VITE_PORTAL_ORIGIN as string | undefined
  if (!origin) return undefined
  if (!connection) {
    const client = createPortalClient({ origin, allowLocalHttp: import.meta.env.DEV })
    connection = new PortalConnection(db, client, origin, () => {
      const api = (globalThis as typeof globalThis & { webapis?: { productinfo?: { getDuid?: () => string } } }).webapis
      if (!api?.productinfo?.getDuid) throw new Error('platform_identity_unavailable')
      return api.productinfo.getDuid()
    })
  }
  return connection
}
const listeners = new Set<() => void>()
let quickReferences = 0
export function portalQuickMode() { return quickReferences > 0 }
export function subscribePortalQuick(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function acquirePortalQuick() {
  quickReferences++
  for (const listener of listeners) listener()
  let released = false
  return () => {
    if (released) return
    released = true
    quickReferences--
    for (const listener of listeners) listener()
  }
}
