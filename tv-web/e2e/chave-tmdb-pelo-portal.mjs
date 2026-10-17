// Feature 077 (US4, ADR-020) — chave TMDB digitada no portal e aplicada pela TV, ponta a ponta contra a pilha local
// (emulador Firestore + API real + portal-web + TV comercial). Fora do SUITE do runner: exige gcloud/emulador (Java 21+)
// e `api/.venv`. O TMDB é simulado na TV (aceita ou recusa); não comprova TV física nem o TMDB de verdade.
//
//   node e2e/chave-tmdb-pelo-portal.mjs
//   (portas ocupadas? E2E_PORTAL_PORT=5184 E2E_TV_PORT=5186 E2E_EMULATOR_PORT=8095 node e2e/chave-tmdb-pelo-portal.mjs;
//    a API fica em 3001 porque o proxy do portal-web é fixo)
//
// Cenário: adicionar → "Aguardando a TV" → Atualizar na TV → "Aplicada na TV"; enviar uma chave que o TMDB recusa →
// "Recusada pelo TMDB" e a chave anterior continua; remover → "Não configurada". A chave nunca aparece em resposta do
// serviço, no endereço, no armazenamento do navegador, no console da TV nem no log da API.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { abrirIntegracoes } from './lib/portal.mjs'
import { startPortalStack } from './lib/portalStack.mjs'

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
const KEY = '0123456789abcdef0123456789abcdef'
const REFUSED = 'fedcba9876543210fedcba9876543210'
const ports = {
  portalPort: Number(process.env.E2E_PORTAL_PORT ?? 5174), tvPort: Number(process.env.E2E_TV_PORT ?? 5176),
  emulatorPort: Number(process.env.E2E_EMULATOR_PORT ?? 8085),
}

let stack, browser
try {
  stack = await startPortalStack({ log, ...ports })
  browser = await chromium.launch({ headless: true })
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
  // TMDB simulado: só decide pelo `api_key` recebido (nunca registrado). A chave REFUSED é a que o TMDB "não aceita".
  const tmdb = { accepted: 0, refused: 0 }
  await tvContext.route('https://api.themoviedb.org/**', (route) => {
    const refused = new URL(route.request().url()).searchParams.get('api_key') === REFUSED
    refused ? tmdb.refused++ : tmdb.accepted++
    return route.fulfill({ status: refused ? 401 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(refused ? { success: false, status_code: 7 } : { success: true }) })
  })
  await tvContext.route('https://iptv.fixture.test/**', (route) => route.fulfill({ status: 200, contentType: 'audio/x-mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body: '#EXTM3U\n' }))
  const tv = await tvContext.newPage()
  const calls = [], consoleLines = []
  tv.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === stack.tvOrigin && url.pathname.startsWith('/portal/v1')) calls.push(`${request.method()} ${url.pathname}`)
  })
  tv.on('console', (message) => consoleLines.push(message.text()))
  const acks = () => calls.filter((line) => line.endsWith('/device/integrations/tmdb/ack')).length
  const tvKey = () => tv.evaluate(async (expected) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const rows = await db.integrations.toArray()
    return { rows: rows.length, state: rows[0]?.state ?? null, isExpected: rows[0]?.key === expected }
  }, KEY)

  // ── TV nova: cadastro e QR fixo na tela "Adicionar lista → Pelo site" ─────────────────────────────────────────
  log('TV nova: cadastro único e QR do portal')
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.add-card', { timeout: 20000 })
  await tv.locator('.add-card').click()
  await tv.locator('#add-source-title').waitFor({ timeout: 20000 })
  await tv.getByRole('button', { name: /^Pelo site/ }).click()
  await tv.waitForSelector('.portal-pairing .fixed-qr', { timeout: 20000 })
  const qrUrl = await tv.evaluate(async (site) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const { buildFixedQrUrl } = await import('/src/lib/portal/fixedQr.ts')
    const row = await db.table('portalDevice').get('device')
    return buildFixedQrUrl({ site, displayId: row.displayId, deviceKey: row.deviceKey })
  }, stack.portalOrigin)

  // ── Portal: entra pelo QR e abre Ajustes → Chave TMDB ─────────────────────────────────────────────────────────
  const portalContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
  const portal = await portalContext.newPage()
  const leaks = []
  portal.on('response', async (response) => {
    if (!response.url().includes('/portal/v1/')) return
    const body = await response.text().catch(() => '')
    if (body.includes(KEY) || body.includes(REFUSED)) leaks.push(response.request().method() + ' ' + new URL(response.url()).pathname)
  })
  await portal.goto(qrUrl)
  await expect(portal.getByRole('heading', { name: 'Listas', level: 1, exact: true })).toBeVisible({ timeout: 20000 })
  const nav = (name) => portal.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name, exact: true })
  await nav('Ajustes').click()
  await portal.getByRole('button', { name: /^Chave TMDB/ }).click()
  const status = portal.locator('.tmdb-status')
  const portalRefresh = () => portal.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const waitStatus = (text) => expect.poll(async () => { await portalRefresh(); return status.innerText() }, { timeout: 25000, intervals: [700] }).toContain(text)
  const send = async (value) => {
    await portal.getByLabel('Chave do TMDB', { exact: true }).fill(value)
    await portal.getByRole('button', { name: 'Enviar para a TV' }).click()
    await expect(portal.getByRole('status').filter({ hasText: 'Integrações & BYOK, aperte Atualizar' })).toBeVisible()
  }
  // Atualizar da própria aba Integrações & BYOK da TV (escopo tmdb): só a chave, sem ir a Adicionar lista → Recarregar.
  const tvRefresh = async (expectedAcks) => {
    await tv.locator('.integrations-panel').getByRole('button', { name: 'Atualizar', exact: true }).click()
    await expect.poll(acks, { timeout: 30000, intervals: [500] }).toBe(expectedAcks)
  }
  await expect(status).toContainText('Não configurada')
  // A TV vai para Configurações → Integrações & BYOK e fica lá (o cadastro já existe no navegador dela).
  await tv.goto(stack.tvOrigin)
  await tv.waitForSelector('.add-card', { timeout: 20000 })
  await abrirIntegracoes(tv)

  // ── 1. Adicionar: aguardando → Atualizar na TV → aplicada ────────────────────────────────────────────────────
  log('1. adicionar a chave: Aguardando a TV → Atualizar na TV → Aplicada na TV')
  await send(KEY)
  await expect(status).toContainText('Aguardando a TV')
  assert.equal(await portal.getByLabel('Chave do TMDB', { exact: true }).inputValue(), '', 'campo limpo depois do envio')
  assert.equal(acks(), 0, 'a TV não consulta o serviço sozinha')
  await tvRefresh(1)
  await expect(tv.getByRole('status').filter({ hasText: 'Chave TMDB atualizada' })).toBeVisible()
  await waitStatus('Aplicada na TV')
  assert.deepEqual(await tvKey(), { rows: 1, state: 'connected', isExpected: true }, 'a TV guardou a chave pelo caminho normal')
  assert.equal(tmdb.accepted >= 1, true, 'a TV testou a chave no TMDB')

  // ── 2. Substituir por uma chave que o TMDB recusa: recusada, e a anterior continua ───────────────────────────
  log('2. chave recusada pelo TMDB: Recusada, a chave anterior continua')
  await send(REFUSED)
  await tv.waitForTimeout(10500) // pausa entre dois Atualizar do mesmo escopo
  await tvRefresh(2)
  await waitStatus('Recusada pelo TMDB')
  assert.equal((await tvKey()).isExpected, true, 'recusa não troca a chave da TV')
  assert.ok(tmdb.refused >= 1)

  // ── 3. Remover: confirmação → Atualizar → Não configurada ────────────────────────────────────────────────────
  log('3. remover: confirmação, Atualizar na TV, Não configurada')
  await portal.getByRole('button', { name: 'Remover chave' }).click()
  await portal.getByRole('dialog').getByRole('button', { name: 'Sim, remover' }).click()
  await expect(status).toContainText('Aguardando a TV')
  await tv.waitForTimeout(10500)
  await tvRefresh(3)
  await waitStatus('Não configurada')
  assert.deepEqual(await tvKey(), { rows: 0, state: null, isExpected: false }, 'a TV removeu a chave')

  // ── Segredos: a chave não aparece em lugar nenhum além do PUT e do TMDB ──────────────────────────────────────
  log('segredos: respostas do serviço, endereço, armazenamento, console da TV e log da API')
  assert.deepEqual(leaks, [], 'nenhuma resposta do serviço contém a chave: ' + leaks.join(', '))
  for (const value of [KEY, REFUSED]) {
    assert.ok(!portal.url().includes(value), 'chave fora do endereço')
    assert.ok(!(await portal.locator('body').innerText()).includes(value), 'chave fora da página')
    assert.ok(!(await portal.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).includes(value), 'chave fora do armazenamento')
    assert.ok(!consoleLines.join('\n').includes(value), 'chave fora do console da TV')
    assert.ok(!stack.children.map(({ child }) => child.output).join('\n').includes(value), 'chave fora do log da API')
  }
  log('OK — chave TMDB pelo portal, ponta a ponta')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  stack?.stop()
}
