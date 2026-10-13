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
      if (api?.productinfo?.getDuid) return api.productinfo.getDuid()
      // Somente `npm run dev:portal`: `import.meta.env.DEV` é falso no build, então este ramo é removido do
      // pacote e a identidade alternativa nunca existe em produção/TV.
      const devDuid = import.meta.env.DEV ? (import.meta.env.VITE_PORTAL_DEV_DUID as string | undefined) : undefined
      if (devDuid) return devDuid
      throw new Error('platform_identity_unavailable')
    }, () => {
      // 070/D-002: MAC opcional (Samsung Product API); ausente/negado → o servidor gera o ID.
      const network = (globalThis as typeof globalThis & { webapis?: { network?: { getMac?: () => string } } }).webapis?.network
      if (!network?.getMac) throw new Error('mac_unavailable')
      return network.getMac()
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

/** 070/D-011: "Recarregar" da tela Adicionar dispara um ciclo do agente montado no App, se houver um. */
type SyncNow = () => Promise<{ ok: boolean; code?: string }>
let syncNowHandler: SyncNow | undefined
export function registerPortalSyncNow(handler: SyncNow) {
  syncNowHandler = handler
  return () => { if (syncNowHandler === handler) syncNowHandler = undefined }
}
export function portalSyncNow(): Promise<{ ok: boolean; code?: string }> {
  return syncNowHandler ? syncNowHandler() : Promise.resolve({ ok: false, code: 'unavailable' })
}
