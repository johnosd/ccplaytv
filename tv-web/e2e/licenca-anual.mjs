// Browser + provedor fictício. Não comprova pagamento, AVPlay, nuvem ou relógio físico.
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { abrirPortalLicenca } from './lib/portal.mjs'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { openViaTopbar, focusFirstRealCategory } from './lib/vod.mjs'
const origin = 'https://license.fixture.test', address = 'http://127.0.0.1:5176'
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
const encode = value => Buffer.from(value).toString('base64url')
let generation = 0, state = 'trial', expiresAt = Date.now() + 7 * 86400000
function token() {
  const input = encode(canonical({ alg: 'ES256', kid: 'fixture', typ: 'JWT' })) + '.' + encode(canonical({ iss: 'ccplaytv-portal', aud: 'ccplaytv', deviceId: 'license-tv', state, generation: ++generation, startsAt: Date.now() - 10000, expiresAt, serverTime: Date.now() }))
  return input + '.' + sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
}
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'commercial', '--host', '127.0.0.1', '--port', '5176', '--strictPort'], {
  env: { ...process.env, VITE_PORTAL_ORIGIN: origin, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ fixture: publicKey.export({ format: 'jwk' }) }) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
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
    window.webapis = { productinfo: { getDuid: () => 'fake-license-duid' } }
    const nativeNow = Date.now
    window.licenseFixtureOffset = 0
    Date.now = () => nativeNow() + window.licenseFixtureOffset
  })
  const credentials = { deviceId: 'license-tv', bearer: 'license-tv.' + 'a'.repeat(42) + 'A', deviceKey: 'b'.repeat(42) + 'A', authEpoch: 1,
    recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await context.route(origin + '/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }
    const json = value => route.fulfill({ json: value, headers })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path.endsWith('/devices/enroll')) return json({ ...credentials, operationId: 'enroll-fixture' })
    if (path.endsWith('/entitlement/refresh')) return json({ jws: token() })
    if (path.endsWith('/device/operations')) return json({ operations: [] })
    if (path.endsWith('/device/invites')) return json({ token: 'a'.repeat(42) + 'A', expiresAt: new Date(Date.now() + 300000).toISOString(), qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' })
    if (path.endsWith('/device/snapshot') || path.endsWith('/recovery/ack')) return route.fulfill({ status: 204, headers })
    return route.fulfill({ status: 404, headers })
  })
  await context.route('https://media.fixture.test/**', () => {})
  const page = await context.newPage()
  await page.goto(address)
  const cache = () => page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.table('licenseCache').get('entitlement') })
  await expect.poll(async () => (await cache())?.generation, { timeout: 15000 }).toBeGreaterThan(0)
  await abrirPortalLicenca(page)
  await expect(page.getByText('Licença: Período de teste', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Gerar QR para o portal', exact: true }).click()
  await expect(page.getByRole('img', { name: 'QR de acesso temporário ao portal desta TV' })).toBeVisible()
  // Provedor confirma mesmo com o navegador da compra fechado; próximo ciclo rápido ativa.
  state = 'active'; expiresAt = Date.now() + 365 * 86400000
  await expect.poll(async () => {
    const { entitlement } = await page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); const { loadLicense } = await import('/src/lib/licensing/licenseRepository.ts'); const { licenseAuthority } = await import('/src/lib/licensing/licenseRuntime.ts'); return loadLicense(db, licenseAuthority('license-tv')) })
    return entitlement.state
  }, { timeout: 15000 }).toBe('active')
  await expect(page.getByText('Licença: Licença ativa', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await cadastrarListaM3u(page, { nome: 'Lista preservada', url: 'http://127.0.0.1:' + server.address().port + '/list.m3u' })
  await expect(page.getByText('Concluída', { exact: false })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.locator('.source-card').click()
  await page.locator('.home-content').waitFor()
  await openViaTopbar(page, 'movies')
  await focusFirstRealCategory(page)
  await page.keyboard.press('Enter')
  await page.locator('.content-card-title').first().waitFor()
  await page.keyboard.press('Enter')
  await page.locator('.vod-detail').waitFor()
  await context.setOffline(true)
  await page.keyboard.press('Enter')
  await page.locator('.player-video').waitFor()
  await page.evaluate(() => {
    const video = document.querySelector('.player-video')
    Object.defineProperty(video, 'duration', { value: 1200, configurable: true })
    Object.defineProperty(video, 'currentTime', { value: 43, configurable: true })
    video.dispatchEvent(new Event('playing')); video.dispatchEvent(new Event('timeupdate'))
  })
  // Vencimento é verificado na próxima entrada; a sessão aberta continua offline.
  assert.equal(await page.locator('.player-video').count(), 1)
  await page.evaluate(expiry => { window.licenseFixtureOffset = expiry + 1 - Date.now(); window.dispatchEvent(new Event('pageshow')) }, expiresAt)
  await expect.poll(() => page.evaluate(async () => { const { licenseMonitor } = await import('/src/lib/licensing/licenseRuntime.ts'); return licenseMonitor.check().reason })).toBe('expired')
  await expect(page.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toHaveCount(0)
  await expect(page.locator('.player-video')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.locator('.vod-detail').waitFor()
  await expect.poll(() => page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.userStates.toArray()).some(row => row.progressSeconds === 43) })).toBe(true)
  // Pode iniciar outra reprodução enquanto continua dentro da mesma lista.
  await page.keyboard.press('Enter')
  await page.locator('.player-video').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.vod-detail').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.vod-grid').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.vod-showcase').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.home-content').waitFor()
  await page.locator('.topbar-profile').click()
  await page.locator('.source-card').waitFor()
  // RETURN do seletor também é uma nova entrada; não contorna o vencimento.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.source-card').click()
  await expect(page.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toBeVisible()
  assert.equal(await page.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return db.sources.count() }), 1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  console.log('Licença browser: trial, QR, ativação, offline, vencimento mantém sessão/player, saída salva posição, escolha/RETURN bloqueados e lista preservada PASS (fixtures).')

} finally {
  await browser?.close()
  server.close()
  vite.kill()
}
