// Roteiro E2E da feature 057 (Top 10 da semana e Dica, TMDB, em Filmes e Séries; o Início deixou de tê-los no ad-hoc de
// 2026-10-09) — gate da constitution ("Testes E2E antes
// da validação em TV"). Capturas em `test-results/top10-dica-tmdb/`.
//
// Painel Xtream FICTÍCIO e TMDB SIMULADO (interceptação de `api.themoviedb.org`, nunca a rede real), ambos criados por este script.
// A chave TMDB é uma sequência fictícia semeada direto no IndexedDB. Mede:
//  - sem chave nada do TMDB é pedido e nenhuma fileira aparece (Início, Filmes, Séries) — nem como "Em breve";
//  - com chave: Top 10 de filmes/séries com a posição REAL do TMDB (1, 3, 4 / 2, 3, 4: sem renumerar), só o que existe na lista,
//    a versão principal (nunca a "[L]"), "Fonte: TMDB", aviso de cobertura parcial; Dica com 5+ títulos sem duplicata; as mesmas
//    fileiras no Início; focar não consulta nada; OK abre o título e voltar restaura o foco;
//  - cada consulta acontece uma vez só (o cache do aparelho serve as demais aberturas) e a Dica é a mesma ao voltar à tela;
//  - sem rede e com o cache de outra semana/dia, as fileiras vêm do último resultado; sem chave voltam a sumir;
//  - a chave nunca aparece no DOM nem no console.
//
// Pré-requisito: `npm run dev` em http://localhost:5173. Dados só fictícios.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { enterRows, focusedRowLabel, gotoRow, openShowcase, openVodCategory, openViaTopbar } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const SHOTS = path.join(process.cwd(), 'test-results', 'top10-dica-tmdb')
const LISTA = 'Fonte E2E Top10 Dica'
const KEY = '0123456789abcdef0123456789abcdef' // fictícia (formato v3)
const YEAR = new Date().getFullYear() - 1

let failures = 0
let step = ''

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

const NUMEROS = ['Um', 'Dois', 'Tres', 'Quatro', 'Cinco', 'Seis']

/** Painel fictício: filmes (cat. 10; a 11 sempre falha → cobertura parcial) e séries (cat. 20), com ano e nota. */
function startPanel() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (url.pathname === '/capa.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(CAPA)
        return
      }
      if (url.pathname !== '/player_api.php') {
        res.writeHead(404)
        res.end('não encontrado')
        return
      }
      const base = `http://127.0.0.1:${server.address().port}`
      const action = url.searchParams.get('action')
      if (action === 'get_vod_streams' && url.searchParams.get('category_id') === '11') {
        res.writeHead(500)
        res.end('falha simulada')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return res.end('[]')
      if (action === 'get_vod_categories') {
        return res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes | Lançamentos' }, { category_id: '11', category_name: 'Filmes | Fora do ar' }]))
      }
      if (action === 'get_series_categories') return res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries | Novas' }]))
      const icon = `${base}/capa.png`
      if (action === 'get_vod_streams') {
        let id = 0
        const film = (name) => ({ name, stream_id: (id += 1), category_id: '10', stream_icon: icon, year: String(YEAR), rating: '7.5', added: '1700000000' })
        return res.end(JSON.stringify([film('Filme Um [L]'), ...NUMEROS.map((n) => film(`Filme ${n}`)), film('Filme Fora do Ranking')]))
      }
      if (action === 'get_series') {
        let id = 0
        const show = (name) => ({ name, series_id: (id += 1), category_id: '20', cover: icon, year: String(YEAR), releaseDate: `${YEAR}-03-03`, rating: '7.5', last_modified: '1700000000' })
        return res.end(JSON.stringify([...NUMEROS.map((n) => show(`Serie ${n}`)), show('Serie Fora do Ranking')]))
      }
      return res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/** TMDB simulado: ranking semanal (com um título que não está na lista) e candidatos da Dica (só a 1ª página traz títulos). */
function tmdbBody(pathname, page) {
  const movie = (id, title) => ({ id, title, original_title: title, release_date: `${YEAR}-03-03`, vote_average: 8.1, vote_count: 900, popularity: 50 })
  const show = (id, name) => ({ id, name, original_name: name, first_air_date: `${YEAR}-03-03`, vote_average: 8.3, vote_count: 400, popularity: 60 })
  if (pathname === '/3/trending/movie/week') {
    return { results: [movie(1, 'Filme Um'), movie(2, 'Filme Ausente'), movie(3, 'Filme Dois'), movie(4, 'Filme Tres')] } // posições 1, 3 e 4 existem
  }
  if (pathname === '/3/trending/tv/week') {
    return { results: [show(11, 'Serie Ausente'), show(12, 'Serie Um'), show(13, 'Serie Dois'), show(14, 'Serie Tres')] } // posições 2, 3 e 4 existem
  }
  if (pathname === '/3/discover/movie') return { results: page === '1' ? NUMEROS.map((n, i) => movie(100 + i, `Filme ${n}`)) : [] }
  if (pathname === '/3/discover/tv') return { results: page === '1' ? NUMEROS.map((n, i) => show(200 + i, `Serie ${n}`)) : [] }
  return null
}

const SEEDS = {
  putKey: (key) =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('ccplaytv')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('integrations', 'readwrite')
        tx.objectStore('integrations').put({ id: 'tmdb', key, format: 'v3', state: 'connected', lastTestedAt: 0 })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    }),
  staleCache: () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('ccplaytv')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('discoveryCache', 'readwrite')
        const store = tx.objectStore('discoveryCache')
        store.getAll().onsuccess = (event) => {
          for (const row of event.target.result) store.put({ ...row, periodKey: row.source === 'trending' ? '2000-W01' : '2000-01-01' })
        }
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    }),
  dropKeyAndCache: () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('ccplaytv')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(['integrations', 'discoveryCache'], 'readwrite')
        tx.objectStore('integrations').delete('tmdb')
        tx.objectStore('discoveryCache').clear()
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    }),
  cacheCount: () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('ccplaytv')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const request = db.transaction('discoveryCache', 'readonly').objectStore('discoveryCache').count()
        request.onsuccess = () => {
          db.close()
          resolve(request.result)
        }
        request.onerror = () => reject(request.error)
      }
    }),
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const rowLabels = (page, root) => page.locator(`${root} section`).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
// Feature 060: o Início tem cards próprios (`.home-card`, numeral `.home-rank-numeral`); Filmes/Séries seguem com `.content-card`.
const ranksOf = (page, selector) => page.locator(`${selector} .content-card-rank, ${selector} .home-rank-numeral`).allTextContents().then((all) => all.map(clean))
const titlesOf = (page, selector) => page.locator(`${selector} .content-card-title, ${selector} .home-card-title`).allTextContents().then((all) => all.map(clean))
const isDiscovery = (label) => typeof label === 'string' && (/em alta esta semana/i.test(label) || label.startsWith('Dica'))

async function addSource(page, port) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaXtream(page, { nome: LISTA, servidor: `http://127.0.0.1:${port}`, usuario: 'usuario', senha: 'senha' })
  await page.waitForSelector('text=/Concluída/', { timeout: 30000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 8000 })
}

async function enterSource(page) {
  await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 15000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 10000 })
}

async function reopenApp(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.source-card-wrap', { timeout: 15000 })
  await enterSource(page)
}

async function goHome(page) {
  await openViaTopbar(page, 'home')
  await page.waitForSelector('.home-content', { timeout: 10000 })
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const server = await startPanel()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const pageErrors = []
  const consoleTexts = []
  const externalHosts = new Set()
  const tmdbCalls = []
  let tmdbOnline = true
  page.on('pageerror', (error) => pageErrors.push(`[${step}] ${String(error).slice(0, 90)}`))
  page.on('console', (message) => consoleTexts.push(message.text()))
  page.on('request', (request) => {
    const parsed = new URL(request.url())
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') externalHosts.add(parsed.hostname)
  })
  await context.route('https://api.themoviedb.org/**', async (route) => {
    const url = new URL(route.request().url())
    tmdbCalls.push(`${url.pathname}${url.searchParams.get('page') ? `?page=${url.searchParams.get('page')}` : ''}`)
    const body = tmdbOnline ? tmdbBody(url.pathname, url.searchParams.get('page') ?? '1') : null
    if (body === null) return route.abort('failed')
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  const callsTo = (prefix) => tmdbCalls.filter((call) => call.startsWith(prefix)).length

  try {
    console.log((step = '=== Fonte fictícia ==='))
    await addSource(page, server.address().port)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log((step = '=== Obtém as categorias de filmes e de séries (entrando nelas) ==='))
    await openShowcase(page, 'movies')
    await openVodCategory(page, 'Lançamentos')
    await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await openViaTopbar(page, 'series')
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    await openVodCategory(page, 'Novas')
    await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })

    console.log((step = '=== Sem chave TMDB: nenhuma fileira e nenhuma requisição ==='))
    await goHome(page)
    await page.waitForTimeout(600)
    assert(!(await rowLabels(page, '.home-content')).some(isDiscovery), 'Início sem chave: nenhuma linha Top 10/Dica')
    await openShowcase(page, 'movies')
    await page.waitForTimeout(600)
    assert(!(await rowLabels(page, '.vod-showcase')).some(isDiscovery), 'Filmes sem chave: nenhuma fileira Top 10/Dica (nem "Em breve")')
    assert(tmdbCalls.length === 0, `sem chave nada é pedido ao TMDB (${tmdbCalls.length})`)

    console.log((step = '=== Com chave: o Início continua sem Top 10/Dica (ad-hoc 2026-10-09) ==='))
    // O Início só tem fileiras do aparelho desde o ad-hoc de 2026-10-09; Top 10 e Dica ficam nas vitrines de Filmes e Séries.
    await page.evaluate(SEEDS.putKey, KEY)
    await goHome(page)
    await page.waitForTimeout(1500)
    assert(!(await rowLabels(page, '.home-content')).some(isDiscovery), 'Início com chave: nenhuma linha Top 10/Dica')
    await shot(page, '01-inicio')

    console.log((step = '=== Filmes: Top 10 e Dica ==='))
    await openShowcase(page, 'movies')
    await enterRows(page)
    await gotoRow(page, 'Em alta esta semana', ['Lançamentos', 'Fora do ar'])
    const topRow = 'section.vod-row[aria-label="Em alta esta semana"]'
    await page.waitForSelector(`${topRow} .content-card`, { timeout: 10000 })
    assert((await page.locator(`${topRow} .vod-slot-card`).count()) === 0, 'fileira real: sem "Em breve"')
    assert((await page.locator(`${topRow} .vod-see-all-card`).count()) === 0, 'sem "Ver tudo"')
    assert(JSON.stringify(await ranksOf(page, topRow)) === JSON.stringify(['1', '2', '3']), `Filmes: numeração 1, 2 e 3 na fileira (${await ranksOf(page, topRow)})`)
    assert(clean(await page.locator(`${topRow} .vod-row-source`).textContent()) === 'Fonte: TMDB', 'Filmes: "Fonte: TMDB"')
    assert(clean(await page.locator(`${topRow} .vod-row-coverage`).textContent()) === 'Com base em 1 de 2 categorias', 'Filmes: aviso de cobertura parcial')
    assert((await page.locator('.vod-hero-band').count()) === 0, 'Top 10 de Filmes sem hero')
    await page.keyboard.press('ArrowRight')
    assert(clean(await page.locator(`${topRow} .content-card:has(.tv-focus) .content-card-rank`).textContent()) === '2', 'foco no 2º card numerado da fileira')
    await page.keyboard.press('ArrowLeft')
    await shot(page, '03-filmes-top10')
    const callsBeforeMove = tmdbCalls.length
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert(tmdbCalls.length === callsBeforeMove, 'mover o foco na fileira não consulta o TMDB')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 10000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await page.waitForFunction(() => document.querySelector('.vod-showcase .tv-focus') !== null, null, { timeout: 8000 })
    assert((await focusedRowLabel(page)) === 'Em alta esta semana', `voltar restaura a fileira (${await focusedRowLabel(page)})`)
    await gotoRow(page, 'Dica de filme', ['Lançamentos', 'Fora do ar'])
    const tipRow = 'section.vod-row[aria-label="Dica de filme"]'
    await page.waitForSelector(`${tipRow} .content-card`, { timeout: 10000 })
    const tipFirst = await titlesOf(page, tipRow)
    assert(tipFirst.length >= 5 && !tipFirst.some((title) => title.includes('[L]')), `Dica de filme: ${tipFirst.length} cards, nenhum "[L]"`)
    assert(clean(await page.locator(`${tipRow} .vod-row-source`).textContent()) === 'Fonte: TMDB', 'Dica: "Fonte: TMDB"')
    await shot(page, '04-filmes-dica')

    console.log((step = '=== Séries: Top 10 e Dica ==='))
    await openViaTopbar(page, 'series')
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    await enterRows(page)
    await gotoRow(page, 'Em alta esta semana', ['Novas'])
    const showRow = 'section.vod-row[aria-label="Em alta esta semana"]'
    await page.waitForSelector(`${showRow} .content-card`, { timeout: 10000 })
    assert(JSON.stringify(await ranksOf(page, showRow)) === JSON.stringify(['1', '2', '3']), `Séries: numeração 1, 2 e 3 na fileira (${await ranksOf(page, showRow)})`)
    assert(!(await titlesOf(page, showRow)).some((title) => title.includes('Fora do Ranking')), 'Séries: só o que o ranking trouxe')
    await gotoRow(page, 'Dica de série', ['Novas'])
    assert((await page.locator('section.vod-row[aria-label="Dica de série"] .content-card').count()) >= 5, 'Séries: Dica de série com 5+ cards')
    await shot(page, '05-series')

    console.log((step = '=== A Dica é a mesma ao voltar à tela; o cache evita novas consultas ==='))
    await openViaTopbar(page, 'movies')
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    await enterRows(page)
    await gotoRow(page, 'Dica de filme', ['Lançamentos', 'Fora do ar'])
    const tipAgain = await titlesOf(page, tipRow)
    assert(JSON.stringify(tipAgain) === JSON.stringify(tipFirst), 'mesma Dica, mesma ordem, no mesmo dia')
    assert(callsTo('/3/trending/movie/week') === 1 && callsTo('/3/trending/tv/week') === 1, `ranking: uma consulta por tipo (${callsTo('/3/trending/movie/week')}, ${callsTo('/3/trending/tv/week')})`)
    assert(callsTo('/3/discover/movie') === 8 && callsTo('/3/discover/tv') === 8, `Dica: 8 páginas por tipo, uma vez (${callsTo('/3/discover/movie')}, ${callsTo('/3/discover/tv')})`)

    console.log((step = '=== Sem rede e com o cache de outra semana/dia: as fileiras vêm do último resultado ==='))
    await page.evaluate(SEEDS.staleCache)
    tmdbOnline = false
    const callsBeforeOffline = tmdbCalls.length
    await reopenApp(page)
    // Desde o ad-hoc de 2026-10-09 o Top 10 só existe nas vitrines: a verificação offline é pela de Filmes.
    await openShowcase(page, 'movies')
    const offlineTop = 'section.vod-row[aria-label="Em alta esta semana"]'
    await page.waitForSelector(`${offlineTop} .content-card`, { timeout: 20000 })
    assert(callsTo('/3/trending/movie/week') > 1 || tmdbCalls.length > callsBeforeOffline, 'tentou a rede (que falhou) antes de usar o cache')
    assert(JSON.stringify(await ranksOf(page, offlineTop)) === JSON.stringify(['1', '2', '3']), 'Filmes offline: a última fileira em alta guardada')
    assert((await page.locator('.error-state, [role="alert"]').count()) === 0, 'nenhum erro na tela sem rede')
    await shot(page, '06-filmes-offline-com-cache')

    console.log((step = '=== Sem chave de novo: as fileiras somem ==='))
    tmdbOnline = true
    await page.evaluate(SEEDS.dropKeyAndCache)
    assert((await page.evaluate(SEEDS.cacheCount)) === 0, 'o cache da descoberta foi esvaziado')
    const callsBeforeNoKey = tmdbCalls.length
    await reopenApp(page)
    await page.waitForTimeout(800)
    assert(!(await rowLabels(page, '.home-content')).some(isDiscovery), 'Início sem chave: sem Top 10/Dica')
    await openShowcase(page, 'movies')
    await page.waitForTimeout(500)
    assert(!(await rowLabels(page, '.vod-showcase')).some(isDiscovery), 'Filmes sem chave: sem Top 10/Dica')
    assert(tmdbCalls.length === callsBeforeNoKey, 'sem chave nada é pedido ao TMDB')

    const html = await page.content()
    assert(!html.includes(KEY), 'a chave nunca aparece no DOM')
    assert(!consoleTexts.some((text) => text.includes(KEY)), 'a chave nunca aparece no console')
    assert([...externalHosts].every((host) => host === 'api.themoviedb.org'), `só o TMDB como host externo (${[...externalHosts].join(', ') || 'nenhum'})`)
    assert(pageErrors.length === 0, `sem erros de página: ${pageErrors.slice(0, 2).join(' | ') || 'ok'}`)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTudo certo.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
