interface TizenGlobal {
  application?: {
    getCurrentApplication?: () => { exit: () => void }
  }
}

/**
 * Encerra o app Tizen (Web API do widget). Fora da TV — navegador de
 * desenvolvimento — `window.tizen` não existe, então isso vira um no-op
 * silencioso em vez de lançar erro.
 */
export function exitApp(): void {
  const tizen = (window as unknown as { tizen?: TizenGlobal }).tizen
  const app = tizen?.application?.getCurrentApplication?.()
  app?.exit()
}
