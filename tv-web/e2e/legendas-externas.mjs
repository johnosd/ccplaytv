// Roteiro E2E da feature 090 (legendas externas: OpenSubtitles + SubDL, US1–US3) — quickstart B1–B4, B7, B10, B12,
// B12b/B12c e B13–B16. Gate da constitution ("Testes E2E antes de validação em TV física").
//
// Um Vite COMERCIAL próprio (porta 5180, `VITE_PORTAL_ORIGIN` de fixture) dá ao app o portal; o serviço de legendas e os
// fornecedores são simulados por `context.route` — nenhuma rede real, nenhuma chave real. O AVPlay é FALSO (padrão de
// `audio-legendas-info.mjs`): o app escolhe o adaptador da TV e o roteiro entrega o tempo da mídia por
// `oncurrentplaytime`. Prova o comportamento do app; não prova a legenda sobre o plano de hardware (só a TV prova).
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { focusSideItem } from './lib/vod.mjs'
import { answerSubtitleRoute, installFakeAvplay } from './lib/legendasSim.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'player-chrome.m3u')
const PORT = 5180
const APP_URL = `http://127.0.0.1:${PORT}`
const PORTAL_ORIGIN = 'https://legendas.fixture.test'
const SOURCE_NAME = 'Fonte E2E Legendas'
const SUBDL_KEY = 'chave-pessoal-ficticia-090'

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Estado observável depois de uma tecla: consulta até estabilizar (render assíncrono do React). */
async function eventually(check, message, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  let ok = false
  while (Date.now() < deadline) {
    try {
      ok = Boolean(await check())
    } catch {
      ok = false
    }
    if (ok) break
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  assert(ok, message)
}

function startFixtureServer() {
  const body = readFileSync(FIXTURE_PATH)
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
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
      if (String(value).includes(APP_URL)) {
        clearTimeout(timeout)
        resolve()
      }
    })
    vite.once('exit', () => {
      clearTimeout(timeout)
      reject(new Error('vite comercial encerrou'))
    })
  })
  return vite
}

/** Portal e fornecedores simulados. `mode` muda o comportamento do serviço no meio do roteiro. */
async function installRoutes(context, sim) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }
  const credentials = {
    deviceId: 'legendas-e2e', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'legendas-e2e.' + 'a'.repeat(42) + 'A', deviceKey: '1732049818', authEpoch: 1,
    recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1,
  }
  await context.route(PORTAL_ORIGIN + '/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/devices/enroll')) return route.fulfill({ json: { ...credentials, operationId: 'enroll-fixture' }, headers: cors })
    if (pathname.endsWith('/recovery/ack')) return route.fulfill({ status: 204, headers: cors })
    if (await answerSubtitleRoute(route, sim, cors)) return
    return route.fulfill({ status: 404, headers: cors })
  })
  // SubDL com a chave PESSOAL (BYOK): direto da TV; `sim.subdl` = 'ok' | 'rejected'.
  await context.route('https://api.subdl.com/**', async (route) => {
    const url = new URL(route.request().url())
    sim.calls.push({ kind: 'subdl-direct', hasKey: url.searchParams.has('api_key') })
    const headers = { 'Access-Control-Allow-Origin': '*' }
    if (sim.subdl === 'rejected') return route.fulfill({ status: 401, json: {}, headers })
    const subtitles = url.searchParams.get('film_name') === 'test' ? [] : [{ release_name: 'Filme.Chrome.SubDL.Direto', language: 'BR_PT', url: '/subtitle/11-22.zip?api_key=X', hi: false }]
    return route.fulfill({ json: { status: true, subtitles }, headers })
  })
}

const tracksDialog = (page) => page.getByRole('dialog', { name: 'Áudio e legendas' })
const searchDialog = (page) => page.getByRole('dialog', { name: 'Buscar legenda online' })
const isFocused = async (locator) => (await locator.getAttribute('class'))?.includes('tv-focus') ?? false
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}
const subtitleCalls = (sim, kind) => sim.calls.filter((call) => call.kind === kind)

async function openMovie(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.source-card, .home-content', { timeout: 15000 })
  if (await page.locator('.source-card').first().isVisible().catch(() => false)) await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 10000 })
  await page.waitForTimeout(300)
  await press(page, 'ArrowUp', 6)
  await press(page, 'ArrowLeft', 6)
  await press(page, 'ArrowRight', 2) // Filmes
  await page.keyboard.press('Enter')
  await focusSideItem(page, 'Filmes')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
  await page.keyboard.press('Enter') // detalhe
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await watch(page)
}

async function watch(page) {
  const before = await page.evaluate(() => window.__avplay?.calls.filter((call) => call === 'play').length ?? 0)
  await page.keyboard.press('Enter') // "Assistir"
  await page.waitForSelector('.player-chrome', { state: 'attached', timeout: 8000 })
  await page.waitForFunction((count) => window.__avplay.calls.filter((call) => call === 'play').length > count, before, { timeout: 8000 })
  await page.waitForTimeout(250)
}

/** Foca a linha do painel de faixas pelo nome (a ordem depende das faixas do motor). */
async function focusRow(page, name) {
  for (let i = 0; i < 24; i += 1) {
    const text = (await tracksDialog(page).locator('.tv-focus').first().innerText().catch(() => '')) ?? ''
    if (text.includes(name)) return true
    await page.keyboard.press('ArrowDown')
  }
  return false
}

async function openSearchDialog(page) {
  await press(page, 'ArrowRight', 2) // ▶⏸ → ⏩ → "Áudio e legendas"
  await eventually(() => isFocused(page.getByRole('button', { name: 'Áudio e legendas' })), '→ → chega em "Áudio e legendas"')
  await page.keyboard.press('Enter')
  await tracksDialog(page).waitFor({ timeout: 4000 })
  assert(await focusRow(page, 'Buscar legenda online'), 'o painel tem a linha "Buscar legenda online" (existe só por causa da externa: o motor não informou faixas)')
  await page.keyboard.press('Enter')
  await searchDialog(page).waitFor({ timeout: 4000 })
}

async function run() {
  const server = await startFixtureServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/player-chrome.m3u`
  const vite = await startCommercialVite()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = existsSync(fixedPath) ? await chromium.launch({ headless: true, executablePath: fixedPath }) : await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  await context.addInitScript(installFakeAvplay)
  const sim = { mode: 'ok', subdl: 'ok', calls: [] }
  await installRoutes(context, sim)
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    console.log('=== Adicionar fonte M3U fictícia ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 20000 })
    await cadastrarListaM3u(page, { nome: SOURCE_NAME, url: m3uUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
    console.log('  ✓ importação concluída')

    console.log('=== B1: tocar um filme não chama o serviço de legendas ===')
    await openMovie(page)
    await page.waitForTimeout(1500)
    assert(sim.calls.length === 0, `nenhuma requisição de legenda ao abrir e tocar (${sim.calls.length})`)

    console.log('=== B2/B12b: buscar — lista única com os dois fornecedores ===')
    await openSearchDialog(page)
    const dialog = searchDialog(page)
    await eventually(() => dialog.getByRole('button', { name: /OpenSubtitles/ }).first().isVisible(), 'resultado do OpenSubtitles aparece')
    assert(await dialog.getByRole('button', { name: /SubDL/ }).first().isVisible(), 'resultado do SubDL na mesma lista, com o nome do fornecedor')
    const firstSearch = subtitleCalls(sim, 'search')[0]
    assert(firstSearch.body.language === 'pt-BR', 'a busca saiu no idioma do app (pt-BR)')
    assert(await dialog.getByText('Busca por nome — confira a sincronia').isVisible(), 'filme sem TMDB: aviso de busca por nome')
    assert(await isFocused(dialog.getByRole('button', { name: /OpenSubtitles/ }).first()), 'o foco chega ao primeiro resultado')

    console.log('=== B3: trocar o idioma refaz a busca ===')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await eventually(() => subtitleCalls(sim, 'search').some((call) => call.body.language === 'en'), 'nova busca em en')
    await eventually(() => dialog.getByRole('button', { name: /OpenSubtitles/ }).first().isVisible(), 'resultados em inglês')
    await page.keyboard.press('ArrowUp') // de volta à linha de idiomas
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await eventually(() => subtitleCalls(sim, 'search').filter((call) => call.body.language === 'pt-BR').length >= 2, 'volta a pt-BR com nova busca')
    await eventually(() => dialog.getByRole('button', { name: /OpenSubtitles/ }).first().isVisible(), 'resultados de volta')

    console.log('=== B4: aplicar — a fala aparece no tempo e o vídeo não é interrompido ===')
    await page.keyboard.press('Enter') // o foco já está no 1º resultado (OpenSubtitles)
    const external = tracksDialog(page).getByRole('radio', { name: 'Externa — Português (Brasil)' })
    await eventually(async () => (await external.getAttribute('aria-checked')) === 'true', '"Externa — Português (Brasil)" marcada')
    assert(subtitleCalls(sim, 'download').length === 1 && subtitleCalls(sim, 'download')[0].body.id === 'os:1', 'um download, do resultado escolhido')
    await page.evaluate(() => window.__avplay.tick(1500))
    await eventually(() => page.getByText('Fala em português').isVisible(), 'a fala aparece no tempo certo')
    await page.evaluate(() => window.__avplay.tick(5000))
    await eventually(async () => (await page.getByText('Fala em português').count()) === 0, 'passada a fala, a linha some')

    console.log('=== B12: o que sai da TV e o que volta ===')
    const allowed = new Set(['language', 'tmdbId', 'parentTmdbId', 'season', 'episode', 'query', 'year', 'id', 'providers'])
    const leaks = sim.calls.filter((call) => call.body).flatMap((call) => Object.keys(call.body)).filter((key) => !allowed.has(key))
    assert(leaks.length === 0, `corpos só com campos do contrato (extras: ${JSON.stringify(leaks)})`)
    const printed = JSON.stringify(sim.calls)
    assert(!/https?:|api_key|apikey|password|username/i.test(printed), 'nenhuma URL, usuário, senha ou chave nos corpos')
    assert(!/Fonte E2E|player-chrome|127\.0\.0\.1/.test(printed), 'nada da lista IPTV no pedido')

    console.log('=== B7: fechar e reabrir o filme — a legenda volta sozinha, sem requisição ===')
    const callsBefore = sim.calls.length
    await page.keyboard.press('Escape') // painel
    await page.keyboard.press('Escape') // player
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await watch(page)
    await page.waitForTimeout(2200) // o passo ocioso depois do primeiro `playing`
    await page.evaluate(() => window.__avplay.tick(1500))
    await eventually(() => page.getByText('Fala em português').isVisible(), 'a legenda reaplicada aparece')
    assert(sim.calls.length === callsBefore, `nenhuma requisição ao retomar (${sim.calls.length - callsBefore})`)

    console.log('=== B12c: um fornecedor fora do ar vira aviso, não erro ===')
    sim.mode = 'subdlDown'
    await openSearchDialog(page)
    await eventually(() => searchDialog(page).getByText('SubDL indisponível agora').isVisible(), 'aviso "SubDL indisponível agora" com os resultados do outro')
    assert(await searchDialog(page).getByRole('button', { name: /OpenSubtitles/ }).first().isVisible(), 'os resultados do OpenSubtitles continuam')
    await page.keyboard.press('Escape')

    console.log('=== B10: sem rede — erro com "Tentar de novo" focado e o vídeo segue ===')
    sim.mode = 'offline'
    const closesBefore = await page.evaluate(() => window.__avplay.calls.filter((call) => call === 'close').length)
    await page.keyboard.press('Enter')
    await searchDialog(page).waitFor({ timeout: 4000 })
    const retry = searchDialog(page).getByRole('button', { name: 'Tentar de novo' })
    await retry.waitFor({ timeout: 6000 })
    assert(await searchDialog(page).getByText('Sem conexão com o serviço de legendas.').isVisible(), 'mensagem de falta de conexão')
    await eventually(() => isFocused(retry), '"Tentar de novo" tem o foco')
    assert((await page.evaluate(() => window.__avplay.calls.filter((call) => call === 'close').length)) === closesBefore, 'o motor não foi fechado: o vídeo segue')
    sim.mode = 'ok'
    await page.keyboard.press('Enter')
    await eventually(() => searchDialog(page).getByRole('button', { name: /OpenSubtitles/ }).first().isVisible(), '"Tentar de novo" busca e traz os resultados')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    console.log('=== B13: Integrações → Legendas → SubDL → chave pessoal ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card, .home-content', { timeout: 15000 })
    if (await page.locator('.source-card').first().isVisible().catch(() => false)) await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    await press(page, 'ArrowUp', 6)
    await press(page, 'ArrowLeft', 6)
    await press(page, 'ArrowRight', 6) // Configurações
    await page.keyboard.press('Enter')
    await page.waitForSelector('.settings-screen', { timeout: 8000 })
    await page.getByRole('button', { name: /Integrações/ }).first().click()
    const section = page.getByRole('region', { name: 'Legendas' })
    await section.waitFor({ timeout: 8000 })
    const subdlRow = section.locator('[data-provider="subdl"]')
    assert(await section.locator('[data-provider="opensubtitles"]').isVisible(), 'a seção tem uma linha para cada fornecedor')
    await subdlRow.getByRole('button', { name: 'Adicionar chave' }).click()
    const keyDialog = page.getByRole('dialog', { name: 'Chave do SubDL' })
    await keyDialog.waitFor({ timeout: 4000 })
    const field = keyDialog.getByRole('textbox', { name: 'Chave' })
    assert((await field.inputValue()) === '' && (await field.getAttribute('type')) === 'password', 'campo vazio e oculto')
    await field.fill(SUBDL_KEY)
    await keyDialog.getByRole('button', { name: 'Salvar e testar' }).click()
    await keyDialog.waitFor({ state: 'detached', timeout: 6000 })
    await eventually(async () => (await subdlRow.innerText()).includes('Sua chave — válida'), 'estado "Sua chave — válida"')
    assert(!(await page.content()).includes(SUBDL_KEY), 'a chave digitada não aparece em lugar nenhum da página')

    console.log('=== B14: com a chave do SubDL, a busca dele vai direto e o serviço só recebe o OpenSubtitles ===')
    sim.calls.length = 0
    await openMovie(page)
    await openSearchDialog(page)
    await eventually(() => searchDialog(page).getByText(/SubDL/).first().isVisible(), 'resultado do SubDL (direto)')
    const portalSearch = subtitleCalls(sim, 'search').at(-1)
    assert(JSON.stringify(portalSearch.body.providers) === '["opensubtitles"]', 'o serviço foi pedido só para o OpenSubtitles')
    assert(subtitleCalls(sim, 'subdl-direct').some((call) => call.hasKey), 'a TV falou direto com o SubDL, com a chave pessoal')

    console.log('=== B15: chave recusada — aviso e "Usar o padrão do ccplayTv", sem trocar sozinho ===')
    sim.subdl = 'rejected'
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter') // refaz a busca no mesmo idioma
    await eventually(() => searchDialog(page).getByText('Sua chave do SubDL foi recusada.').isVisible(), 'aviso na busca')
    const before = subtitleCalls(sim, 'search').length
    const useDefault = searchDialog(page).getByRole('button', { name: 'Usar o padrão do ccplayTv' })
    await useDefault.waitFor({ timeout: 4000 })
    assert(subtitleCalls(sim, 'search').at(-1).body.providers?.length === 1, 'enquanto a pessoa não pede, o serviço segue sem o SubDL')
    await page.keyboard.press('ArrowDown') // o foco estava no 1º resultado; a ação vem logo depois da lista
    await eventually(() => isFocused(useDefault), 'a ação tem o foco (nada trocou sozinho)')
    await page.keyboard.press('Enter')
    await eventually(() => subtitleCalls(sim, 'search').length > before, 'depois da ação, a busca é repetida')
    await eventually(() => searchDialog(page).getByRole('button', { name: /SubDL/ }).first().isVisible(), 'o SubDL volta pelo padrão do serviço')
    assert(subtitleCalls(sim, 'search').at(-1).body.providers === undefined, 'o pedido ao serviço volta a cobrir os dois fornecedores')

    console.log('=== B16: remover a chave ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card, .home-content', { timeout: 15000 })
    if (await page.locator('.source-card').first().isVisible().catch(() => false)) await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    await press(page, 'ArrowUp', 6)
    await press(page, 'ArrowLeft', 6)
    await press(page, 'ArrowRight', 6)
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: /Integrações/ }).first().click()
    const row = page.getByRole('region', { name: 'Legendas' }).locator('[data-provider="subdl"]')
    await row.getByRole('button', { name: 'Remover' }).click()
    await row.getByRole('button', { name: 'Adicionar chave' }).waitFor({ timeout: 4000 })
    const stored = await page.evaluate(async () => {
      const { db } = await import('/src/lib/catalog/db.ts')
      return db.table('subtitleCredentials').count()
    })
    assert(stored === 0, 'a chave saiu do IndexedDB')
  } finally {
    await browser.close()
    server.close()
    vite.kill()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nlegendas-externas: tudo verde')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
