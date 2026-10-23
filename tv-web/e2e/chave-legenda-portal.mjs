// Roteiro E2E da feature 091 (chave de legenda pelo portal; ADR-022; constitution 1.17.0 (m)) — quickstart B5, B6, B10–B12.
// Gate da constitution ("Testes E2E antes de validação em TV física").
//
// Um Vite COMERCIAL próprio (porta 5182, `VITE_PORTAL_ORIGIN` de fixture) dá ao app o portal; o serviço e os fornecedores
// (OpenSubtitles, SubDL, TMDB) são simulados por `context.route` — nenhuma rede real, nenhuma chave real. AVPlay não é
// necessário. Prova o comportamento do app contra um serviço fictício; não prova a TV nem o fornecedor real (T036, G-2).
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { abrirIntegracoes } from './lib/portal.mjs'

const PORT = 5182
const APP_URL = `http://127.0.0.1:${PORT}`
const PORTAL_ORIGIN = 'https://chave-legenda.fixture.test'
// Chaves fictícias. O que contém "recusada" é recusado pelo fornecedor simulado.
const TMDB_KEY = 'abcdef0123456789abcdef0123456789'
const SUBDL_KEY = 'chave-subdl-ficticia-091-e2e'
const SUBDL_BAD = 'chave-subdl-recusada-091-e2e'
const OS_BAD = 'chave-opensubtitles-recusada-091-e2e'
const SECRETS = [TMDB_KEY, SUBDL_KEY, SUBDL_BAD, OS_BAD]

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function eventually(check, message, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let ok = false
  while (Date.now() < deadline) {
    try { ok = Boolean(await check()) } catch { ok = false }
    if (ok) break
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
  assert(ok, message)
}

async function startCommercialVite() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'commercial', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    env: { ...process.env, NO_COLOR: '1', VITE_PORTAL_ORIGIN: PORTAL_ORIGIN, VITE_LICENSE_PUBLIC_KEYS: '{}' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('vite comercial não subiu')), 40000)
    vite.stdout.on('data', (value) => {
      if (String(value).includes(APP_URL)) { clearTimeout(timeout); resolve() }
    })
    vite.once('exit', () => { clearTimeout(timeout); reject(new Error('vite comercial encerrou')) })
  })
  return vite
}

/** Estado do serviço fictício: o que o portal "enviou" e o que a TV devolveu. Nenhum campo guarda a chave além de `ops`. */
function newService() {
  return { tmdb: null, subtitles: [], tmdbPulls: 0, subtitlePulls: 0, tmdbAcks: [], subtitleAcks: [], snapshots: [], providerCalls: [] }
}

async function installRoutes(context, service) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }
  const credentials = {
    deviceId: 'chave-legenda-e2e', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'chave-legenda-e2e.' + 'a'.repeat(42) + 'A', deviceKey: '1732049818',
    authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1,
  }
  await context.route(PORTAL_ORIGIN + '/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const pathname = new URL(request.url()).pathname
    const reply = (json, status = 200) => route.fulfill({ status, json, headers: cors })
    if (pathname.endsWith('/devices/enroll')) return reply({ ...credentials, operationId: 'enroll-fixture' })
    if (pathname.endsWith('/recovery/ack')) return route.fulfill({ status: 204, headers: cors })
    if (pathname.endsWith('/device/integrations/tmdb/ack')) {
      const body = request.postDataJSON()
      service.tmdbAcks.push(body)
      if (body.state !== 'retry') service.tmdb = null
      return reply({ operationId: body.operationId, state: body.state })
    }
    if (pathname.endsWith('/device/integrations/tmdb')) { service.tmdbPulls += 1; return reply({ operation: service.tmdb }) }
    if (pathname.endsWith('/device/integrations/subtitles/ack')) {
      const body = request.postDataJSON()
      service.subtitleAcks.push(body)
      if (body.state !== 'retry') service.subtitles = service.subtitles.filter((item) => item.provider !== body.provider)
      return reply({ operationId: body.operationId, provider: body.provider, state: body.state })
    }
    if (pathname.endsWith('/device/integrations/subtitles')) { service.subtitlePulls += 1; return reply({ operations: service.subtitles }) }
    if (pathname.endsWith('/snapshot')) { service.snapshots.push(request.postDataJSON()); return reply({ snapshotRevision: service.snapshots.length }) }
    return reply({ code: 'not_found' }, 404)
  })
  const open = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await context.route('https://api.subdl.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: open })
    const key = new URL(route.request().url()).searchParams.get('api_key') ?? ''
    service.providerCalls.push({ provider: 'subdl', refused: key.includes('recusada') })
    if (key.includes('recusada')) return route.fulfill({ status: 401, json: {}, headers: open })
    return route.fulfill({ json: { status: true, subtitles: [] }, headers: open })
  })
  await context.route('https://api.opensubtitles.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: open })
    const key = route.request().headers()['api-key'] ?? ''
    service.providerCalls.push({ provider: 'opensubtitles', refused: key.includes('recusada') })
    if (key.includes('recusada')) return route.fulfill({ status: 401, json: {}, headers: open })
    return route.fulfill({ json: { data: [] }, headers: open })
  })
  await context.route('https://api.themoviedb.org/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: open })
    if (new URL(route.request().url()).pathname.endsWith('/authentication')) return route.fulfill({ json: { success: true }, headers: open })
    return route.fulfill({ status: 404, json: {}, headers: open })
  })
}

async function run() {
  const vite = await startCommercialVite()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  await context.addInitScript(() => { window.webapis = { productinfo: { getDuid: () => 'fake-browser-duid' } } })
  const service = newService()
  await installRoutes(context, service)
  const page = await context.newPage()
  const consoleText = []
  page.on('console', (message) => consoleText.push(message.text()))
  page.on('pageerror', (error) => { consoleText.push(String(error)); console.error('  [pageerror]', error) })

  try {
    await page.goto(APP_URL)
    await abrirIntegracoes(page)
    const tmdbCard = page.getByRole('region', { name: 'TMDB', exact: true })
    const section = page.getByRole('region', { name: 'Legendas', exact: true })
    const rowOf = (provider) => section.locator(`[data-provider="${provider}"]`)
    const storedKey = (provider) => page.evaluate(async (name) => {
      const { db } = await import('/src/lib/catalog/db.ts')
      const row = await db.table('subtitleCredentials').get(name)
      return row ? { has: true, chosen: row.chosen === true, state: row.state } : { has: false }
    }, provider)

    console.log('=== B5/B6: Atualizar do card TMDB aplica TMDB + legendas, cada fornecedor com o seu resultado ===')
    service.tmdb = { operationId: 'tmdb-op-1', action: 'set', key: TMDB_KEY }
    service.subtitles = [
      { provider: 'subdl', operationId: 'sub-op-1', action: 'set', key: SUBDL_KEY },
      { provider: 'opensubtitles', operationId: 'sub-op-2', action: 'set', key: OS_BAD },
    ]
    await tmdbCard.getByRole('button', { name: 'Atualizar', exact: true }).click()
    await eventually(() => service.tmdbAcks.length === 1 && service.subtitleAcks.length === 2, 'a TV confirmou a TMDB e os dois fornecedores')
    assert(service.tmdbAcks[0].state === 'applied', 'TMDB aplicada')
    const byProvider = Object.fromEntries(service.subtitleAcks.map((ack) => [ack.provider, ack]))
    assert(byProvider.subdl?.state === 'applied' && byProvider.subdl.operationId === 'sub-op-1', 'SubDL aplicada')
    assert(byProvider.opensubtitles?.state === 'rejected' && byProvider.opensubtitles.reason === 'refused', 'OpenSubtitles recusada pelo fornecedor, com motivo da lista fechada')
    assert(Object.keys(byProvider.subdl).sort().join() === 'operationId,provider,state', 'ack sem chave: só fornecedor, id e estado')
    await eventually(async () => (await rowOf('subdl').innerText()).includes('Sua chave — válida'), 'a seção Legendas mostra o SubDL "Sua chave — válida"')
    assert(!(await rowOf('opensubtitles').innerText()).includes('Sua chave'), 'a chave recusada não foi guardada (OpenSubtitles sem chave)')
    await eventually(async () => (await rowOf('opensubtitles').getByRole('status').count()) > 0, 'a linha do OpenSubtitles explica a recusa (sem a chave)')
    assert(await tmdbCard.getByText('Conectado', { exact: true }).isVisible(), 'o card TMDB mostra "Conectado"')
    assert((await storedKey('subdl')).chosen === true && !(await storedKey('opensubtitles')).has, 'IndexedDB: SubDL escolhido, OpenSubtitles vazio')
    assert(service.providerCalls.some((call) => call.provider === 'opensubtitles' && call.refused), 'a chave foi testada no fornecedor antes de ser gravada')
    await eventually(() => service.snapshots.length > 0, 'a TV publicou o snapshot')
    const lastSnapshot = service.snapshots.at(-1).integrations
    assert(lastSnapshot.tmdb === 'configured' && lastSnapshot.subtitles?.subdl === 'configured' && lastSnapshot.subtitles?.opensubtitles === 'none',
      'o snapshot informa o estado por fornecedor (configurada / nenhuma)')

    console.log('=== B11: Atualizar da seção Legendas busca só as de legenda; recusa não troca a chave que já funciona ===')
    const tmdbPullsBefore = service.tmdbPulls
    service.tmdb = { operationId: 'tmdb-op-2', action: 'remove' }
    service.subtitles = [
      { provider: 'subdl', operationId: 'sub-op-3', action: 'set', key: SUBDL_BAD },
      { provider: 'opensubtitles', operationId: 'sub-op-4', action: 'remove' },
    ]
    await section.getByRole('button', { name: 'Atualizar', exact: true }).click()
    await eventually(() => service.subtitleAcks.length === 4, 'a TV confirmou os dois fornecedores do segundo envio')
    assert(service.tmdbPulls === tmdbPullsBefore && service.tmdb?.operationId === 'tmdb-op-2', 'a TMDB não foi consultada nem tocada')
    const second = Object.fromEntries(service.subtitleAcks.slice(2).map((ack) => [ack.provider, ack]))
    assert(second.subdl?.state === 'rejected' && second.subdl.reason === 'refused', 'SubDL nova recusada')
    assert(second.opensubtitles?.state === 'applied', 'remover um fornecedor sem chave também é confirmado')
    assert((await storedKey('subdl')).has && (await storedKey('subdl')).chosen, 'a chave anterior do SubDL continua em uso (recusa não troca)')
    assert((await rowOf('subdl').innerText()).includes('Sua chave — válida'), 'a linha do SubDL segue "Sua chave — válida"')
    assert(!(await tmdbCard.getByText('Não configurado', { exact: true }).isVisible().catch(() => false)), 'a TMDB segue configurada')

    console.log('=== B12: nenhum segredo vazou ===')
    const everything = JSON.stringify({ acks: [service.tmdbAcks, service.subtitleAcks], snapshots: service.snapshots, console: consoleText })
    const html = await page.content()
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    for (const secret of SECRETS) {
      assert(!everything.includes(secret), `ack, snapshot e console não contêm a chave (${secret.slice(0, 10)}…)`)
      assert(!html.includes(secret) && !storage.includes(secret) && !page.url().includes(secret), `DOM, storage e URL não contêm a chave (${secret.slice(0, 10)}…)`)
    }
  } finally {
    await browser.close()
    vite.kill()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nchave-legenda-portal: tudo verde')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
