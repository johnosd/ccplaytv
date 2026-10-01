// Roteiro E2E da feature 035 (Semelhantes, fotos do elenco e página de ator) —
// gate da constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre o que só um Chromium real prova: painel Xtream e TMDB fictícios (o TMDB
// por `page.route`, contando requisições) → aba Semelhantes (encontrados
// primeiro, chip, cobertura, resumo, "Configurar TMDB"), aba Elenco com foto
// CARREGADA e marcador neutro, página de ator (rails, RETURN em cadeia, erro
// com "Tentar de novo"), zero requisição ao focar/trocar de aba (SC-001/SC-005),
// 10 sequências detalhe → semelhante → detalhe (SC-003) e remover a chave.
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173).
// Dados: só fictícios, montados aqui; nenhuma chamada real, nenhuma chave real.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'
const GOOD_KEY = '0123456789abcdef0123456789abcdef'

/** PNG 1×1 — serve de foto e de pôster do TMDB. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function assertOneFocus(page, step) {
  const count = await page.locator('.tv-focus').count()
  assert(count === 1, `foco (${step}): exatamente um .tv-focus na tela (achou ${count})`)
}

const hits = { tmdb: [], panelUrls: [] }
const tmdbCount = (path) => hits.tmdb.filter((entry) => entry === path).length
const tmdbTotal = () => hits.tmdb.length
/** Modo de falha do `/person/2975` (o de "Laurence Fishburne"). */
const state = { personFails: true }

function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname === '/player_api.php') {
      hits.panelUrls.push(url.href)
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return void res.end('[]')
      if (action === 'get_series_categories' || action === 'get_series') return void res.end('[]')
      if (action === 'get_vod_categories') return void res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes' }]))
      if (action === 'get_vod_streams') {
        return void res.end(
          JSON.stringify([
            { name: 'Matrix', stream_id: 1, category_id: '10', year: 1999 },
            { name: 'Matrix Reloaded (2003)', stream_id: 2, category_id: '10', year: 2003 },
          ]),
        )
      }
      if (action === 'get_vod_info') {
        // O provedor só declara o tmdb_id do "Matrix": tudo o mais (elenco, semelhantes) é do TMDB.
        const id = url.searchParams.get('vod_id')
        return void res.end(JSON.stringify({ info: id === '1' ? { tmdb_id: 603 } : {}, movie_data: {} }))
      }
      return void res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    }
    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const MATRIX_DETAIL = {
  id: 603,
  title: 'Matrix',
  original_language: 'en',
  release_date: '1999-03-31',
  overview: 'Um hacker descobre a verdade.',
  credits: {
    cast: [
      { id: 6384, name: 'Keanu Reeves', character: 'Neo', profile_path: '/keanu.png', order: 0 },
      { id: 2975, name: 'Laurence Fishburne', character: '', profile_path: null, order: 1 },
    ],
    crew: [],
  },
  videos: { results: [] },
  recommendations: {
    results: [
      { id: 604, title: 'Matrix Reloaded', original_title: 'The Matrix Reloaded', release_date: '2003-05-15', poster_path: '/reloaded.png', overview: 'Neo continua.' },
      { id: 605, title: 'Matrix Revolutions', release_date: '2003-11-05', poster_path: '/rev.png', overview: 'A guerra final entre homens e máquinas.' },
      { id: 603, title: 'Matrix', release_date: '1999-03-31' },
    ],
  },
  similar: { results: [{ id: 604, title: 'Matrix Reloaded', release_date: '2003-05-15' }, { id: 606, title: 'Animatrix', release_date: '2003-06-03' }] },
}

const KEANU = {
  id: 6384,
  name: 'Keanu Reeves',
  profile_path: '/keanu.png',
  biography: 'Nunca exibida.',
  combined_credits: {
    cast: [
      { id: 603, media_type: 'movie', title: 'Matrix', release_date: '1999-03-31', popularity: 90 },
      { id: 604, media_type: 'movie', title: 'Matrix Reloaded', original_title: 'The Matrix Reloaded', release_date: '2003-05-15', popularity: 80 },
      { id: 700, media_type: 'movie', title: 'Filme Fora', release_date: '2010-01-01', popularity: 70 },
      { id: 800, media_type: 'tv', name: 'Série Fora', first_air_date: '2016-08-01', genre_ids: [35], popularity: 60 },
    ],
  },
}

async function installFakeTmdb(page) {
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
  await page.route('https://api.themoviedb.org/**', async (route) => {
    const url = new URL(route.request().url())
    hits.tmdb.push(url.pathname)
    if (url.searchParams.get('api_key') !== GOOD_KEY) return route.fulfill({ status: 401, headers: cors, body: '{"success":false}' })
    if (url.pathname === '/3/authentication') return route.fulfill({ status: 200, headers: cors, body: '{"success":true}' })
    if (url.pathname === '/3/movie/603') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(MATRIX_DETAIL) })
    if (url.pathname === '/3/person/6384') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(KEANU) })
    if (url.pathname === '/3/person/2975') {
      return state.personFails
        ? route.fulfill({ status: 500, headers: cors, body: '{}' })
        : route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: 2975, name: 'Laurence Fishburne', combined_credits: { cast: [] } }) })
    }
    // A busca responde 200 com lista vazia, como o TMDB de verdade.
    if (url.pathname.startsWith('/3/search/')) return route.fulfill({ status: 200, headers: cors, body: '{"results":[]}' })
    return route.fulfill({ status: 404, headers: cors, body: '{"status_code":34}' })
  })
  await page.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
}

async function addSource(page, m3uUrl, displayName) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: displayName, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.topbar', { timeout: 8000 })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function enterFirstRealCategory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

const MOVIE_ORDER = ['Matrix', 'Matrix Reloaded (2003)']
const focusedCardTitle = (page) =>
  page.evaluate(() => document.querySelector('.tv-focus')?.closest('.content-card')?.querySelector('.content-card-title')?.textContent ?? null)

async function focusCardByTitle(page, title) {
  for (let attempt = 0; attempt < MOVIE_ORDER.length + 2; attempt += 1) {
    const current = await focusedCardTitle(page)
    if (current === title) return
    const from = MOVIE_ORDER.indexOf(current)
    const to = MOVIE_ORDER.indexOf(title)
    await page.keyboard.press(from === -1 || to > from ? 'ArrowRight' : 'ArrowLeft')
  }
  throw new Error(`não consegui focar o card "${title}"`)
}

/** Da grade de filmes: abre o detalhe de `title`. */
async function openMovie(page, title) {
  await focusCardByTitle(page, title)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
}

const detailTitle = (page) => page.locator('.vod-detail-title').textContent()
const activeTab = (page) => page.locator('[role="tab"][aria-selected="true"]').textContent()
/** Título do cartão de Semelhantes com foco. */
const focusedSimilar = (page) =>
  page.evaluate(() => document.querySelector('.similar-row .tv-focus')?.closest('.content-card')?.querySelector('.content-card-title')?.textContent ?? null)
const focusedPerson = (page) =>
  page.evaluate(() => document.querySelector('.cast-people-row .tv-focus')?.closest('.cast-person')?.querySelector('.cast-person-name')?.textContent ?? null)

/** Das ações do detalhe até a aba (Detalhes → Elenco → Semelhantes) ativa. */
async function openTab(page, name) {
  await page.keyboard.press('ArrowDown')
  const steps = name === 'Elenco' ? 1 : 2
  for (let i = 0; i < steps; i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function putTmdbKey(page) {
  await page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('ccplaytv')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const idb = open.result
          const tx = idb.transaction('integrations', 'readwrite')
          tx.objectStore('integrations').put({ id: 'tmdb', key, format: 'v3', state: 'connected', lastTestedAt: Date.now() })
          tx.oncomplete = () => {
            idb.close()
            resolve(undefined)
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    GOOD_KEY,
  )
}

const idbCount = (page, table) =>
  page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('ccplaytv')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const idb = open.result
          const request = idb.transaction(name, 'readonly').objectStore(name).count()
          request.onsuccess = () => {
            idb.close()
            resolve(request.result)
          }
          request.onerror = () => reject(request.error)
        }
      }),
    table,
  )

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function run() {
  const server = await startPanelServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const m3uUrl = `${base}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleLines.push(msg.text()))

  try {
    await installFakeTmdb(page)
    await addSource(page, m3uUrl, 'Fonte E2E Semelhantes')
    await page.route(`${base}/movie/**`, () => {})

    console.log('=== Cenário 3: sem chave — "Configurar TMDB" leva a Integrações e RETURN volta à aba ===')
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    await openMovie(page, 'Matrix')
    await openTab(page, 'Semelhantes')
    assert((await activeTab(page)) === 'Semelhantes', 'a aba Semelhantes é real e ficou ativa')
    await page.getByText(/Semelhantes vêm do TMDB/).waitFor({ timeout: 5000 })
    assert(!(await page.locator('body').innerText()).includes('Em breve'), 'sem "Em breve" na aba')
    await page.keyboard.press('ArrowDown')
    assert(((await page.locator('.tv-focus').textContent()) ?? '').includes('Configurar TMDB'), '"Configurar TMDB" recebe o foco')
    await assertOneFocus(page, 'sem chave')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.settings-screen', { timeout: 8000 })
    assert((await page.locator('.settings-screen').textContent())?.includes('TMDB') ?? false, 'abriu Configurações › Integrações & BYOK')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    assert((await detailTitle(page)) === 'Matrix' && (await activeTab(page)) === 'Semelhantes', 'RETURN volta ao detalhe na aba Semelhantes')
    assert(tmdbTotal() === 0, 'sem chave: nenhuma requisição ao TMDB')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    console.log('=== Cenário 1/7: com chave — uma consulta ao abrir; zero requisições a mais ao usar as abas ===')
    await putTmdbKey(page)
    await openMovie(page, 'Matrix')
    await page.waitForFunction(() => document.querySelector('.vod-detail-synopsis')?.textContent?.includes('hacker'), null, { timeout: 10000 })
    assert(tmdbCount('/3/movie/603') === 1, `abrir o detalhe fez exatamente uma consulta ao TMDB (${tmdbCount('/3/movie/603')})`)
    const afterOpen = tmdbTotal()
    await openTab(page, 'Semelhantes')
    await page.waitForSelector('.similar-row .content-card', { timeout: 8000 })
    assert(
      (await page.getByText(/Procurado em \d+ de \d+ categorias de filmes/).count()) === 1,
      'mostra a cobertura "Procurado em X de Y categorias de filmes"',
    )
    const titles = await page.locator('.similar-row .content-card-title').allTextContents()
    assert(JSON.stringify(titles) === JSON.stringify(['Matrix Reloaded', 'Matrix Revolutions', 'Animatrix']), `ordem: encontrado primeiro, depois os demais na ordem do TMDB (${titles.join(' | ')})`)
    assert((await page.getByText('Não encontrado na sua lista').count()) === 2, 'o chip aparece só nos dois não encontrados')
    assert((await page.locator('.vod-detail-origin', { hasText: 'Dados: TMDB' }).count()) >= 1, 'atribuição "Dados: TMDB" visível')

    await page.keyboard.press('ArrowDown')
    assert((await focusedSimilar(page)) === 'Matrix Reloaded', '↓ entra no primeiro cartão')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await assertOneFocus(page, 'percorrendo Semelhantes')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
    assert(tmdbTotal() === afterOpen, `focar cartões e trocar de aba não fez requisição ao TMDB (${tmdbTotal() - afterOpen})`)

    console.log('=== Cenário 2: resumo do não encontrado, sem assistir ===')
    await page.keyboard.press('ArrowDown') // o painel lembra o último cartão focado: Matrix Revolutions
    assert((await focusedSimilar(page)) === 'Matrix Revolutions', 'foco no não encontrado')
    await page.keyboard.press('Enter')
    const summary = page.locator('[role="dialog"]')
    await summary.waitFor({ timeout: 5000 })
    const summaryText = (await summary.textContent()) ?? ''
    assert(summaryText.includes('Matrix Revolutions') && summaryText.includes('2003'), 'o resumo mostra título e ano')
    assert(summaryText.includes('A guerra final entre homens e máquinas.'), 'o resumo mostra a sinopse do TMDB')
    assert(!/Assistir/.test(summaryText), 'o resumo não oferece assistir')
    assert(tmdbTotal() === afterOpen, 'abrir o resumo não fez requisição')
    await page.keyboard.press('Escape')
    await summary.waitFor({ state: 'detached', timeout: 5000 })
    assert((await focusedSimilar(page)) === 'Matrix Revolutions', 'RETURN fecha só o modal e o foco continua no cartão')

    console.log('=== SC-003: 10 sequências detalhe → semelhante encontrado → detalhe → RETURN ===')
    await page.keyboard.press('ArrowLeft') // Matrix Reloaded
    let okSequences = 0
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => document.querySelector('.vod-detail-title')?.textContent === 'Matrix Reloaded (2003)', null, { timeout: 8000 })
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => document.querySelector('.vod-detail-title')?.textContent === 'Matrix', null, { timeout: 8000 })
      if ((await activeTab(page)) === 'Semelhantes' && (await focusedSimilar(page)) === 'Matrix Reloaded') okSequences += 1
    }
    assert(okSequences === 10, `RETURN restaurou aba e cartão em ${okSequences}/10 sequências`)

    console.log('=== Cenário 5: aba Elenco com foto e marcador neutro ===')
    await page.keyboard.press('ArrowUp') // abas
    await page.keyboard.press('ArrowLeft') // Elenco
    const beforeCast = tmdbTotal() // as 10 sequências acima abriram outros detalhes; aqui só conta a aba
    await page.keyboard.press('Enter')
    await page.waitForSelector('.cast-person', { timeout: 5000 })
    assert((await page.locator('.cast-person').count()) === 2, 'duas pessoas do TMDB')
    assert((await page.locator('.cast-person-character').allTextContents()).join('|') === 'Neo', 'personagem só quando o TMDB informa')
    const photoLoaded = await page
      .waitForFunction(
        () => {
          const img = document.querySelector('.person-photo-img')
          return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0 && img.src.includes('image.tmdb.org')
        },
        null,
        { timeout: 8000 },
      )
      .then(() => true, () => false)
    assert(photoLoaded, 'a foto do TMDB carregou de verdade')
    assert((await page.locator('.person-photo-img').count()) === 1, 'a pessoa sem foto mostra o marcador neutro, sem <img>')
    assert(tmdbTotal() === beforeCast, 'a aba Elenco não fez requisição')

    console.log('=== Cenário 6: página de ator ===')
    await page.keyboard.press('ArrowDown')
    assert((await focusedPerson(page)) === 'Keanu Reeves', '↓ entra nas pessoas')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.person-screen .person-rail', { timeout: 8000 })
    assert(tmdbCount('/3/person/6384') === 1, 'OK na pessoa fez uma requisição /person')
    assert(((await page.locator('.person-name').textContent()) ?? '') === 'Keanu Reeves', 'cabeçalho com o nome')
    assert(!(await page.locator('body').innerText()).includes('Nunca exibida.'), 'biografia nunca exibida')
    const headings = await page.locator('.person-rail-title').allTextContents()
    assert(headings.join('|') === 'Na sua lista (2)|Fora da sua lista (2)', `rails na ordem (${headings.join('|')})`)
    assert((await page.getByText(/Procurado em \d+ de \d+ categorias de filmes e \d+ de \d+ de séries/).count()) === 1, 'cobertura com filmes e séries')
    await assertOneFocus(page, 'página de ator')
    await page.keyboard.press('ArrowRight') // Matrix Reloaded (2º encontrado)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.vod-detail-title')?.textContent === 'Matrix Reloaded (2003)', null, { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.person-screen .person-rail', { timeout: 8000 })
    const personFocus = await page.evaluate(() => document.querySelector('.person-screen .tv-focus')?.closest('.content-card')?.querySelector('.content-card-title')?.textContent)
    assert(personFocus === 'Matrix Reloaded', 'RETURN volta à página de ator no mesmo título')
    await page.keyboard.press('ArrowDown') // Fora da sua lista
    await page.keyboard.press('Enter')
    await page.locator('[role="dialog"]').waitFor({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 5000 })
    await page.keyboard.press('Escape') // ator → detalhe
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    assert((await activeTab(page)) === 'Elenco' && (await focusedPerson(page)) === 'Keanu Reeves', 'RETURN volta ao detalhe na aba Elenco e na mesma pessoa')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.person-screen .person-rail', { timeout: 8000 })
    assert(tmdbCount('/3/person/6384') === 1, 'reabrir a mesma pessoa não fez requisição (cache)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })

    console.log('=== SC-003: 10 cadeias detalhe → semelhante → detalhe → ator → detalhe, 4 RETURN cada ===')
    let chains = 0
    const isDetail = (title) => page.waitForFunction((t) => document.querySelector('.vod-detail-title')?.textContent === t, title, { timeout: 8000 })
    for (let i = 0; i < 10; i += 1) {
      // Do detalhe (aba Elenco, Keanu focado): aba Semelhantes → cartão encontrado → outro detalhe.
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await isDetail('Matrix Reloaded (2003)')
      await page.keyboard.press('Escape') // RETURN 1
      await isDetail('Matrix')
      const similarBack = (await activeTab(page)) === 'Semelhantes' && (await focusedSimilar(page)) === 'Matrix Reloaded'
      // Aba Elenco → ator → título encontrado → detalhe.
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await page.waitForSelector('.person-screen .person-rail', { timeout: 8000 })
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await isDetail('Matrix Reloaded (2003)')
      await page.keyboard.press('Escape') // RETURN 2
      await page.waitForSelector('.person-screen .person-rail', { timeout: 8000 })
      const personBack = (await page.evaluate(() => document.querySelector('.person-screen .tv-focus')?.closest('.content-card')?.querySelector('.content-card-title')?.textContent)) === 'Matrix Reloaded'
      await page.keyboard.press('Escape') // RETURN 3 (ator → detalhe)
      await isDetail('Matrix')
      const castBack = (await activeTab(page)) === 'Elenco' && (await focusedPerson(page)) === 'Keanu Reeves'
      if (similarBack && personBack && castBack) chains += 1
    }
    assert(chains === 10, `as 10 cadeias voltaram por RETURN com aba e foco restaurados (${chains}/10)`)
    assert(tmdbCount('/3/person/6384') === 1, 'as 10 cadeias reutilizaram a filmografia guardada (uma só requisição /person)')

    console.log('=== Cenário 4: TMDB fora do ar na página de ator — "Tentar de novo" e "Voltar" ===')
    await page.keyboard.press('ArrowRight')
    assert((await focusedPerson(page)) === 'Laurence Fishburne', '→ chega à segunda pessoa')
    await page.keyboard.press('Enter')
    await page.getByText('Não foi possível carregar a filmografia agora.').waitFor({ timeout: 8000 })
    assert(((await page.locator('.tv-focus').textContent()) ?? '') === 'Tentar de novo', '"Tentar de novo" recebe o foco')
    await assertOneFocus(page, 'erro da página de ator')
    const before = tmdbCount('/3/person/2975')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    assert(tmdbCount('/3/person/2975') === before + 1, '"Tentar de novo" refez a consulta uma vez (sem laço)')
    state.personFails = false
    await page.keyboard.press('Enter')
    await page.getByText('O TMDB não tem filmes nem séries com esta pessoa.').waitFor({ timeout: 8000 })
    assert(((await page.locator('.tv-focus').textContent()) ?? '') === 'Voltar', 'estado vazio tem "Voltar" focado')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })

    console.log('=== Cenário 9: remover a chave apaga a parte TMDB (semelhantes, elenco, filmografias) ===')
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape') // detalhe → grade → trilha → Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.getByRole('button', { name: 'Configurações', exact: true }).click()
    await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight') // Remover
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Remover a chave do TMDB?"]', { timeout: 5000 })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.integration-card-state:has-text("Não configurado")', { timeout: 8000 })
    assert((await idbCount(page, 'tmdbPeople')) === 0, 'a filmografia guardada foi apagada junto com a chave')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    await openMovie(page, 'Matrix')
    await openTab(page, 'Semelhantes')
    await page.getByText(/Semelhantes vêm do TMDB/).waitFor({ timeout: 5000 })
    assert(true, 'sem a chave a aba Semelhantes volta ao estado "Configurar TMDB"')
    await page.keyboard.press('ArrowLeft') // o foco já está nas abas (Semelhantes)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-cast-empty', { timeout: 5000 })
    assert((await page.locator('.cast-person').count()) === 0, 'o Elenco não mostra mais as pessoas do TMDB')

    console.log('=== Higiene: a chave nunca em console nem em requisição ao painel ===')
    assert(consoleLines.every((line) => !line.includes(GOOD_KEY)), 'nenhuma linha de console contém a chave')
    assert(hits.panelUrls.every((href) => !href.includes(GOOD_KEY)), 'nenhuma requisição ao painel contém a chave')
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NO ROTEIRO:', error)
    console.error('  requisições TMDB:', JSON.stringify(hits.tmdb))
    await page.screenshot({ path: 'semelhantes-elenco-ator-falha.png' }).catch(() => {})
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram.')
}

run()
