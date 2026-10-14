/** Sonda opt-in da 069: nunca retorna DUID, credenciais ou conteúdo do catálogo. */
export type ProbeResult = 'passed' | 'failed' | 'unavailable' | 'first_run'
export type PlatformProbeReport = {
  schemaVersion: 1
  protocol: 'file:' | 'http:' | 'https:' | 'other'
  duid: ProbeResult
  duidStability: ProbeResult
  es256: ProbeResult
  es256Tamper: ProbeResult
  signatureBytes: number
  aesGcm: ProbeResult
  aesAadTamper: ProbeResult
  persistence: ProbeResult
  wallNow: number
  monotonicNow: number
  previousWallNow: number | null
  observedWallRollback: boolean
  /** 070/T003: `webapis.network.getMac()` existe e devolve 12 dígitos hex úteis. O MAC em si nunca entra no relatório. */
  mac?: ProbeResult
}
type ProbeStorage = Pick<Storage, 'getItem' | 'setItem'>
type Options = { crypto: Crypto; storage: ProbeStorage; getDuid?: () => string; getMac?: () => string; protocol: string; wallNow?: number; monotonicNow?: number }
const STORAGE_KEY = 'ccplaytv:portal-platform-probe:v1'
export async function runPlatformProbe(options: Options): Promise<PlatformProbeReport> {
  const report: PlatformProbeReport = {
    schemaVersion: 1, protocol: ['file:', 'http:', 'https:'].includes(options.protocol) ? options.protocol as PlatformProbeReport['protocol'] : 'other',
    duid: 'unavailable', duidStability: 'unavailable', es256: 'unavailable', es256Tamper: 'unavailable', signatureBytes: 0,
    aesGcm: 'unavailable', aesAadTamper: 'unavailable', persistence: 'unavailable',
    wallNow: options.wallNow ?? Date.now(), monotonicNow: options.monotonicNow ?? performance.now(),
    previousWallNow: null, observedWallRollback: false,
  }
  let previous: { duidDigest?: string; wallNow?: number } = {}
  try { previous = JSON.parse(options.storage.getItem(STORAGE_KEY) ?? '{}') ?? {} } catch { /* Prova local inválida não bloqueia o app. */ }
  if (Number.isFinite(previous.wallNow)) {
    report.previousWallNow = previous.wallNow!
    report.observedWallRollback = report.wallNow < previous.wallNow!
  }
  let duidDigest: string | undefined
  try {
    const duid = options.getDuid?.()
    report.duid = duid ? 'passed' : 'unavailable'
    if (duid) {
      const digest = await options.crypto.subtle.digest('SHA-256', new TextEncoder().encode(duid))
      duidDigest = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
      report.duidStability = previous.duidDigest ? (duidDigest === previous.duidDigest ? 'passed' : 'failed') : 'first_run'
    }
  } catch { report.duid = 'failed' }
  report.mac = probeMac(options.getMac)
  const message = new TextEncoder().encode('ccplaytv-public-platform-probe-v1')
  const badMessage = new TextEncoder().encode('ccplaytv-tampered-platform-probe-v1')
  try {
    const keys = await options.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    const signature = await options.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, message)
    report.signatureBytes = signature.byteLength
    report.es256 = await options.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, signature, message) && signature.byteLength === 64 ? 'passed' : 'failed'
    report.es256Tamper = await options.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, signature, badMessage) ? 'failed' : 'passed'
  } catch { report.es256 = 'failed' }
  try {
    const key = await options.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const iv = options.crypto.getRandomValues(new Uint8Array(12))
    const data = await options.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: message }, key, message)
    const plain = await options.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: message }, key, data)
    report.aesGcm = new TextDecoder().decode(plain) === new TextDecoder().decode(message) ? 'passed' : 'failed'
    try {
      await options.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: badMessage }, key, data)
      report.aesAadTamper = 'failed'
    } catch { report.aesAadTamper = 'passed' }
  } catch { report.aesGcm = 'failed' }
  try {
    const value = JSON.stringify({ duidDigest, wallNow: Math.max(report.wallNow, report.previousWallNow ?? 0) })
    options.storage.setItem(STORAGE_KEY, value)
    report.persistence = options.storage.getItem(STORAGE_KEY) === value ? 'passed' : 'failed'
  } catch { report.persistence = 'failed' }
  return report
}
/** Útil = 12 hex, não zerado/broadcast e unicast; o valor não sai daqui. */
function probeMac(getMac?: () => string): ProbeResult {
  if (!getMac) return 'unavailable'
  try {
    const hex = String(getMac() ?? '').trim().replace(/[:.-]/g, '').toUpperCase()
    if (!/^[0-9A-F]{12}$/.test(hex) || /^(0{12}|F{12})$/.test(hex) || (parseInt(hex.slice(0, 2), 16) & 1) === 1) return 'failed'
    return 'passed'
  } catch { return 'failed' }
}
export function platformProbeDestination(destination: string): URL | null {
  try {
    const url = new URL(destination)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname)
    if (url.protocol !== 'http:' || !local || url.pathname !== '/platform-probe' || url.username || url.password || url.search || url.hash) return null
    return url
  } catch { return null }
}
export async function startPlatformProbe() {
  const host = window as unknown as { webapis?: { productinfo?: { getDuid?: () => string }; network?: { getMac?: () => string } }; __ccplayPlatformProbe?: PlatformProbeReport }
  const product = host.webapis?.productinfo
  const report = await runPlatformProbe({ crypto: window.crypto, storage: window.localStorage,
    getDuid: product?.getDuid ? () => product.getDuid!() : undefined,
    getMac: host.webapis?.network?.getMac ? () => host.webapis!.network!.getMac!() : undefined, protocol: location.protocol })
  host.__ccplayPlatformProbe = report
  // Apenas um endpoint local de diagnóstico explícito; ausência nunca toca rede.
  const destination = import.meta.env.VITE_CCPLAY_PLATFORM_PROBE_REPORT
  if (destination) {
    const url = platformProbeDestination(destination)
    if (!url) return
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report), signal: AbortSignal.timeout(5000) }).catch(() => {})
  }
}
