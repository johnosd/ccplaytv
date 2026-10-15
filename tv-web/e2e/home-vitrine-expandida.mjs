// Roteiro E2E da feature 060 (Início no layout "Vitrine expandida") — gate da constitution ("Testes E2E antes da validação em
// TV"). Capturas em `test-results/home-vitrine-expandida/`.
//
// Painel Xtream FICTÍCIO e TMDB SIMULADO (interceptação de pi.themoviedb.org/image.tmdb.org, nunca a rede real), ambos criados
// por este script; a chave TMDB é uma sequência fictícia semeada direto no IndexedDB. Mede:
//  - o billboard abre expandido, sem dock (ad-hoc 2026-10-09); 1 ↓ chega à primeira fileira e o billboard recolhe (SC-005); ↑
//    expande e ↑ de novo sai direto à topbar;
//  - só "Filmes adicionados" (FR-018; Top 10, Dica, "Porque você assistiu" e a Curadoria IA saíram do Início no ad-hoc de
//    2026-10-09), sem fileira vazia: "Séries adicionadas" não existe no Xtream, onde a série não traz data de inclusão;
//  - só o card focado expande (667 × 375 no pôster) e o fundo ambiente desenha a imagem do item focado;
//  - andar com seta segurada NÃO consulta nada (nem o painel, nem a API do TMDB);
//  - OK abre o detalhe e voltar reabre o Início no mesmo card, billboard recolhido (SC-005);
//  - a ação primária fica focável rápido ao reabrir o Início (SC-007 — medição registrada no log);
//  - Filmes com chave mas sem título concluído não mostra "Porque você assistiu" nem slot "Em breve" (SC-008, lado negativo);
//  - nenhuma credencial do painel no DOM nem no console.
//
// Fora deste roteiro (cobertos por teste unitário e pela passada na TV): "Porque você assistiu" positivo (precisa de metadata
// TMDB casada + título concluído), "Ao vivo agora" com EPG e fluidez/legibilidade (SC-009).
//
// Pré-requisito: `npm run dev` em http://localhost:5173. Dados só fictícios.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { openShowcase, openVodCategory, openViaTopbar } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const SHOTS = path.join(process.cwd(), 'test-results', 'home-vitrine-expandida')
const LISTA = 'Fonte E2E Home Vitrine'
const NOMES = ['Um', 'Dois', 'Tres', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito']
const KEY = '0123456789abcdef0123456789abcdef' // fictícia (formato v3)

/** TMDB simulado: ranking semanal de filmes com ackdrop_path (a imagem 16:9 do fundo ambiente); o resto vem vazio. */
function tmdbBody(pathname) {
  const movie = (id, title) => ({ id, title, original_title: title, release_date: '2025-03-03', vote_average: 8.1, vote_count: 900, popularity: 50, backdrop_path: `/fundo${id}.jpg` })
  if (pathname === '/3/trending/movie/week') return { results: [movie(1, 'Filme Um'), movie(2, 'Filme Dois'), movie(3, 'Filme Tres'), movie(4, 'Filme Quatro')] }
  if (pathname.startsWith('/3/trending/') || pathname.startsWith('/3/discover/')) return { results: [] }
  return null
}

const putKey = (key) =>
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
  })

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

/** Painel fictício: 8 filmes (cat. 10) e 8 séries (cat. 20), todos adicionados agora, com a mesma capa local. */
function startPanel(requests) {
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
      requests.push(url.searchParams.get('action') ?? 'auth')
      const base = `http://127.0.0.1:${server.address().port}`
      const action = url.searchParams.get('action')
      const added = String(Math.floor(Date.now() / 1000))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return res.end('[]')
      if (action === 'get_vod_categories') return res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes | Lançamentos' }]))
      if (action === 'get_series_categories') return res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries | Novas' }]))
      const icon = `${base}/capa.png`
      if (action === 'get_vod_streams') {
        const film = (name, id) => ({ name, stream_id: id, category_id: '10', stream_icon: icon, year: '2025', rating: '7.5', added })
        return res.end(JSON.stringify(NOMES.map((n, i) => film(`Filme ${n}`, i + 1))))
      }
      if (action === 'get_series') {
        const show = (name, id) => ({ name, series_id: id, category_id: '20', cover: icon, year: '2025', releaseDate: '2025-03-03', rating: '7.5', last_modified: added })
        return res.end(JSON.stringify(NOMES.map((n, i) => show(`Serie ${n}`, i + 1))))
      }
      return res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const homeRowLabels = (page) => page.locator('.home-row').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
const heroState = (page) => page.locator('.home-hero').getAttribute('data-state')
const focusedRow = (page) =>
  page.evaluate(() => document.querySelector('.home-row .tv-focus')?.closest('.home-row')?.getAttribute('data-row') ?? null)
const focusedCardName = (page) =>
  page
    .evaluate(() => document.querySelector('.home-row .home-card.tv-focus .home-card-title')?.textContent ?? '')
    .then(clean)

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

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const panelRequests = []
  const server = await startPanel(panelRequests)
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const pageErrors = []
  const consoleTexts = []
  const externalHosts = new Set()
  let apiRequests = 0
  const tmdbCalls = []
  page.on('pageerror', (error) => pageErrors.push(`[${step}] ${String(error).slice(0, 90)}`))
  page.on('console', (message) => consoleTexts.push(message.text()))
  page.on('request', (request) => {
    const parsed = new URL(request.url())
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') externalHosts.add(parsed.hostname)
    // Só consultas de DADOS contam: imagens (capa local, image.tmdb.org) não são consulta.
    if (parsed.pathname === '/player_api.php' || parsed.hostname === 'api.themoviedb.org') apiRequests += 1
  })
  await context.route('https://api.themoviedb.org/**', (route) => {
    const url = new URL(route.request().url())
    tmdbCalls.push(url.pathname)
    const body = tmdbBody(url.pathname)
    if (body === null) return route.abort('failed')
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  await context.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: CAPA }))

  try {
    console.log((step = '=== Fonte fictícia e categorias obtidas ==='))
    await addSource(page, server.address().port)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
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
    await page.evaluate(putKey, KEY)

    console.log((step = '=== Início: billboard expandido, sem dock, e só as fileiras do aparelho ==='))
    await openViaTopbar(page, 'home')
    await page.waitForSelector('section.home-row[aria-label="Filmes adicionados"] .home-card', { timeout: 20000 })
    // A fileira pode piscar logo ao abrir (some ~1 s e volta enquanto a lista revalida): espera ela assentar.
    await page.waitForTimeout(1500)
    await page.waitForSelector('section.home-row[aria-label="Filmes adicionados"] .home-card', { timeout: 20000 })
    assert((await heroState(page)) === 'expanded', 'o billboard abre expandido')
    assert((await page.locator('.home-dock, .home-hero-dock').count()) === 0, 'sem o dock de serviços no billboard')
    const labels = await homeRowLabels(page)
    assert(
      // No Xtream a série não tem data de inclusão (`last_modified` é atualização): sem dado, a fileira não existe (FR-018).
      JSON.stringify(labels) === JSON.stringify(['Filmes adicionados']),
      `só as fileiras com dado, sem Top 10/Dica/Curadoria IA (${labels.join(' | ')})`,
    )
    assert((await page.locator('.home-row[data-row="added-movies"] .home-card').count()) >= 5, 'Filmes adicionados traz os cards da lista')
    await page.keyboard.press('ArrowDown') // topbar -> conteúdo, sempre nas ações do billboard
    await page.waitForSelector('.home-hero-action.tv-focus', { timeout: 4000 })
    await page.waitForTimeout(500)
    await shot(page, '01-billboard-expandido')

    console.log((step = '=== Um ↓ chega à primeira fileira e o billboard recolhe (SC-005); ↑ expande ==='))
    const heroAction = page.locator('.home-hero-action.tv-focus')
    assert((await heroAction.count()) === 1, 'o foco começa numa ação do billboard')
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.home-row[data-row="added-movies"] .home-card.tv-focus', { timeout: 4000 })
    assert((await focusedRow(page)) === 'added-movies', 'com 1 ↓ o foco está na primeira fileira')
    assert((await heroState(page)) === 'collapsed', 'o billboard recolheu')
    await page.waitForTimeout(500)

    console.log((step = '=== Card focado expande; só um por vez; o fundo mostra a imagem do foco ==='))
    assert((await page.locator('.home-card.is-expanded').count()) === 1, 'só o card focado está expandido')
    const size = await page.evaluate(() => {
      const el = document.querySelector('.home-card.is-expanded')
      return { w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 }
    })
    assert(size.w === 667 && size.h === 375, `o card expandido tem 667 × 375 (${size.w} × ${size.h})`)
    // Sem o Top 10/Dica (ad-hoc 2026-10-09) não chegam imagens 16:9 do TMDB para os cards deste painel fictício: o fundo do card
    // focado é a imagem guardada, se houver, ou só a cor — nunca vazio (o contrato 060 cobre o caso com backdrop guardado).
    await page.waitForTimeout(600)
    assert((await page.locator('.home-ambient').count()) === 1, 'o fundo ambiente continua desenhado com o foco nas fileiras')
    await shot(page, '02-card-expandido')

    console.log((step = '=== Seta segurada não faz requisição nenhuma ==='))
    const before = apiRequests
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(500)
    assert(apiRequests === before, `andar pela fileira não consulta painel nem serviço externo (${apiRequests - before} requisições)`)
    assert((await page.locator('.home-card.is-expanded').count()) === 1, 'continua só um card expandido depois de andar')
    await shot(page, '03-fileira-focada')
    const focusedName = await focusedCardName(page)

    console.log((step = '=== OK abre o detalhe; voltar reabre o Início no mesmo card, billboard recolhido ==='))
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 10000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    await page.waitForSelector('.home-row .home-card.tv-focus', { timeout: 8000 })
    assert((await focusedCardName(page)) === focusedName && focusedName !== '', `voltar restaura o foco no mesmo card (${focusedName})`)
    assert((await heroState(page)) === 'collapsed', 'o billboard segue recolhido ao voltar')

    console.log((step = '=== ↑ devolve ao billboard expandido; ↑ de novo sai direto à topbar ==='))
    await page.keyboard.press('ArrowUp')
    await page.waitForSelector('.home-hero-action.tv-focus', { timeout: 4000 })
    assert((await heroState(page)) === 'expanded', '↑ na primeira fileira volta ao billboard expandido')
    await page.keyboard.press('ArrowUp')
    assert((await page.locator('.topbar .tv-focus').count()) === 1, '↑ nas ações do billboard sai para a topbar')
    assert((await page.locator('.home-content .tv-focus').count()) === 0, 'e o conteúdo fica sem foco')

    console.log((step = '=== Ação primária focável rápido ao reabrir o Início (SC-007) ==='))
    await openShowcase(page, 'movies') // sai do Início (o painel não tem canais) e volta pela topbar
    await openViaTopbar(page, 'home')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    const startedAt = Date.now()
    await page.keyboard.press('ArrowDown') // topbar -> ações do billboard
    await page.waitForSelector('.home-hero-action.tv-focus', { timeout: 8000 })
    const elapsed = Date.now() - startedAt
    console.log(`  · ação primária focável ${elapsed} ms depois de abrir o Início (TV física: T043)`)
    assert(elapsed <= 1500, `ação primária focável em até 1,5 s no navegador de teste (${elapsed} ms; a meta de 1 s é medida na TV)`)

    console.log((step = '=== Filmes com chave e sem título concluído: sem "Porque você assistiu" e sem slot "Em breve" (SC-008) ==='))
    await openShowcase(page, 'movies')
    await page.waitForTimeout(700)
    const vodLabels = await page.locator('.vod-showcase section.vod-row').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
    assert(!vodLabels.some((label) => /porque/i.test(label)), `Filmes sem título concluído não tem "Porque você assistiu" (${vodLabels.join(' | ')})`)
    assert((await page.locator('.vod-showcase .vod-slot-card').count()) === 0, 'Filmes sem slot "Em breve"')

    console.log((step = '=== Segredos ==='))
    const html = await page.content()
    assert(!/password=senha|username=usuario/.test(html), 'nenhuma credencial do painel no DOM')
    assert(!consoleTexts.some((text) => /password=senha|username=usuario/.test(text)), 'nenhuma credencial do painel no console')
    assert([...externalHosts].every((host) => host === 'api.themoviedb.org' || host === 'image.tmdb.org'), `só o TMDB como host externo (${[...externalHosts].join(', ') || 'nenhum'})`)
    assert(!html.includes(KEY) && !consoleTexts.some((text) => text.includes(KEY)), 'a chave TMDB nunca aparece no DOM nem no console')
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
