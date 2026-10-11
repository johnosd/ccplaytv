/** API same-origin; erros nunca propagam corpo ou exceção de fetch. */
export class PortalApiError extends Error {
  constructor(readonly code: 'access' | 'conflict' | 'invalid' | 'network' | 'limited', readonly retryAfter = 0) {
    super(code)
  }
}
export interface Session { deviceId: string; csrfToken: string; expiresAt: string }
export interface Source { id: string; type: 'provider_credentials' | 'm3u_url'; displayName: string;
  connectionState?: string; updatedAt?: number }
export interface SavedConfiguration { sourceId: string; type: Source['type']; displayName: string;
  configVersion: string; appliedRevision: number | null; expectedRevision: number; operationId: string | null }
export interface Operation { operationId: string; sourceId: string; action: string; state: string;
  expectedRevision: number; createdAt: string; importState: string | null; receipt: { revision: number; state: string } | null }
export interface Snapshot { capturedAt: string; sources: Source[]; revisions: { sourceId: string; revision: number }[] }
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
export interface RecoverySession extends Session { claimId: string }
export function newRecoveryId() { return newOperationId().slice(17) }
export function takeEntry(location: { hash: string; pathname: string; search: string },
  history: { replaceState: (data: unknown, unused: string, url: string) => void }): { kind: 'invite' | 'recovery'; token: string } | undefined {
  const hash = location.hash
  if (hash) history.replaceState(null, '', location.pathname + location.search)
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (params.has('invite') && params.has('recovery')) return undefined
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
export interface LicenseDevice { deviceId: string; license: { state: 'trial' | 'active' | 'revoked'; startsAt: number; expiresAt: number; generation: number; serverTime: number } }
export interface LicenseOrder { orderId: string; deviceId: string; status: 'created' | 'pending' | 'approved' | 'refused' | 'cancelled' | 'refunded' | 'charged_back'; checkoutUrl: string | null }
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
  manual: (deviceId: string, deviceKey: string) => request<Session>('/sessions/manual', { method: 'POST', body: { deviceId, deviceKey } }),
  async dashboard(): Promise<Dashboard> {
    const [configurations, operations, snapshot] = await Promise.all([
      pages<SavedConfiguration>('/configurations', 'configurations'), pages<Operation>('/operations', 'operations'),
      request<{ snapshot: Snapshot | null; stale: boolean }>('/snapshot'),
    ])
    return { configurations, operations, ...snapshot }
  },
  submit: (session: Session, body: { action: string; sourceId: string; expectedRevision: number; input?: ConfigurationInput }, operationId: string) =>
    request<Operation>('/operations', { method: 'POST', csrf: session.csrfToken, operationId, body }),
  cancel: (session: Session, operationId: string) => {
    if (!opaque.test(operationId)) throw new PortalApiError('invalid')
    return request<Operation>('/operations/' + operationId, { method: 'DELETE', csrf: session.csrfToken })
  },
  logout: (session: Session) => request<unknown>('/session', { method: 'DELETE', csrf: session.csrfToken }),
}
