// Roteiro E2E da feature 055 (nota, gênero e fundo vindos da listagem Xtream) — gate da constitution
// ("Testes E2E antes da validação em TV física").
//
// Painel Xtream FICTÍCIO criado por este script (nunca uma fonte real). Mede:
//  - grade de filmes: selo "★ 7,4" só no card com nota válida; nota "0" e ausente não mostram nada;
//  - destaque de filme: "★ 7,4 Provedor"; sem nota, nada de nota;
//  - destaque de série: gênero como subtítulo e fundo da listagem, SEM nenhuma chamada a get_series_info/get_vod_info
//    nem a host externo ao mover o foco (FR-013, SC-002);
//  - o selo não vira alvo de foco: o `.tv-focus` fica no card, nunca no selo.
//
// Pré-requisito: `npm run dev` em http://localhost:5173. Dados só fictícios.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { enterRows, gotoRow, openShowcase, openVodCategory } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Campos da listagem'

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

/** Painel fictício: 3 filmes (nota 7.4, "0" e sem campo) e 2 séries (uma com nota, gênero e fundo; outra sem nada). */
function startPanel() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (url.pathname === '/capa.png' || url.pathname === '/fundo.png') {
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
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return res.end('[]')
      if (action === 'get_vod_categories') return res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes | Avaliados' }]))
      if (action === 'get_vod_streams') {
        const icon = `${base}/capa.png`
        return res.end(
          JSON.stringify([
            { name: 'Filme Nota', stream_id: 1, category_id: '10', stream_icon: icon, rating: '7.4', added: '1700000003' },
            { name: 'Filme Zero', stream_id: 2, category_id: '10', stream_icon: icon, rating: '0', added: '1700000002' },
            { name: 'Filme Sem', stream_id: 3, category_id: '10', stream_icon: icon, added: '1700000001' },
          ]),
        )
      }
      if (action === 'get_series_categories') return res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries | Drama' }]))
      if (action === 'get_series') {
        return res.end(
          JSON.stringify([
            {
              name: 'Série Completa',
              series_id: '500',
              category_id: '20',
              cover: `${base}/capa.png`,
              rating: '8',
              genre: 'Comédia, Drama',
              backdrop_path: [`${base}/fundo.png`],
            },
            { name: 'Série Vazia', series_id: '501', category_id: '20', cover: `${base}/capa.png` },
          ]),
        )
      }
      return res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

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

const text = (page, selector) => page.locator(selector).first().textContent().catch(() => null)

/** Anda pela fileira com ← → até o destaque mostrar `title` (o foco entra na fileira em algum card; a ordem não importa). */
async function focusCardTitled(page, title) {
  for (const key of ['ArrowLeft', 'ArrowRight']) {
    for (let i = 0; i < 4; i += 1) {
      if ((await text(page, '.vod-hero-title')) === title) return true
      await page.keyboard.press(key)
    }
  }
  return (await text(page, '.vod-hero-title')) === title
}

async function run() {
  const server = await startPanel()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()
  const pageErrors = []
  const externalRequests = []
  const panelCalls = []
  page.on('pageerror', (error) => pageErrors.push(`[${step}] ${String(error).slice(0, 90)}`))
  page.on('request', (request) => {
    const parsed = new URL(request.url())
    if (parsed.pathname === '/player_api.php') panelCalls.push(parsed.searchParams.get('action') ?? '')
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') externalRequests.push(parsed.hostname)
  })

  try {
    console.log((step = '=== Fonte fictícia ==='))
    await addSource(page, server.address().port)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log((step = '=== Destaque de filme ==='))
    await openShowcase(page, 'movies')
    await enterRows(page)
    await gotoRow(page, 'Avaliados', ['Avaliados'])
    await page.waitForSelector('section.vod-row[aria-label="Avaliados"] .content-card', { timeout: 15000 })
    // O foco entra na fileira em algum card: anda até "Filme Nota" (o título do destaque acompanha o card em foco).
    for (let i = 0; i < 4 && !/Filme Nota/.test((await text(page, '.vod-hero-title')) ?? ''); i += 1) await page.keyboard.press('ArrowLeft')
    const heroMeta = (await text(page, '.vod-hero-meta')) ?? ''
    assert(/★ 7,4/.test(heroMeta) && /Provedor/.test(heroMeta), `destaque do filme com nota: "${heroMeta.replace(/\s+/g, ' ').trim()}"`)

    console.log((step = '=== Grade de filmes: selo só com nota válida ==='))
    await openVodCategory(page, 'Avaliados')
    await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
    await page.waitForFunction(() => document.querySelectorAll('.vod-grid .content-card').length === 3, null, { timeout: 15000 })
    const badges = await page.locator('.vod-grid .rating-badge').allTextContents()
    assert(badges.length === 1 && badges[0].replace(/\s+/g, ' ').trim() === '★ 7,4', `um único selo, "★ 7,4" (${JSON.stringify(badges)})`)
    const gridText = (await text(page, '.vod-grid')) ?? ''
    assert(!/Provedor|sem nota/i.test(gridText), 'o card não traz o rótulo de origem nem "sem nota"')
    const cardsWithBadge = await page.locator('.vod-grid-cell', { has: page.locator('.rating-badge') }).count()
    assert(cardsWithBadge === 1, 'o selo está só no card do filme com nota (nota "0" e ausente ficam sem selo)')
    const focusOnBadge = await page.evaluate(() => document.querySelector('.rating-badge.tv-focus, .rating-badge:focus') !== null)
    assert(!focusOnBadge, 'o selo não recebe foco')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })

    console.log((step = '=== Destaque de série: gênero, fundo e nenhuma consulta ao focar ==='))
    await openShowcase(page, 'series')
    await enterRows(page)
    await gotoRow(page, 'Drama', ['Drama'])
    await page.waitForSelector('section.vod-row[aria-label="Drama"] .content-card', { timeout: 15000 })
    assert(await focusCardTitled(page, 'Série Completa'), 'destaque na "Série Completa"')
    const callsBefore = panelCalls.length
    const externalBefore = externalRequests.length
    const seriesMeta = (await text(page, '.vod-hero-meta')) ?? ''
    assert(/Comédia, Drama/.test(seriesMeta), `gênero da listagem no destaque da série: "${seriesMeta.replace(/\s+/g, ' ').trim()}"`)
    assert(/★ 8,0/.test(seriesMeta) && /Provedor/.test(seriesMeta), 'nota da série com a origem')
    const heroSrc = (await page.locator('.vod-hero-art img').first().getAttribute('src').catch(() => null)) ?? ''
    assert(heroSrc.endsWith('/fundo.png'), `o fundo do destaque é o da listagem (${heroSrc.split('/').pop()})`)
    assert(await focusCardTitled(page, 'Série Vazia'), 'destaque na "Série Vazia"')
    const emptyMeta = (await text(page, '.vod-hero-meta')) ?? ''
    assert(!/★|Provedor|Comédia/.test(emptyMeta), 'série sem os campos: destaque sem nota, sem gênero')
    const emptySrc = (await page.locator('.vod-hero-art img').first().getAttribute('src').catch(() => null)) ?? ''
    assert(emptySrc.endsWith('/capa.png'), 'sem fundo da listagem, a capa segue como arte do destaque')
    const newCalls = panelCalls.slice(callsBefore)
    assert(
      !newCalls.some((action) => ['get_series_info', 'get_vod_info'].includes(action)),
      `mover o foco não consulta o painel (${newCalls.length} chamada(s) novas: ${newCalls.join(',') || 'nenhuma'})`,
    )
    assert(externalRequests.length === externalBefore, 'nenhuma requisição a host externo ao focar')

    assert(externalRequests.length === 0, `nenhuma requisição externa em todo o roteiro (${[...new Set(externalRequests)].join(', ') || 'ok'})`)
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
