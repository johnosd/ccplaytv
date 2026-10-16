/**
 * Compra da licença por Pix na TV (feature 073, US1). Só fala com o serviço por ação da pessoa: abrir a tela de
 * pagamento (SELECT em "Comprar licença"), "Gerar novo Pix" e "Atualizar" (ADR-016). Nenhum timer consulta.
 * O código copia-e-cola e os ids de pagamento nunca vão para log, erro ou diagnóstico (FR-012).
 */
import type { PortalDeviceRecord } from '../portal/portalTables'
import { PortalRequestError } from '../portal/portalClient'

/** Estado do Pix como o serviço o vê; `approved` só depois da confirmação confiável do provedor (FR-008). */
export type PixState = 'pending' | 'expired' | 'approved' | 'refused' | 'cancelled'

export interface PixCharge {
  orderId: string
  state: PixState
  /** Código Pix copia-e-cola (EMV, começa por `000201`); presente só em `pending`. Desenha o QR na TV. */
  qrCode?: string
  /** Prazo do Pix em ms, pelo relógio do serviço (nunca o da TV). */
  expiresAt?: number
  /** Relógio do serviço no momento da resposta (ms), para mostrar o prazo sem confiar no relógio da TV. */
  serverTime: number
  priceMinor: 3500
  termMonths: 12
  /** ID exibido da TV beneficiária (formato MAC). */
  displayId?: string
}

export interface PixRefreshResult {
  charge: PixCharge
  /** `true` só quando o pagamento foi aprovado E a licença nova chegou à TV (Atualizar de licença ok). */
  licensed: boolean
}

/** Porta usada pela tela; a implementação real sai de `createPixPurchase`. */
export interface PixPurchasePort {
  /** `renew: true` só por "Gerar novo Pix" (FR-004); `false` reaproveita o Pix pendente válido. */
  open(options: { renew: boolean }, signal?: AbortSignal): Promise<PixCharge>
  /** "Atualizar" da tela: consulta o pedido e, se aprovado, busca a licença (FR-005/FR-006). */
  refresh(orderId: string, signal?: AbortSignal): Promise<PixRefreshResult>
}

export interface PixPurchaseDeps {
  /** Transporte do portal (`createPortalClient(...).request`): rota fixa, sem query, erro sanitizado. */
  request<T>(path: string, init: { bearer?: string; body?: unknown; signal?: AbortSignal; method?: 'GET' | 'POST' | 'PUT' | 'DELETE' }): Promise<T>
  /** Dispositivo cadastrado (cadastro preguiçoso da 071 acontece aqui, se preciso). */
  device(): Promise<Pick<PortalDeviceRecord, 'bearer' | 'displayId'>>
  /** Atualizar de licença (o mesmo do bloqueio): `refreshPortal('license')`. */
  refreshLicense(): Promise<{ ok: boolean; code?: string }>
  /** Id de tentativa para idempotência do pedido; injetável em teste. */
  newRequestId?(): string
}

const STATES = new Set<PixState>(['pending', 'expired', 'approved', 'refused', 'cancelled'])
const ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/
const DISPLAY_ID = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/
const PRINTABLE = /^[\x20-\x7E]+$/

function randomRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function time(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Valida a resposta do serviço; qualquer desvio vira erro sanitizado, sem ecoar o corpo. */
export function parsePixCharge(value: unknown): PixCharge {
  const invalid = () => new PortalRequestError('service_unavailable')
  if (!value || typeof value !== 'object') throw invalid()
  const body = value as Record<string, unknown>
  const state = body.state as PixState
  if (typeof body.orderId !== 'string' || !ORDER_ID.test(body.orderId) || !STATES.has(state) ||
      body.priceMinor !== 3500 || body.termMonths !== 12) throw invalid()
  const serverTime = time(body.serverTime)
  if (serverTime === undefined) throw invalid()
  const charge: PixCharge = { orderId: body.orderId, state, serverTime, priceMinor: 3500, termMonths: 12 }
  if (body.qrCode !== undefined) {
    const qr = body.qrCode
    if (typeof qr !== 'string' || qr.length > 1024 || !qr.startsWith('000201') || !PRINTABLE.test(qr)) throw invalid()
    charge.qrCode = qr
  }
  if (state === 'pending' && !charge.qrCode) throw invalid()
  if (body.expiresAt !== undefined) {
    const expiresAt = time(body.expiresAt)
    if (expiresAt === undefined) throw invalid()
    charge.expiresAt = expiresAt
  }
  if (body.displayId !== undefined) {
    if (typeof body.displayId !== 'string' || !DISPLAY_ID.test(body.displayId)) throw invalid()
    charge.displayId = body.displayId
  }
  return charge
}

export function createPixPurchase(deps: PixPurchaseDeps): PixPurchasePort {
  const newRequestId = deps.newRequestId ?? randomRequestId
  // Um id por intenção de compra: repetir "abrir" depois de falha reaproveita o mesmo pedido no serviço.
  let requestId: string | undefined
  return {
    async open({ renew }, signal) {
      if (renew || !requestId) requestId = newRequestId()
      const device = await deps.device()
      const charge = parsePixCharge(await deps.request<unknown>('/portal/v1/device/orders/pix',
        { bearer: device.bearer, body: { renew, requestId }, signal }))
      // Pedido terminado: a próxima abertura é outra intenção (outro pedido no serviço).
      if (charge.state !== 'pending' && charge.state !== 'expired') requestId = undefined
      return charge
    },
    async refresh(orderId, signal) {
      const device = await deps.device()
      const charge = parsePixCharge(await deps.request<unknown>('/portal/v1/device/orders/pix/refresh',
        { bearer: device.bearer, body: { orderId }, signal }))
      if (charge.state !== 'approved') return { charge, licensed: false }
      requestId = undefined
      const outcome = await deps.refreshLicense()
      return { charge, licensed: outcome.ok }
    },
  }
}
