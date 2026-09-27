// Evidência de paridade visual da feature 021 (fundação visual DS V14,
// D-011 do plan.md) — NÃO é um gate de asserção como os demais scripts de
// `e2e/`: captura 8 telas principais em imagem, para revisão humana de
// que o layout não mudou (spec FR-028, SC-003/SC-004). Roda duas vezes:
//
//   node e2e/paridade-visual.mjs antes    # ANTES de qualquer mudança da feature
//   node e2e/paridade-visual.mjs depois   # DEPOIS, para comparar
//
// "depois" também captura 3 das 8 telas em 1280×720 e 3840×2160 (SC-004).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/paridade-visual.m3u`), servidos por um
// HTTP server local criado por este próprio script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'paridade-visual.m3u')
const APP_URL = 'http://localhost:5173'
const OUT_ROOT = path.resolve(__dirname, '..', '..', 'sdd', 'specs', '021-fundacao-visual-ds-v14', 'evidencias')

const MODE = process.argv[2]
if (MODE !== 'antes' && MODE !== 'depois') {
  console.error('Uso: node e2e/paridade-visual.mjs antes|depois')
  process.exit(1)
}

let shots = 0

function startFixtureServer() {
  const body = readFileSync(FIXTURE_PATH)
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) {
    return chromium.launch({ headless: true, executablePath: fixedPath })
  }
  return chromium.launch({ headless: true })
}

async function addSource(page, m3uUrl, displayName) {
  await page.goto(APP_URL)
  // Sem lista, só "Adicionar lista", já em foco (feature 023): OK abre o
  // formulário — ele não é mais a tela de entrada (mesmo padrão dos demais
  // scripts em `e2e/`; achado ao rodar este script pela primeira vez desde
  // a 023, pré-existente, corrigido aqui pra script poder rodar).
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.waitForSelector('.source-card', { timeout: 8000 })
}

/** As URLs de vídeo/live da fixture não são de verdade — sem interceptar, o
 *  <video> dispara `error` em corrida com o resto do fluxo (mesmo padrão de
 *  outros scripts em `e2e/`). Aqui é só evidência visual, não precisamos do
 *  vídeo de fato tocando — só que o chrome do player apareça. */
async function stubPlaybackNetwork(page) {
  await page.route('**/vod/**', () => {})
  await page.route('**/series/**', () => {})
  await page.route('**/live/**', () => {})
}

async function settle(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {})
  await page.waitForTimeout(300)
}

async function capture(page, dir, name) {
  await settle(page)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`) })
  shots += 1
  console.log(`  📸 ${name} (${dir})`)
}

/**
 * Do hub (tiles-row, foco em "Live TV") até a categoria de canais já entrada.
 *
 * Feature 024 (Onda 3) redesenhou a Live TV pro V14, e a feature 025 (Onda
 * 4) redesenhou Filmes/Séries e seus detalhes — este script não serve mais
 * pra provar "zero layout change" da 021 (esse baseline já fechou), só
 * evita que trave se alguém rodar de novo, e passa a servir de referência
 * visual do layout novo (T041 do plan.md da 024, R-002; T062/R-00X da 025):
 * a linha de canal virtualizada trocou de `.live-item` pra
 * `.live-channel-row`; a grade e o detalhe de Filmes/Séries trocaram de
 * `.poster-*`/`.movie-detail-layout`/`.series-detail-header` pra
 * `.vod-grid`/`.content-card*`/`.vod-detail` (feature 025).
 */
async function openLiveCategory(page) {
  await page.keyboard.press('Enter') // tile "Live TV" (foco inicial)
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
  await page.keyboard.press('ArrowRight') // trilha -> entra na 1ª categoria real
  await page.waitForSelector('.live-channel-list .live-channel-row', { timeout: 8000 })
  await page.waitForSelector('.live-preview-panel', { timeout: 8000 })
}

/**
 * Espera o trilho ter uma categoria REAL (depois de ★ Favoritos, ↺ Histórico
 * e Todos — feature 025, `VIRTUAL_TRAIL_COUNT = 3`) antes do `ArrowRight`
 * que entra: enquanto as categorias carregam, o trilho só tem as 3 virtuais
 * e o padrão cai em "Todos" — entrar cedo demais pousa numa lista vazia
 * (mesma corrida documentada em `busca-por-categoria.mjs`/`favoritos.mjs`).
 */
async function waitForRealCategory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, {
    timeout: 8000,
  })
}

/** Do hub até a grade de Filmes já entrada (categoria única desta fixture). */
async function openMoviesGrid(page) {
  await page.keyboard.press('ArrowRight') // Live TV -> Filmes
  await page.keyboard.press('Enter')
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight') // trilha -> entra em "Filmes"
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

/** Do hub até a grade de Séries já entrada (categoria única desta fixture). */
async function openSeriesGrid(page) {
  await page.keyboard.press('ArrowRight') // Live TV -> Filmes
  await page.keyboard.press('ArrowRight') // Filmes -> Séries
  await page.keyboard.press('Enter')
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight') // trilha -> entra em "Séries"
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

/** Abre o detalhe do 1º item já focado na grade e, em seguida, o player (ação primária). */
async function openDetailAndPlayer(page, detailSelector) {
  await page.keyboard.press('Enter') // grade -> detalhe
  await page.waitForSelector(detailSelector, { timeout: 8000 })
}

async function openPlayerFromDetail(page) {
  await page.keyboard.press('Enter') // ação primária ("Assistir"/"Continuar") já focada
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await page.waitForSelector('.player-video', { timeout: 8000 })
  // Conteúdo fictício não decodifica de verdade — evidência visual só
  // precisa do chrome do player, não de reprodução real.
  await page.evaluate(() => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event('playing'))
  })
  await page.waitForTimeout(300)
}

/** Sequência completa nas 8 telas (D-011), em 1920×1080. */
async function runMainWalkthrough(page, m3uUrl, outDir) {
  await addSource(page, m3uUrl, 'Fonte E2E Paridade Visual')
  await capture(page, outDir, '01-lista-fontes')

  await page.keyboard.press('Enter') // abre a fonte
  await page.waitForSelector('.tiles-row', { timeout: 8000 })
  await capture(page, outDir, '02-hub')

  await stubPlaybackNetwork(page)

  await openLiveCategory(page)
  await capture(page, outDir, '03-live')
  await page.keyboard.press('Escape') // canais -> trilha
  await page.keyboard.press('Escape') // trilha -> hub
  await page.waitForSelector('.tiles-row', { timeout: 8000 })

  await openMoviesGrid(page)
  await capture(page, outDir, '04-filmes')

  await openDetailAndPlayer(page, '.vod-detail')
  await capture(page, outDir, '06-detalhe-filme')

  await openPlayerFromDetail(page)
  await capture(page, outDir, '08-player')
  await page.keyboard.press('Escape') // player -> detalhe
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await page.keyboard.press('Escape') // detalhe -> grade
  await page.waitForSelector('.vod-grid', { timeout: 8000 })
  await page.keyboard.press('Escape') // grade -> trilha
  await page.keyboard.press('Escape') // trilha -> hub
  await page.waitForSelector('.tiles-row', { timeout: 8000 })

  await openSeriesGrid(page)
  await capture(page, outDir, '05-series')

  await openDetailAndPlayer(page, '.vod-detail')
  await capture(page, outDir, '07-detalhe-serie')
}

/** SC-004 — mesma fixture, contexto isolado próprio, só 3 das 8 telas. */
async function runViewportWalkthrough(browser, m3uUrl, width, height, suffix, outDir) {
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  try {
    await addSource(page, m3uUrl, `Fonte E2E Paridade Visual ${suffix}`)
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })

    await stubPlaybackNetwork(page)

    await openLiveCategory(page)
    await capture(page, outDir, `03-live-${suffix}`)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })

    await openMoviesGrid(page)
    await capture(page, outDir, `04-filmes-${suffix}`)

    await openDetailAndPlayer(page, '.vod-detail')
    await openPlayerFromDetail(page)
    await capture(page, outDir, `08-player-${suffix}`)
  } finally {
    await context.close()
  }
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/paridade-visual.m3u`
  const outDir = path.join(OUT_ROOT, MODE)

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log(`=== Capturando telas principais (1920×1080) — modo "${MODE}" ===`)
    await runMainWalkthrough(page, m3uUrl, outDir)
    await context.close()

    if (MODE === 'depois') {
      console.log('=== SC-004: capturando 03/04/08 em 1280×720 ===')
      await runViewportWalkthrough(browser, m3uUrl, 1280, 720, '720p', outDir)
      console.log('=== SC-004: capturando 03/04/08 em 3840×2160 ===')
      await runViewportWalkthrough(browser, m3uUrl, 3840, 2160, '4k', outDir)
    }
  } catch (error) {
    console.error('  ✗ ERRO NÃO TRATADO:', error)
    process.exitCode = 1
  } finally {
    await browser.close()
    server.close()
  }

  console.log('')
  console.log(`${shots} captura(s) salvas em ${outDir}`)
  if (process.exitCode !== 1) {
    console.log(
      MODE === 'antes'
        ? 'Baseline "antes" pronta. Rode novamente com "depois" após a mudança para comparar.'
        : 'Capturas "depois" prontas — compare manualmente com evidencias/antes/ (quickstart.md, seção 3).',
    )
  }
}

await run()
