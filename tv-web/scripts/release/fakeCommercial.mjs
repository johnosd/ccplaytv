// Feature 078 (R-015): o app na variante COMERCIAL para as capturas da loja e da UI Description — mesmo padrão dos E2E
// de licença (`e2e/compra-licenca-pix.mjs`): Vite em `--mode commercial` numa porta própria, portal FICTÍCIO
// interceptado no navegador e licença assinada por uma chave gerada na hora (nunca a de produção). Nenhuma chamada sai
// para fora.
import { generateKeyPairSync, sign } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TV_WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// O domínio real aparece na tela (endereço e QR), mas TODA chamada a ele é atendida aqui pelo `context.route`: nada
// chega à produção, e o ID e a chave do QR são fictícios.
const ORIGIN = 'https://portal.ccplaytv.com'
const DAY = 86_400_000
const DISPLAY_ID = 'A0:8C:FD:19:0A:8C'
const DEVICE_KEY = '4817305926'
// Payload Pix fictício (chave inexistente): só para o QR da tela de compra ter o que desenhar.
const PIX = '00020126580014br.gov.bcb.pix0136chave-ficticia-ccplaytv-demo52040000530398654053500.005802BR5907CCPLAY6009SAO PAULO6304ABCD'

const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))
const encode = (value) => Buffer.from(value).toString('base64url')

/**
 * Sobe o app comercial e devolve `{ url, prepare(context), skew(page, ms), stop() }`. `prepare` instala o DUID fictício,
 * o relógio ajustável (`window.licenseFixtureOffset`) e o portal fictício no contexto do Playwright.
 */
export async function startCommercialApp({ port = 5181 } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  let generation = 0
  let offset = 0
  const serviceNow = () => Date.now() + offset
  const token = () => {
    const now = serviceNow()
    const claims = offset > 7 * DAY
      ? { state: 'trial', startsAt: now - offset, expiresAt: now - offset + 7 * DAY }
      : { state: 'trial', startsAt: now - DAY, expiresAt: now + 6 * DAY }
    const input = encode(canonical({ alg: 'ES256', kid: 'fixture', typ: 'JWT' })) + '.' + encode(canonical({
      iss: 'ccplaytv-portal', aud: 'ccplaytv', deviceId: 'demo-tv', generation: ++generation, serverTime: now, ...claims }))
    return input + '.' + sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  }
  const charge = () => ({ orderId: 'pedido-demo', state: 'pending', qrCode: PIX,
    expiresAt: new Date(serviceNow() + 30 * 60_000).toISOString(), serverTime: new Date(serviceNow()).toISOString(),
    priceMinor: 3500, termMonths: 12, displayId: DISPLAY_ID })
  const credentials = { deviceId: 'demo-tv', displayId: DISPLAY_ID, bearer: 'demo-tv.' + 'a'.repeat(42) + 'A', deviceKey: DEVICE_KEY,
    authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }

  const url = 'http://127.0.0.1:' + port
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'commercial', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: TV_WEB,
    env: { ...process.env, NO_COLOR: '1', VITE_PORTAL_ORIGIN: ORIGIN, VITE_PORTAL_SITE_URL: ORIGIN,
      VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ fixture: publicKey.export({ format: 'jwk' }) }) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('commercial_vite_timeout')), 60_000)
    vite.stdout.on('data', (value) => { if (String(value).includes(url)) { clearTimeout(timeout); resolve() } })
    vite.once('exit', () => { clearTimeout(timeout); reject(Error('commercial_vite_exit')) })
  })

  return {
    url,
    unknownCalls: [],
    async prepare(context) {
      await context.addInitScript(() => {
        window.webapis = { productinfo: { getDuid: () => 'fake-demo-duid' } }
        const nativeNow = Date.now
        window.licenseFixtureOffset = 0
        Date.now = () => nativeNow() + window.licenseFixtureOffset
      })
      await context.route(ORIGIN + '/**', async (route) => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' }
        const json = (value) => route.fulfill({ json: value, headers: { ...headers, 'Cache-Control': 'no-store' } })
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
        if (pathname.endsWith('/devices/enroll')) return json({ ...credentials, operationId: 'enroll-demo', trialStartedAt: serviceNow() - DAY })
        if (pathname.endsWith('/entitlement/refresh') || pathname.endsWith('/device/entitlement')) return json({ jws: token() })
        if (pathname.endsWith('/device/orders/pix') || pathname.endsWith('/device/orders/pix/refresh')) return json(charge())
        if (pathname.endsWith('/device/operations')) return json({ operations: [] })
        if (pathname.endsWith('/device/sources')) {
          const body = JSON.parse(request.postData() ?? '{}')
          return json({ results: (body.sources ?? []).map((item) => ({ sourceId: item.sourceId, state: 'stored' })) })
        }
        if (pathname.endsWith('/device/deletions')) return json({ acks: (JSON.parse(request.postData() ?? '{}').deletions ?? []).map((item) => item.deletionId) })
        if (pathname.endsWith('/device/backup/summary')) return json({ exists: false })
        if (/\/(device\/recovery-code\/escrow|device\/snapshot|recovery\/ack)$/.test(pathname)) return route.fulfill({ status: 204, headers })
        this.unknownCalls.push(request.method() + ' ' + pathname)
        return route.fulfill({ status: 404, headers })
      })
    },
    /** Adianta o relógio do navegador e do "serviço" (ex.: 8 dias = teste vencido) e pede à TV que reavalie. */
    async skew(page, ms) {
      offset = ms
      await page.evaluate((value) => { window.licenseFixtureOffset = value; window.dispatchEvent(new Event('pageshow')) }, ms)
    },
    stop() { vite.kill() },
  }
}
