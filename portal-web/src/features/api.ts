/** API same-origin; erros nunca propagam corpo ou exceção de fetch. */
export class PortalApiError extends Error {
  constructor(readonly code: 'access' | 'conflict' | 'invalid' | 'network' | 'limited', readonly retryAfter = 0) {
    super(code)
  }
}
export interface Session { deviceId: string; csrfToken: string; expiresAt: string }
export interface Source { id: string; type: 'provider_credentials' | 'm3u_url'; displayName: string;
  connectionState?: string; updatedAt?: number }
export interface ConfigurationValues {
  type: Source['type']; displayName: string; m3uUrl?: string; providerDns?: string;
  providerUsername?: string; providerPassword?: string; epgManualUrl?: string;
  epgOffsetHours?: number; epgDisabled?: boolean
}
export interface SavedConfiguration { sourceId: string; type: Source['type']; displayName: string;
  configVersion: string; appliedRevision: number | null; expectedRevision: number; operationId: string | null }
export interface Operation { operationId: string; sourceId: string; action: string; state: string;
  expectedRevision: number; createdAt: string; importState: string | null; receipt: { revision: number; state: string } | null }
export interface Snapshot { capturedAt: string; sources: Source[]; revisions: { sourceId: string; revision: number }[];
  /** 077: o que a TV informou sobre integrações (ausente em TV antiga). Nunca o valor da chave. */
  integrations?: { tmdb: 'none' | 'configured' } | null }
export interface Dashboard { configurations: SavedConfiguration[]; operations: Operation[]; snapshot: Snapshot | null; stale: boolean }
export interface ConfigurationInput { type?: Source['type']; displayName?: string; providerDns?: string;
  providerUsername?: string; providerPassword?: string; m3uUrl?: string; epgManualUrl?: string;
  epgOffsetHours?: number; epgDisabled?: boolean; clearFields?: string[] }
const opaque = /^[A-Za-z0-9_-]{1,128}$/
export function newOperationId(now = Date.now()) {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const nonce = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return 'op-' + now + '-' + nonce
}
/**
 * Sessão da aba (T034): a ida ao Checkout Pro do Mercado Pago recarrega a página, e o CSRF só existe na resposta do
 * login (o servidor guarda o hash). Fica no `sessionStorage` desta aba até a validade; sem o cookie `httpOnly` ele não
 * autoriza nada, e a retomada confere a sessão no servidor antes de abrir o painel.
 */
const SESSION_KEY = 'ccplay-portal-session'
export function rememberSession(session: Session | undefined, storage: Pick<Storage, 'setItem' | 'removeItem'> = sessionStorage) {
  try {
    // Só os três campos, nunca o objeto recebido inteiro.
    if (session) storage.setItem(SESSION_KEY, JSON.stringify({ deviceId: session.deviceId, csrfToken: session.csrfToken, expiresAt: session.expiresAt }))
    else storage.removeItem(SESSION_KEY)
  } catch { /* Sem storage: só não retoma. */ }
}
export function storedSession(storage: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage, now = Date.now()): Session | undefined {
  try {
    const value: unknown = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null')
    const { deviceId, csrfToken, expiresAt } = (value ?? {}) as Record<string, unknown>
    if (typeof deviceId === 'string' && opaque.test(deviceId) && typeof csrfToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(csrfToken) &&
      typeof expiresAt === 'string' && Date.parse(expiresAt) > now) return { deviceId, csrfToken, expiresAt }
    storage.removeItem(SESSION_KEY)
  } catch { /* Valor corrompido ou storage indisponível = sem sessão guardada. */ }
  return undefined
}
export interface RecoverySession extends Session { claimId: string }
export function newRecoveryId() { return newOperationId().slice(17) }
export type PortalEntry = { kind: 'invite' | 'recovery'; token: string } | { kind: 'device'; displayId: string; deviceKey: string }
/** ID no formato MAC (aceita `:`/`-`/`.`/minúsculas) → `XX:XX:XX:XX:XX:XX`; forma inválida = undefined. */
function normalizeFragmentId(value: string) {
  const compact = value.trim().replace(/[:.-]/g, '').toUpperCase()
  return /^[0-9A-F]{12}$/.test(compact) ? compact.match(/../g)!.join(':') : undefined
}
/**
 * Consome o fragmento da URL (convite, recuperação ou QR fixo `#id=&key=`, feature 071/D-008) e o remove do endereço
 * e do histórico ANTES de qualquer requisição ou renderização. O QR fixo carrega ID e chave: nunca vão a path/query.
 * Fragmento ambíguo ou malformado vira "sem entrada" (o formulário manual aparece), sem ecoar o valor.
 */
export function takeEntry(location: { hash: string; pathname: string; search: string },
  history: { replaceState: (data: unknown, unused: string, url: string) => void }): PortalEntry | undefined {
  const hash = location.hash
  if (hash) history.replaceState(null, '', location.pathname + location.search)
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const device = params.has('id') || params.has('key')
  if ((params.has('invite') && params.has('recovery')) || (device && (params.has('invite') || params.has('recovery')))) return undefined
  if (device) {
    const displayId = normalizeFragmentId(params.get('id') ?? '')
    const deviceKey = params.get('key') ?? ''
    return displayId && /^\d{10}$/.test(deviceKey) ? { kind: 'device', displayId, deviceKey } : undefined
  }
  const kind = params.has('recovery') ? 'recovery' : 'invite'
  const token = params.get(kind)
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? { kind, token } : undefined
}
export function takeInvite(location: { hash: string; pathname: string; search: string },
  history: { replaceState: (data: unknown, unused: string, url: string) => void }): string | undefined {
  const entry = takeEntry(location, history)
  return entry?.kind === 'invite' ? entry.token : undefined
}
async function request<T>(path: string, options: { method?: string; body?: unknown; csrf?: string; operationId?: string } = {}): Promise<T> {
  if (!new RegExp('^/[a-zA-Z0-9_/?=&.-]+$').test(path) || path.includes('..') || path.includes('//')) throw new PortalApiError('invalid')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/portal/v1' + path, {
      method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: controller.signal, headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}), ...(options.operationId ? { 'Idempotency-Key': options.operationId } : {}) },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'access'
        : response.status === 409 || response.status === 410 ? 'conflict'
        : response.status === 422 || response.status === 413 ? 'invalid' : response.status === 429 ? 'limited' : 'network'
      const retry = Number(response.headers.get('retry-after'))
      throw new PortalApiError(code, Number.isFinite(retry) && retry > 0 ? Math.min(retry, 86400) : 0)
    }
    if (response.status === 204) return undefined as T
    const reader = response.body?.getReader()
    if (!reader) throw new PortalApiError('network')
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 1048576) { await reader.cancel(); throw new PortalApiError('network') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch (error) {
    if (error instanceof PortalApiError) throw error
    throw new PortalApiError('network')
  } finally { clearTimeout(timer) }
}
async function pages<T>(path: string, field: string): Promise<T[]> {
  const rows: T[] = []
  let after: string | null = null
  for (let page = 0; page < 20; page++) {
    const body: Record<string, unknown> = await request(path + (after ? '?after=' + after : ''))
    if (!Array.isArray(body[field]) || body[field].length > 99) throw new PortalApiError('network')
    rows.push(...body[field] as T[])
    const next = body.nextAfter
    if (next === null) return rows
    if (typeof next !== 'string' || !opaque.test(next) || next === after) throw new PortalApiError('network')
    after = next
  }
  throw new PortalApiError('network')
}
/** 073/D-007: pedido em aberto da TV (Pix gerado na TV ou checkout iniciado aqui), nunca com o copia-e-cola. */
export interface PendingOrder { orderId: string; method: 'pix' | 'checkout'; expiresAt: string | null }
export interface LicenseDevice { deviceId: string; displayId?: string; license: { state: 'trial' | 'active' | 'revoked'; startsAt: number; expiresAt: number; generation: number; serverTime: number }; pendingOrder?: PendingOrder | null }
export type LicenseState = LicenseDevice['license']['state']
/** Rótulo da compra: "Renovar" para quem já pagou (mesmo vencida), "Comprar" no teste ou sem licença paga. */
export const purchaseLabel = (state: LicenseState | undefined) => state === 'active' ? 'renewLicense' as const : 'buyLicense' as const
export interface LicenseOrder { orderId: string; deviceId: string; status: 'created' | 'pending' | 'approved' | 'refused' | 'cancelled' | 'refunded' | 'charged_back'; checkoutUrl: string | null }
/** 077/ADR-020: estado da chave TMDB no serviço. O navegador só envia a chave; nada aqui a contém. */
export interface TmdbServerState {
  pending: { action: 'set' | 'remove'; createdAt: string; retryReason?: 'offline' | 'rate_limited' } | null
  last: { action: 'set' | 'remove'; result: 'applied' | 'rejected'; reason?: 'refused' | 'invalid_format'; at: string } | null
  tvReported: 'none' | 'configured' | null
}
export interface BackupSummary { exists: boolean; createdAt?: number; counts?: { favorites: number; history: number; progress: number } }
export const api = {
  licenseDevice: () => request<LicenseDevice>('/session/device'),
  offer: () => request<{ priceMinor: number; currency: string; termMonths: number; deviceCount: number; renewal: string; checkoutEnabled: boolean }>('/offer'),
  checkout: (session: Session, operationId: string) => request<LicenseOrder>('/orders', { method: 'POST', body: {}, csrf: session.csrfToken, operationId }),
  order: (orderId: string) => {
    if (!opaque.test(orderId)) throw new PortalApiError('invalid')
    return request<LicenseOrder>('/orders/' + orderId)
  },
  recoveryExchange: (token: string) => request<RecoverySession>('/recoveries/exchange', { method: 'POST', body: { token } }),
  recover: (session: RecoverySession, code: string, operationId: string) => request<{ operationId: string; state: string }>('/recoveries/confirm',
    { method: 'POST', csrf: session.csrfToken, operationId, body: { code, confirmedDeviceId: session.deviceId } }),
  resend: (session: Session, sourceId: string, expectedRevision: number, operationId: string) => {
    if (!opaque.test(sourceId)) throw new PortalApiError('invalid')
    return request<Operation>('/configurations/' + sourceId + '/resend', { method: 'POST', csrf: session.csrfToken, operationId, body: { expectedRevision } })
  },
  exchange: (token: string) => request<Session>('/sessions/exchange', { method: 'POST', body: { token } }),
  // 070/D-005: entrada manual pelo ID exibido (formato MAC) + chave numérica de 10 dígitos.
  manual: (displayId: string, deviceKey: string) => request<Session>('/sessions/manual', { method: 'POST', body: { displayId, deviceKey } }),
  async dashboard(): Promise<Dashboard> {
    const [configurations, operations, snapshot] = await Promise.all([
      pages<SavedConfiguration>('/configurations', 'configurations'), pages<Operation>('/operations', 'operations'),
      request<{ snapshot: Snapshot | null; stale: boolean }>('/snapshot'),
    ])
    return { configurations, operations, ...snapshot }
  },
  /** 073/US3: só por ação explícita (POST + CSRF, `no-store`); 409 = a TV ainda não enviou a cópia do código atual. */
  async revealRecoveryCode(session: Session): Promise<{ recoveryCode: string; recoveryCodeVersion: number }> {
    const value = await request<{ recoveryCode: unknown; recoveryCodeVersion: unknown }>('/session/recovery-code', { method: 'POST', body: {}, csrf: session.csrfToken })
    if (typeof value.recoveryCode !== 'string' || !/^[0-9A-Z]{4}(-[0-9A-Z]{4}){6}$/.test(value.recoveryCode) ||
      typeof value.recoveryCodeVersion !== 'number') throw new PortalApiError('network')
    return { recoveryCode: value.recoveryCode, recoveryCodeVersion: value.recoveryCodeVersion }
  },
  values: (sourceId: string) => {
    if (!opaque.test(sourceId)) throw new PortalApiError('invalid')
    return request<ConfigurationValues>('/configurations/' + sourceId + '/values')
  },
  submit: (session: Session, body: { action: string; sourceId: string; expectedRevision: number; input?: ConfigurationInput }, operationId: string) =>
    request<Operation>('/operations', { method: 'POST', csrf: session.csrfToken, operationId, body }),
  cancel: (session: Session, operationId: string) => {
    if (!opaque.test(operationId)) throw new PortalApiError('invalid')
    return request<Operation>('/operations/' + operationId, { method: 'DELETE', csrf: session.csrfToken })
  },
  logout: (session: Session) => request<unknown>('/session', { method: 'DELETE', csrf: session.csrfToken }),
  // 072: o painel só vê data e contagens do backup de uso desta TV e pode apagá-lo.
  backup: () => request<BackupSummary>('/backup'),
  deleteBackup: (session: Session) => request<unknown>('/backup', { method: 'DELETE', csrf: session.csrfToken }),
  // 077/ADR-020: a chave TMDB vai só no corpo do PUT; nenhuma resposta a devolve e ela nunca entra em URL.
  tmdb: {
    status: () => request<TmdbServerState>('/integrations/tmdb'),
    set: (session: Session, key: string, operationId: string) => request<{ operationId: string; action: 'set'; state: 'pending' }>(
      '/integrations/tmdb', { method: 'PUT', body: { key }, csrf: session.csrfToken, operationId }),
    remove: (session: Session, operationId: string) => request<{ operationId: string; action: 'remove'; state: 'pending' }>(
      '/integrations/tmdb/remove', { method: 'POST', body: {}, csrf: session.csrfToken, operationId }),
    cancel: (session: Session) => request<unknown>('/integrations/tmdb/pending', { method: 'DELETE', csrf: session.csrfToken }),
  },
}
