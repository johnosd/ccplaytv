// Dev server REAL (`vite --mode commercial` + proxy same-origin) contra a API do portal e o portal-web, só por
// teclado, com o relógio da TV atrasado e SEM injetar `webapis` (valida a identidade só-DEV). Opt-in (exige
// gcloud/emulador/api/.venv): fora do SUITE do runner. Não comprova DUID real, AVPlay nem o Chromium da TV.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { abrirPortalLicenca } from './lib/portal.mjs'
import { startPortalStack } from './lib/portalStack.mjs'

const stamp = () => new Date().toISOString().slice(11, 19)
const log = message => console.log(`[${stamp()}] ${message}`)
const clockOffsetMs = Number(process.env.TV_CLOCK_OFFSET_MS ?? -5000)
let stack, browser
let failed
try {
  stack = await startPortalStack({ log })
  browser = await chromium.launch({ headless: true })
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  await tvContext.addInitScript(offset => { const now = Date.now.bind(Date); Date.now = () => now() + offset }, clockOffsetMs)
  await tvContext.route('https://iptv.fixture.test/**', route => route.fulfill({ status: 200, contentType: 'audio/x-mpegurl',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: '#EXTM3U\n#EXTINF:-1 group-title="T",Canal A\nhttps://media.fixture.test/a.m3u8\n' }))
  await tvContext.route('https://media.fixture.test/**', () => {})
  const tv = await tvContext.newPage()
  const net = []
  tv.on('response', async response => {
    const path = new URL(response.url()).pathname
    if (!path.startsWith('/portal/v1')) return
    net.push(`${response.request().method()} ${path.replace('/portal/v1', '')} ${response.status()}`)
  })
  tv.on('pageerror', error => net.push('pageerror: ' + String(error.message).slice(0, 160)))
  const focus = () => tv.evaluate(() => (document.querySelector('.tv-focus')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40))
  const press = async (...keys) => { for (const key of keys) { await tv.keyboard.press(key); await tv.waitForTimeout(200) } }

  await tv.goto(stack.tvOrigin)
  await abrirPortalLicenca(tv)
  log('perfis → Configurações → Portal & licença, só pelo controle (modo dev, sem webapis injetado)')
  const panel = tv.locator('.portal-license-panel')
  await panel.waitFor({ timeout: 10000 })
  assert.equal(await panel.getByText('O portal ainda não está disponível neste app', { exact: false }).count(), 0, 'painel marcado como não configurado')
  await expect(tv.getByText('Licença: Período de teste', { exact: true })).toBeVisible({ timeout: 20000 })
  await expect(panel.getByText(/Validade até:/)).toBeVisible()
  log('licença: período de teste e validade visíveis')

  // 075: foco inicial na ação principal da licença; QR, ID e chave (3-3-4) já estão à vista, sem nenhuma ação.
  assert.equal(await focus(), 'Comprar licença')
  await expect(tv.getByRole('img', { name: /QR de acesso ao portal/ })).toBeVisible({ timeout: 15000 })
  log(`QR visível (relógio da TV ${clockOffsetMs} ms)`)
  await expect(panel.getByText(/^\d{3} \d{3} \d{4}$/)).toBeVisible()
  log('ID e chave da TV à vista, sem ação')

  const code = /([0-9A-Z]{4}-){3,}[0-9A-Z]{4}/
  assert.ok(!code.test(await panel.innerText()), 'sem código na tela principal')
  assert.equal(await panel.getByText('Guarde seu código de recuperação em Avançado.').count(), 1)
  await press('ArrowDown', 'ArrowDown')
  assert.equal(await focus(), 'Avançado')
  await press('Enter')
  const advanced = tv.getByRole('region', { name: 'Avançado' })
  await expect(advanced).toBeVisible()
  assert.equal(await focus(), 'Mostrar código de recuperação')
  assert.ok(!code.test(await advanced.innerText()), 'focar o olho não revela')
  await press('Enter')
  await expect(advanced).toContainText(code, { timeout: 5000 })
  assert.equal(await tv.getByRole('dialog').count(), 0, 'sem modal')
  await press('Enter')
  assert.ok(!code.test(await advanced.innerText()), 'segundo OK oculta')
  await press('Escape')
  await expect(advanced).toHaveCount(0)
  log('código de recuperação exibido só pelo olho, dentro do Avançado')

  // Portal: entra pelo QR fixo (ID + chave no fragmento) e cria uma lista; a TV aplica no Atualizar.
  const portalContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
  const portal = await portalContext.newPage()
  const qr = await tv.evaluate(async site => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { buildFixedQrUrl } = await import('/src/lib/portal/fixedQr.ts')
    const row = await db.table('portalDevice').get('device')
    return buildFixedQrUrl({ site, displayId: row.displayId, deviceKey: row.deviceKey })
  }, stack.portalOrigin)
  await portal.goto(qr)
  await expect(portal.getByRole('heading', { name: 'Suas listas' })).toBeVisible({ timeout: 20000 })
  await portal.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await portal.getByLabel('Nome da lista').fill('Lista do dev server')
  await portal.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await portal.getByLabel('URL da lista M3U', { exact: true }).fill('https://iptv.fixture.test/list.m3u?key=segredo-fixture')
  await portal.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  // Espera o portal confirmar o pedido antes de pedir à TV (nada é automático).
  await expect(portal.getByRole('heading', { name: 'Lista do dev server', exact: true })).toBeVisible({ timeout: 15000 })
  // 071: nada é automático — volta aos perfis e aperta Atualizar.
  await tv.keyboard.press('Escape')
  await tv.locator('.profiles-portal-corner').click()
  await expect.poll(() => tv.evaluate(async () => { const { db } = await import('/src/lib/catalog/db.ts'); return (await db.sources.toArray()).map(s => s.displayName ?? s.name) }),
    { timeout: 60000, intervals: [1000] }).toContain('Lista do dev server')
  expect(await portal.locator('body').innerText()).not.toContain('segredo-fixture')
  log('portal → TV: lista aplicada pelo dev server')
  console.log('PASS: dev server — painel, licença, QR, chave, código e fluxo portal → TV')
} catch (error) {
  failed = error
  console.error('FALHA:', String(error?.message ?? error).split('\n').slice(0, 8).join('\n'))
} finally {
  await browser?.close()
  stack?.stop()
}
if (failed) process.exitCode = 1
