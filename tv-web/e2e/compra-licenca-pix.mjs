// Feature 073 (US1): bloqueio → Comprar licença → Pix na TV → Atualizar → lista abre. Browser + portal fictício.
// Não comprova pagamento real, Mercado Pago, AVPlay ou leitura do QR por celular (isso é a TV física, SC-007).
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const origin = 'https://pix.fixture.test'
// Porta própria: 5173 dev, 5174/5176 portal, 5175 configuração, 5177 legibilidade.
const port = 5179, address = 'http://127.0.0.1:' + port
const DAY = 86400000, SKEW = 8 * DAY
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
const encode = value => Buffer.from(value).toString('base64url')
let generation = 0, paid = false
// Relógio do "serviço" acompanha o relógio adiantado do navegador (teste vencido há um dia).
const serviceNow = () => Date.now() + SKEW
function token() {
  const now = serviceNow()
  const claims = paid
    ? { state: 'active', startsAt: now - 1000, expiresAt: now + 365 * DAY }
    : { state: 'trial', startsAt: now - SKEW, expiresAt: now - DAY }
  const input = encode(canonical({ alg: 'ES256', kid: 'fixture', typ: 'JWT' })) + '.' + encode(canonical({ iss: 'ccplaytv-portal',
    aud: 'ccplaytv', deviceId: 'pix-tv', generation: ++generation, serverTime: now, ...claims }))
  return input + '.' + sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
}
const QR = '00020126580014br.gov.bcb.pix0136fixture-chave-pix-ccplay52040000530398654053500.005802BR5907CCPLAY6009SAO PAULO6304ABCD'
const charge = state => ({ orderId: 'pedido-fixture', state, ...(state === 'pending' ? { qrCode: QR } : {}),
  expiresAt: new Date(serviceNow() + 30 * 60000).toISOString(), serverTime: new Date(serviceNow()).toISOString(),
  priceMinor: 3500, termMonths: 12, displayId: 'A0:8C:FD:19:0A:8C' })

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'commercial', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: { ...process.env, NO_COLOR: '1', VITE_PORTAL_ORIGIN: origin, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ fixture: publicKey.export({ format: 'jwk' }) }) },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
const body = (await readFile(new URL('./fixtures/ciclo-vida-player.m3u', import.meta.url), 'utf8')).replaceAll('http://ciclo-fictício.test', 'https://media.fixture.test')
const server = createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' }); response.end(body) })
let browser
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('fixture_vite_timeout')), 30000)
    vite.stdout.on('data', value => { if (String(value).includes(address)) { clearTimeout(timeout); resolve() } })
    vite.once('exit', () => { clearTimeout(timeout); reject(Error('fixture_vite_exit')) })
  })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  await context.addInitScript(() => {
    window.webapis = { productinfo: { getDuid: () => 'fake-pix-duid' } }
    const nativeNow = Date.now
    window.licenseFixtureOffset = 0
    Date.now = () => nativeNow() + window.licenseFixtureOffset
  })
  const credentials = { deviceId: 'pix-tv', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'pix-tv.' + 'a'.repeat(42) + 'A', deviceKey: '1732049818', authEpoch: 1,
    recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  const calls = []
  await context.route(origin + '/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }
    const json = value => route.fulfill({ json: value, headers: { ...headers, 'Cache-Control': 'no-store' } })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    calls.push({ path, body: request.postData() ? JSON.parse(request.postData()) : undefined })
    if (path.endsWith('/devices/enroll')) return json({ ...credentials, operationId: 'enroll-fixture' })
    if (path.endsWith('/entitlement/refresh')) return json({ jws: token() })
    if (path.endsWith('/device/orders/pix')) return json(charge('pending'))
    if (path.endsWith('/device/orders/pix/refresh')) return json(charge(paid ? 'approved' : 'pending'))
    if (path.endsWith('/device/recovery-code/escrow') || path.endsWith('/device/snapshot') || path.endsWith('/recovery/ack')) return route.fulfill({ status: 204, headers })
    return route.fulfill({ status: 404, headers })
  })
  await context.route('https://media.fixture.test/**', () => {})
  const page = await context.newPage()
  await page.goto(address)
  // Foco do diálogo aberto (a tela de listas atrás do modal mantém o próprio `.tv-focus`).
  const focusText = () => page.evaluate(() => ((document.querySelector('[role="dialog"] .tv-focus') ?? document.querySelector('.tv-focus'))
    ?.textContent ?? '').replace(/\s+/g, ' ').trim())

  // Lista cadastrada durante o teste; depois o relógio passa do fim do teste local (7 dias).
  await cadastrarListaM3u(page, { nome: 'Lista paga', url: 'http://127.0.0.1:' + server.address().port + '/list.m3u' })
  await expect(page.getByText('Concluída', { exact: false })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.locator('.source-card').waitFor()
  await page.evaluate(skew => { window.licenseFixtureOffset = skew; window.dispatchEvent(new Event('pageshow')) }, SKEW)
  await expect.poll(() => page.evaluate(async () => { const { licenseMonitor } = await import('/src/lib/licensing/licenseRuntime.ts'); return licenseMonitor.check().allowed })).toBe(false)

  await page.locator('.source-card').click()
  const gate = page.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })
  await expect(gate).toBeVisible()
  await expect(gate.getByText('A0:8C:FD:19:0A:8C')).toBeVisible({ timeout: 15000 })
  assert.equal(await focusText(), 'Comprar licença')
  // SC-004: mover o foco não fala com o serviço.
  const before = calls.length
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) await page.keyboard.press(key)
  assert.equal(calls.length, before, 'setas não podem consultar o serviço')
  assert.equal(await focusText(), 'Comprar licença')

  await page.keyboard.press('Enter')
  const pix = page.getByRole('dialog', { name: 'Comprar licença com Pix' })
  await expect(pix.getByText(QR, { exact: true })).toBeVisible()
  await expect(pix.getByText(/R\$ 35,00 · 12 meses/)).toBeVisible()
  await expect(pix.getByText('Pix vence em 30 min')).toBeVisible()
  await expect(pix.getByRole('img', { name: /QR/ })).toBeVisible()
  const opened = calls.filter(call => call.path.endsWith('/device/orders/pix'))
  assert.equal(opened.length, 1)
  assert.equal(opened[0].body.renew, false)

  // RETURN volta ao bloqueio com o foco em Comprar; reabrir reaproveita a mesma intenção (renew: false).
  await page.keyboard.press('Escape')
  await expect(gate).toBeVisible()
  assert.equal(await focusText(), 'Comprar licença')
  await page.keyboard.press('Enter')
  await expect(pix.getByText(QR, { exact: true })).toBeVisible()
  const reopened = calls.filter(call => call.path.endsWith('/device/orders/pix'))
  assert.equal(reopened.length, 2)
  assert.equal(reopened[1].body.renew, false)
  assert.equal(reopened[1].body.requestId, reopened[0].body.requestId)

  assert.equal(await focusText(), 'Atualizar')
  await page.keyboard.press('Enter')
  await expect(pix.getByText('Pagamento ainda não confirmado.')).toBeVisible()
  await expect(pix.getByText(QR, { exact: true })).toBeVisible()

  // Provedor confirma; a pessoa aperta Atualizar e entra na lista que foi negada.
  paid = true
  await page.keyboard.press('Enter')
  await page.locator('.home-content').waitFor({ timeout: 15000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.equal(await page.evaluate(async () => { const { licenseMonitor } = await import('/src/lib/licensing/licenseRuntime.ts'); return licenseMonitor.check().allowed }), true)
  console.log('Compra por Pix na TV: bloqueio, foco sem consulta, Pix, RETURN, reabrir sem nova intenção, pendente, aprovado e entrada na lista PASS (fixtures).')
} finally {
  await browser?.close()
  server.close()
  vite.kill()
}
