// Roteiro E2E da feature 050 (paridade visual de Filmes e Séries com o DS V14).
//
// O que o jsdom não enxerga e este roteiro mede, a 1920×1080: largura do painel
// da sidebar (340px), hero com/sem capa e rótulo por seção, ≥ 1 linha inteira de
// cards visível sob a hero (R-002), grade sem scroll horizontal (R-005), anel de
// foco inteiro no 1º/último item da sidebar e da grade (SC-002) e indicador de
// continuação só nas bordas com itens ocultos (FR-010). Capturas em
// `test-results/filmes-series-paridade-v14/`.
//
// Pré-requisito: `npm run dev` rodando em http://localhost:5173 (confira que
// ninguém mais escuta a 5173). Dados só fictícios, servidos por este script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Paridade VOD'
const SHOTS = path.join(process.cwd(), 'test-results', 'filmes-series-paridade-v14')
// O anel V14: 4px de contorno + 3px de deslocamento + 8px de halo.
const RING = 15
const FILLERS = 16
const LONGO = 60

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function buildM3u(base) {
  const lines = ['#EXTM3U']
  let n = 0
  const movie = (group, name, logo) =>
    lines.push(
      `#EXTINF:-1 ${logo ? `tvg-logo="${base}/capa.png" ` : ''}group-title="${group}",${name}`,
      `http://exemplo.test/vod/${(n += 1)}.mp4`,
    )
  movie('Filmes | Curto', 'Curto 1', true)
  movie('Filmes | Curto', 'Curto 2', false)
  movie('Filmes | Curto', 'Curto 3', true)
  for (let i = 1; i <= LONGO; i += 1) movie('Filmes Longo', `Longo ${String(i).padStart(2, '0')}`, i % 2 === 1)
  for (let i = 1; i <= FILLERS; i += 1) movie(`Filmes Filler ${String(i).padStart(2, '0')}`, `Fill ${i}`, false)
  lines.push(
    `#EXTINF:-1 tvg-logo="${base}/capa.png" group-title="Series Drama",Serie Drama S01E01`,
    'http://exemplo.test/series/1.mp4',
    `#EXTINF:-1 tvg-logo="${base}/capa.png" group-title="Series Drama",Serie Drama S01E02`,
    'http://exemplo.test/series/2.mp4',
  )
  return lines.join('\n')
}

function startFixtureServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (url.pathname === '/capa.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(CAPA)
        return
      }
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(buildM3u(`http://127.0.0.1:${server.address().port}`))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: LISTA, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 8000 })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function press(page, key, times = 1) {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

const rectOf = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
  })

/** O anel (RING px em volta) do elemento focado cabe dentro de TODOS os contêineres que o recortam. */
async function ringInside(page, focusSelector, ...containerSelectors) {
  const el = await rectOf(page, focusSelector)
  for (const selector of containerSelectors) {
    const box = await rectOf(page, selector)
    const fits =
      el.top - RING >= box.top - 0.5 &&
      el.bottom + RING <= box.bottom + 0.5 &&
      el.left - RING >= box.left - 0.5 &&
      el.right + RING <= box.right + 0.5
    if (!fits) return false
  }
  return true
}

const frameFlags = (page, scope) =>
  page.locator(`${scope} .vod-scroll-frame`).first().evaluate((el) => ({
    above: el.classList.contains('is-more-above'),
    below: el.classList.contains('is-more-below'),
  }))

async function openSection(page, destination) {
  await openViaTopbar(page, destination)
  await page.waitForSelector('.vod-side-panel', { timeout: 8000 })
  // Espera as categorias reais (entrar cedo demais pousa em ★ Favoritos vazio).
  await page.waitForSelector(
    '.side-category-nav-item:not(:has-text("Favoritos")):not(:has-text("Histórico")):not(:has-text("Todos"))',
    { timeout: 8000 },
  )
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const server = await startFixtureServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/lista.m3u`

  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true },
  )
  const page = await (await browser.newContext({ viewport: { width: Number(process.env.E2E_W ?? 1920), height: Number(process.env.E2E_H ?? 1080) } })).newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    await addSource(page, m3uUrl)
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== Filmes: sidebar em painel ===')
    await openSection(page, 'movies')
    const panel = await rectOf(page, '.vod-side-panel')
    assert(Math.abs(panel.width - 340) <= 1, `painel da sidebar com 340px (medido ${panel.width.toFixed(1)})`)
    assert(
      ((await page.locator('.vod-side-head').textContent()) ?? '').trim() === 'Categorias',
      'cabeçalho "Categorias" no painel',
    )
    const labels = await page.locator('.vod-side-nav .side-category-nav-label').allTextContents()
    assert(labels.includes('Curto') && !labels.some((l) => /^filmes\s*\|/i.test(l)), `categorias sem o prefixo "Filmes |" (${labels.slice(3, 6).join(', ')})`)
    const sideFrame0 = await frameFlags(page, '.vod-side-panel')
    assert(!sideFrame0.above && sideFrame0.below, 'sidebar no topo: só a borda de baixo indica continuação')
    assert(
      await ringInside(page, '.vod-side-nav .side-category-nav-item.tv-focus', '.vod-side-nav'),
      'anel de foco inteiro no 1º item visível da sidebar',
    )
    await shot(page, 'filmes-sidebar')

    // 1ª categoria real = "Filmes Curto" (3 filmes, 2 com capa); "Filmes Longo" é a 2ª.
    console.log('=== Filmes Curto: hero com capa e sem capa ===')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-hero-band', { timeout: 8000 })
    assert(
      ((await page.locator('.vod-hero-eyebrow').textContent()) ?? '').trim() === 'CCPLAY CINEMA',
      'rótulo da hero em Filmes: CCPLAY CINEMA',
    )
    assert((await page.locator('.vod-hero-title').textContent())?.trim() === 'Curto 1', 'hero mostra o card focado')
    assert((await page.locator('.vod-hero-art img').count()) === 1, 'hero com capa mostra a <img> de fundo')
    await shot(page, 'filmes-hero-com-capa')
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('.vod-hero-title')?.textContent?.trim() === 'Curto 2')
    assert((await page.locator('.vod-hero-art img').count()) === 0, 'hero sem capa: só o degradê, nenhuma <img>')
    assert((await page.locator('.vod-hero-band button, .vod-hero-band [tabindex]').count()) === 0, 'hero sem elemento focável')
    await shot(page, 'filmes-hero-sem-capa')

    console.log('=== Filmes Longo: grade, anel e continuação ===')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 8000 })
    await page.waitForTimeout(400)
    const grid = await rectOf(page, '.vod-grid')
    const card = await rectOf(page, '.vod-grid-cell')
    const hero = await rectOf(page, '.vod-hero-band')
    assert(card.bottom <= grid.bottom + 0.5, `≥ 1 linha inteira de cards visível sob a hero (hero ${hero.height.toFixed(0)}px, grade ${grid.height.toFixed(0)}px)`)
    const overflowX = await page.locator('.vod-grid').evaluate((el) => el.scrollWidth - el.clientWidth)
    assert(overflowX <= 1, `grade sem scroll horizontal (diferença ${overflowX}px)`)
    const gridFrame0 = await frameFlags(page, '.vod-content-column')
    assert(!gridFrame0.above && gridFrame0.below, 'grade no topo: só a borda de baixo indica continuação')
    assert(await ringInside(page, '.vod-grid .poster-box.tv-focus', '.vod-grid', '.vod-content-column'), 'anel de foco inteiro no 1º card')
    await shot(page, 'filmes-grade-topo')

    await press(page, 'ArrowDown', LONGO / 6 + 2)
    await page.waitForTimeout(400)
    const gridFrameEnd = await frameFlags(page, '.vod-content-column')
    assert(gridFrameEnd.above && !gridFrameEnd.below, 'grade no fim: só a borda de cima indica continuação')
    assert(await ringInside(page, '.vod-grid .poster-box.tv-focus', '.vod-grid', '.vod-content-column'), 'anel de foco inteiro no último card')
    await shot(page, 'filmes-grade-fim')

    console.log('=== Sidebar longa: continuação e anel no último item ===')
    await page.keyboard.press('Escape')
    await press(page, 'ArrowDown', FILLERS + 6)
    await page.waitForTimeout(300)
    const sideFrameEnd = await frameFlags(page, '.vod-side-panel')
    assert(sideFrameEnd.above && !sideFrameEnd.below, 'sidebar no fim: só a borda de cima indica continuação')
    assert(
      await ringInside(page, '.vod-side-nav .side-category-nav-item.tv-focus', '.vod-side-nav'),
      'anel de foco inteiro no último item da sidebar',
    )
    await shot(page, 'filmes-sidebar-fim')

    console.log('=== Toolbar: Ordenar e Pesquisar ===')
    // Do último item de volta à 1ª categoria real (índice 3), sem passar de ★ Favoritos.
    await press(page, 'ArrowUp', FILLERS + 1)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-toolbar-sort-button', { timeout: 8000 })
    assert(
      ((await page.locator('.vod-toolbar-sort-label').textContent()) ?? '').trim() === 'Ordenar',
      'botão Ordenar com rótulo próprio',
    )
    assert(
      ((await page.locator('.vod-toolbar-search-hint').textContent()) ?? '').trim() === 'OK',
      'campo Pesquisar com a dica "OK"',
    )
    const search = await rectOf(page, '.vod-toolbar-search-button')
    assert(search.height >= 64, `campo Pesquisar com altura de TV (${search.height.toFixed(0)}px)`)
    await shot(page, 'filmes-toolbar')
    await page.keyboard.press('ArrowUp') // 1ª linha da grade -> toolbar (Pesquisar)
    assert(
      await ringInside(page, '.vod-toolbar-search-button.tv-focus', '.vod-content-column'),
      'anel de foco inteiro no campo Pesquisar (topo da coluna)',
    )
    await page.keyboard.press('ArrowRight') // Pesquisar -> Ordenar
    assert(
      await ringInside(page, '.vod-toolbar-sort-button.tv-focus', '.vod-content-column'),
      'anel de foco inteiro no botão Ordenar (topo/direita da coluna)',
    )
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowDown') // volta à grade

    console.log('=== Modal de Ordenar ===')
    await page.keyboard.press('ArrowUp') // 1ª linha da grade -> toolbar (Pesquisar)
    await page.keyboard.press('ArrowRight') // Pesquisar -> Ordenar
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Ordenar"]', { timeout: 0 })
    const modalItem = await rectOf(page, '.vod-sort-modal-item')
    assert(modalItem.height >= 56, `item do modal de Ordenar com altura de TV (${modalItem.height.toFixed(0)}px)`)
    assert(
      ((await page.locator('.vod-sort-modal-item').first().textContent()) ?? '').includes('✓'),
      'a opção atual do modal de Ordenar vem marcada com ✓',
    )
    await shot(page, 'filmes-ordenar-modal')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"][aria-label="Ordenar"]', { state: 'detached', timeout: 0 })

    console.log('=== Séries ===')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openSection(page, 'series')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-hero-band', { timeout: 8000 })
    assert(
      ((await page.locator('.vod-hero-eyebrow').textContent()) ?? '').trim() === 'CCPLAY SÉRIES',
      'rótulo da hero em Séries: CCPLAY SÉRIES',
    )
    await shot(page, 'series-hero')

    assert(pageErrors.length === 0, `sem erro de página (${pageErrors.join(' | ')})`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
    await shot(page, 'erro').catch(() => {})
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








