import { db } from '../catalog/db'
import { createPortalClient } from './portalClient'
import type { RefreshScope } from './portalAgent'
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
/**
 * 071/D-003: o botão Atualizar das telas chama o agente montado no App. Não há mais modo "rápido" nem consulta
 * periódica: só esta chamada (e o envio imediato de uma exclusão) fala com o serviço.
 */
type RefreshHandler = (scope: RefreshScope) => Promise<{ ok: boolean; code?: string }>
let refreshHandler: RefreshHandler | undefined
export function registerPortalRefresh(handler: RefreshHandler) {
  refreshHandler = handler
  return () => { if (refreshHandler === handler) refreshHandler = undefined }
}
export function refreshPortal(scope: RefreshScope): Promise<{ ok: boolean; code?: string }> {
  return refreshHandler ? refreshHandler(scope) : Promise.resolve({ ok: false, code: 'unavailable' })
}
/** 072: Desvincular aborta o que o agente estiver fazendo e esquece pausas (nada é reagendado). */
let resetHandler: (() => void) | undefined
export function registerPortalReset(handler: () => void) {
  resetHandler = handler
  return () => { if (resetHandler === handler) resetHandler = undefined }
}
export function resetPortalAgent() { resetHandler?.() }