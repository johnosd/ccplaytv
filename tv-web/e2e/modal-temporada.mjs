// Roteiro E2E do bug `modal-temporada-sem-indicador-mais-itens`
// (sdd/bugs/modal-temporada-sem-indicador-mais-itens/).
//
// Série com 24 temporadas — mais do que cabe no modal "Selecionar temporada".
// Prova, num Chromium real (jsdom não calcula layout — R-007 da feature
// 022), que:
//   1. o item focado continua visível dentro da lista a cada ↓ até a última
//      temporada, e de volta com ↑ (foco desloca a lista, DS §17);
//   2. o edge fade só aparece no lado que tem mais conteúdo (DS §17).
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173), mesma
// convenção dos demais scripts em `e2e/`. Dados só fictícios, servidos por um
// painel Xtream fictício criado por este script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const OUT_DIR = path.join(__dirname, '..', '..', 'sdd', 'bugs', 'modal-temporada-sem-indicador-mais-itens', 'evidencias')
const SEASON_COUNT = 24

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function startPanelServer() {
  const episodes = {}
  for (let season = 1; season <= SEASON_COUNT; season += 1) {
    episodes[String(season)] = [
      { id: String(9000 + season), episode_num: 1, title: `Episódio da T${season}`, container_extension: 'mp4' },
    ]
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end('não encontrado')
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    const action = url.searchParams.get('action')
    const body = {
      get_live_categories: [],
      get_live_streams: [],
      get_vod_categories: [],
      get_vod_streams: [],
      get_series_categories: [{ category_id: '20', category_name: 'Séries' }],
      get_series: [{ name: 'Série Longa', series_id: '900', category_id: '20' }],
      get_series_info: { episodes },
    }[action]
    res.end(JSON.stringify(body ?? { user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

/** Estado geométrico do modal: o item focado cabe na área visível da lista? Há fade em cada borda? */
async function modalState(page) {
  return page.evaluate(() => {
    const list = document.querySelector('.vod-season-modal-list')
    const panel = document.querySelector('.modal-panel')
    const focused = document.querySelector('.vod-season-modal-item.tv-focus')
    if (!list || !panel || !focused) return null
    // A área que de fato recorta o conteúdo é a menor entre a lista e o painel.
    const l = list.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const top = Math.max(l.top, p.top)
    const bottom = Math.min(l.bottom, p.bottom)
    const f = focused.getBoundingClientRect()
    // Tolerância para a receita de foco (`scale(1.06)`, ADR-007): o item
    // focado cresce alguns px além da própria caixa — isso não é "sumir".
    const tolerance = 8
    return {
      label: focused.textContent?.trim() ?? '',
      visible: f.top >= top - tolerance && f.bottom <= bottom + tolerance,
      fadeStart: list.classList.contains('vod-season-modal-list--fade-start'),
      fadeEnd: list.classList.contains('vod-season-modal-list--fade-end'),
      overflows: list.scrollHeight > list.clientHeight || panel.scrollHeight > panel.clientHeight,
    }
  })
}

async function run() {
  const server = await startPanelServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/get.php?username=usuario&password=senha`
  const browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    console.log('=== Adicionar fonte com série de 24 temporadas ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaM3u(page, { nome: 'Fonte Série Longa', url: m3uUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: 'Fonte Série Longa' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== Abrir o detalhe da série e o modal de temporada ===')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight') // Início -> TV -> Filmes -> Séries
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Séries"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.keyboard.press('Enter') // detalhe
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.waitForSelector('.vod-episode-row', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // ações -> abas
    await page.keyboard.press('ArrowDown') // abas -> temporada
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { timeout: 4000 })
    await page.waitForTimeout(150)

    const initial = await modalState(page)
    assert(initial?.overflows === true, `a lista de ${SEASON_COUNT} temporadas não cabe no modal (pré-condição)`)
    assert(initial?.visible === true, 'na abertura, a temporada focada está visível')
    assert(initial?.fadeStart === false && initial?.fadeEnd === true, 'na abertura, fade só embaixo (há mais conteúdo só abaixo)')

    console.log('=== Descer até a última temporada ===')
    let hiddenAt = null
    for (let i = 1; i < SEASON_COUNT; i += 1) {
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(30)
      const state = await modalState(page)
      if (!state?.visible && hiddenAt === null) hiddenAt = state?.label ?? `passo ${i}`
    }
    assert(hiddenAt === null, `o foco nunca sai da área visível ao descer${hiddenAt ? ` (sumiu em "${hiddenAt}")` : ''}`)
    const bottom = await modalState(page)
    assert(bottom?.label?.includes(`Temporada ${SEASON_COUNT}`) ?? false, `foco chegou em "Temporada ${SEASON_COUNT}"`)
    assert(bottom?.fadeStart === true && bottom?.fadeEnd === false, 'no fim da lista, fade só em cima')

    console.log('=== Subir de volta até a primeira ===')
    hiddenAt = null
    for (let i = 1; i < SEASON_COUNT; i += 1) {
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(30)
      const state = await modalState(page)
      if (!state?.visible && hiddenAt === null) hiddenAt = state?.label ?? `passo ${i}`
    }
    assert(hiddenAt === null, `o foco nunca sai da área visível ao subir${hiddenAt ? ` (sumiu em "${hiddenAt}")` : ''}`)
    const top = await modalState(page)
    assert(top?.fadeStart === false && top?.fadeEnd === true, 'de volta ao topo, fade só embaixo')

    console.log('=== Escolher a temporada focada continua funcionando ===')
    for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowDown') // -> Temporada 10
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { state: 'detached', timeout: 4000 })
    assert(
      await page.locator('.content-card-title', { hasText: 'Episódio da T10' }).isVisible(),
      'OK escolhe a temporada destacada (T10)',
    )

    console.log('=== Reabrir com a temporada atual abaixo da dobra ===')
    // Escolhe a T20 e reabre: o modal abre focado nela, que não cabe na
    // primeira "página" — precisa já abrir rolado até ela.
    await page.keyboard.press('Enter') // reabre (o foco volta ao seletor de temporada)
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { timeout: 4000 })
    await page.waitForTimeout(150)
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowDown') // T10 -> T20
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { state: 'detached', timeout: 4000 })
    await page.keyboard.press('Enter') // reabre com a T20 como atual
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { timeout: 4000 })
    await page.waitForTimeout(150)
    const reopened = await modalState(page)
    assert(reopened?.label?.includes('Temporada 20') ?? false, 'reaberto, o foco começa na temporada atual (T20)')
    assert(reopened?.visible === true, 'reaberto, a T20 já aparece na área visível, sem apertar nada')
    assert(reopened?.fadeStart === true, 'reaberto rolado, há fade em cima (temporadas acima)')
    mkdirSync(OUT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(OUT_DIR, 'modal-temporada-rolado.png') })
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

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
