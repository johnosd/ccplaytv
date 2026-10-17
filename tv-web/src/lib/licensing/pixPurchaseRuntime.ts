/**
 * Abridor da tela de Pix (feature 073, D-010). Configurações → Portal & licença (`features/settings`) não pode
 * importar `features/portal` (ratchet de arquitetura), então pede a tela por aqui; quem registra e renderiza é
 * `usePortalIntegration` — mesmo padrão de `registerPortalRefresh` em `lib/portal/portalRuntime.ts`.
 */
export interface PixPurchaseRequest {
  /** Pagamento aprovado e licença recebida. */
  onLicensed(): void
  /** RETURN/Voltar na tela de Pix. */
  onBack(): void
}

type Opener = (request: PixPurchaseRequest) => void
let opener: Opener | undefined

export function registerPixPurchaseOpener(handler: Opener) {
  opener = handler
  return () => { if (opener === handler) opener = undefined }
}

/** `false` quando não há portal configurado (o botão fica soft-disabled e explica). */
export function openPixPurchase(request: PixPurchaseRequest): boolean {
  if (!opener) return false
  opener(request)
  return true
}
