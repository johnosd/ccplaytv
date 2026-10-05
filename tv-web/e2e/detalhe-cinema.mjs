// Roteiro E2E da feature 059 (detalhe "Cinema" de filme e série) — gate da
// constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre o que só um Chromium real prova (layout e tempo), com capturas em
// `test-results/detalhe-cinema/`:
// - filme com backdrop, capa com CORS (cor lida) e retomada: barra + "faltam", chips, rótulo do ícone só no foco,
//   abas inteiras na 1ª tela (FR-011), ↑ das abas devolve a página ao topo (FR-017)
// - filme sem backdrop e capa SEM CORS: fundo de ambiente neutro, nenhuma cor lida (FR-002)
// - SC-007: OK no cartão → primária focada em até 1 s, com e sem a cor da capa resolvida
// - série com episódio em andamento: barra do episódio
// - player aberto a partir do detalhe: nada do hero por cima (FR-025)
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173).
// Dados: só fictícios, montados aqui; nenhuma chamada real, nenhuma chave real.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { openSectionCategory } from './lib/vod.mjs'

const APP_URL = 'http://localhost:5173'
const SHOTS = 'test-results/detalhe-cinema'
const OPEN_BUDGET_MS = 1000

/** PNG 1×1 vermelho — capa com cor útil. */
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

let failures = 0
/** Requisições de imagem recebidas pelo servidor falso, por caminho. */
const imageHits = {}

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const base = `http://127.0.0.1:${server.address().port}`
    // Capas "públicas" num host diferente do painel (FR-024: capa no domínio do painel nunca é lida).
    const publicBase = `http://localhost:${server.address().port}`
    // Capas: uma com CORS (a cor pode ser lida), outra sem (o canvas recusa → neutro).
    if (url.pathname.startsWith('/img/')) imageHits[url.pathname] = (imageHits[url.pathname] ?? 0) + 1
    if (url.pathname === '/img/capa-cors.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' })
      return void res.end(RED_PNG)
    }
    if (url.pathname === '/img/capa-sem-cors.png' || url.pathname === '/img/capa-painel.png' || url.pathname === '/img/fundo.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return void res.end(RED_PNG)
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname === '/player_api.php') {
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return void res.end('[]')
      if (action === 'get_vod_categories') return void res.end(JSON.stringify([{ category_id: '10', category_name: 'Lançamentos 2024' }]))
      if (action === 'get_vod_streams') {
        return void res.end(
          JSON.stringify([
            { name: 'Duna', stream_id: 1, category_id: '10', year: 2021, stream_icon: `${publicBase}/img/capa-cors.png` },
            { name: 'Sem Fundo', stream_id: 2, category_id: '10', year: 2020, stream_icon: `${publicBase}/img/capa-sem-cors.png` },
            { name: 'Capa do Painel', stream_id: 3, category_id: '10', year: 2019, stream_icon: `${base}/img/capa-painel.png?token=segredo` },
          ]),
        )
      }
      if (action === 'get_vod_info') {
        const id = url.searchParams.get('vod_id')
        const info =
          id === '1'
            ? {
                plot: 'Paul Atreides precisa atravessar o deserto.',
                genre: 'Ação, Ficção científica',
                duration_secs: 7680,
                backdrop_path: [`${base}/img/fundo.png`],
              }
            : { plot: 'Um filme sem fundo.', duration_secs: 5400 }
        return void res.end(JSON.stringify({ info, movie_data: {} }))
      }
      if (action === 'get_series_categories') return void res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries Drama' }]))
      if (action === 'get_series') {
        return void res.end(JSON.stringify([{ name: 'Série Cinema', series_id: '500', category_id: '20', cover: `${publicBase}/img/capa-cors.png` }]))
      }
      if (action === 'get_series_info') {
        return void res.end(
          JSON.stringify({
            info: { plot: 'Uma série de teste.', genre: 'Drama' },
            episodes: {
              '1': [
                { id: '5001', episode_num: 1, title: 'Piloto', container_extension: 'mp4', info: { duration_secs: 2400 } },
                { id: '5002', episode_num: 2, title: 'Dois', container_extension: 'mp4', info: { duration_secs: 2400 } },
              ],
            },
          }),
        )
      }
      return void res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    }
    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
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

/** Grava no IndexedDB a posição de retomada de um item (mesmo formato do `userStateRepository`). */
async function seedProgress(page, stableIdSuffix, progressSeconds) {
  return page.evaluate(
    ({ suffix, progress }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('ccplaytv')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const idb = open.result
          const sources = idb.transaction('sources', 'readonly').objectStore('sources').getAll()
          sources.onsuccess = () => {
            const sourceId = sources.result[0]?.id
            const tx = idb.transaction('userStates', 'readwrite')
            tx.objectStore('userStates').put({ stableId: `${sourceId}|${suffix}`, sourceId, progressSeconds: progress, lastWatched: Date.now() })
            tx.oncomplete = () => {
              idb.close()
              resolve(sourceId)
            }
            tx.onerror = () => reject(tx.error)
          }
        }
      }),
    { suffix: stableIdSuffix, progress: progressSeconds },
  )
}

const focusedCardTitle = (page) =>
  page.evaluate(() => document.querySelector('.tv-focus')?.closest('.content-card')?.querySelector('.content-card-title')?.textContent ?? null)

/** Na grade da categoria: foca o cartão `title` e mede OK → ação primária focada no detalhe (SC-007). */
async function openDetailTimed(page, title) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await focusedCardTitle(page)) === title) break
    await page.keyboard.press('ArrowRight')
  }
  assert((await focusedCardTitle(page)) === title, `cartão "${title}" focado na grade`)
  const started = Date.now()
  await page.keyboard.press('Enter')
  await page.waitForSelector('.vod-detail-action--primary.tv-focus', { timeout: 8000 })
  return Date.now() - started
}

const primaryText = (page) => page.locator('.vod-detail-action--primary').evaluate((el) => el.firstChild?.textContent ?? '')

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const server = await startPanelServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const m3uUrl = `${base}/get.php?username=usuario&password=senha`

  const browser = await launchBrowser()
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleLines.push(msg.text()))

  try {
    await addSource(page, m3uUrl, 'Fonte E2E Detalhe Cinema')
    await seedProgress(page, 'movie|id:1', 2530) // Duna: 42:10 de 2h08

    console.log('=== Cenário 1: filme com backdrop, capa com CORS e retomada ===')
    await openSectionCategory(page, 'movies', 'Lançamentos 2024')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    const openWithColor = await openDetailTimed(page, 'Duna')
    console.log(`  · OK → primária focada: ${openWithColor} ms`)
    assert(openWithColor <= OPEN_BUDGET_MS, `SC-007: primária focável em até ${OPEN_BUDGET_MS} ms (${openWithColor} ms)`)
    await page.waitForFunction(() => document.querySelector('.vod-detail-remaining')?.textContent?.includes('faltam'), null, { timeout: 8000 })
    assert((await primaryText(page)) === '▶ Continuar de 42:10', 'primária "▶ Continuar de 42:10"')
    assert((await page.locator('.vod-detail-action--primary [role="progressbar"]').getAttribute('aria-valuenow')) === '33', 'barra em 33%')
    assert((await page.locator('.vod-detail-remaining').textContent()) === 'faltam 1 h 25 min', '"faltam 1 h 25 min"')
    await page.waitForSelector('.vod-detail-backdrop img', { timeout: 8000 })
    const chips = await page.locator('.vod-detail-chips li').allTextContents()
    assert(chips.join('|') === 'Lançamentos 2024|Ação|Ficção científica', `chips: categoria antes dos gêneros (${chips.join('|')})`)
    const meta = (await page.locator('.vod-detail-meta').textContent()) ?? ''
    assert(!meta.includes('Lançamentos 2024'), 'a categoria saiu da linha de metadata')
    const coverBox = await page.locator('.vod-detail-poster .poster-box').boundingBox()
    assert(coverBox !== null && coverBox.width >= 400 && coverBox.height >= 600, `capa ≥ 400×600 (${coverBox?.width}×${coverBox?.height})`)
    const tabsBox = await page.locator('.vod-detail .tabs').boundingBox()
    assert(tabsBox !== null && tabsBox.y + tabsBox.height <= 1080, `abas inteiras na 1ª tela, sem rolar (base em ${tabsBox && Math.round(tabsBox.y + tabsBox.height)}px)`)
    await page
      .waitForFunction(() => document.querySelector('.vod-detail-hero')?.classList.contains('has-cover-color'), null, { timeout: 4000 })
      .catch(() => {})
    assert(await page.locator('.vod-detail-hero.has-cover-color').count() === 1, 'capa com CORS: a cor da capa foi lida')
    await page.screenshot({ path: `${SHOTS}/01-filme-retomada.png` })

    console.log('=== Cenário 2: rótulo do ícone só no foco ===')
    await page.keyboard.press('ArrowRight') // ↺ Reiniciar
    const colors = await page.evaluate(() =>
      [...document.querySelectorAll('.vod-detail-icon-action')].map((el) => ({ focused: el.classList.contains('tv-focus'), color: getComputedStyle(el).color })),
    )
    const transparent = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
    assert(colors.filter((c) => c.focused).length === 1 && !transparent(colors.find((c) => c.focused).color), 'o ícone focado mostra o rótulo')
    assert(colors.filter((c) => !c.focused).every((c) => transparent(c.color)), 'os ícones sem foco escondem o rótulo')
    await page.screenshot({ path: `${SHOTS}/02-icone-focado.png` })

    console.log('=== Cenário 3: abas e volta ao topo ===')
    await page.keyboard.press('ArrowDown')
    assert(((await page.locator('.tabs .tv-focus').textContent()) ?? '') === 'Detalhes', '↓ das ações vai para a aba ativa')
    await page.evaluate(() => {
      document.querySelector('.screen.vod-detail').scrollTop = 500
    })
    await page.keyboard.press('ArrowUp')
    assert((await page.locator('.vod-detail-icon-action.tv-focus').textContent()) === '↺ Reiniciar', '↑ das abas volta à última ação focada')
    assert((await page.evaluate(() => document.querySelector('.screen.vod-detail').scrollTop)) === 0, '↑ devolve a página ao topo')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown') // nada focável na aba Detalhes: o foco fica na aba; a página pode rolar
    await page.screenshot({ path: `${SHOTS}/03-detalhes-cartoes.png`, fullPage: false })
    const facts = await page.locator('.vod-detail-fact').allTextContents()
    assert(facts.some((f) => f.includes('Categoria') && f.includes('Dados: fonte')), 'cartão de Categoria com "Dados: fonte"')

    console.log('=== Cenário 4: player a partir do detalhe — nada do hero por cima ===')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.player-overlay', { timeout: 8000 })
    const onTop = await page.evaluate(() => document.elementFromPoint(960, 540)?.closest('.player-overlay') !== null)
    assert(onTop, 'o centro da tela é do player, não do hero')
    await page.screenshot({ path: `${SHOTS}/04-player.png` })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    console.log('=== Cenário 5: filme sem backdrop e capa sem CORS ===')
    const openNoColor = await openDetailTimed(page, 'Sem Fundo')
    console.log(`  · OK → primária focada: ${openNoColor} ms`)
    assert(openNoColor <= OPEN_BUDGET_MS, `SC-007 sem a cor da capa: primária focável em até ${OPEN_BUDGET_MS} ms (${openNoColor} ms)`)
    await page.waitForTimeout(1500) // tempo para a leitura da cor falhar (sem CORS)
    assert((await page.locator('.vod-detail-backdrop').count()) === 0, 'sem backdrop')
    assert((await page.locator('.vod-detail-hero .vod-detail-ambient').count()) === 1, 'fundo de ambiente presente')
    assert((await page.locator('.vod-detail-hero.has-cover-color').count()) === 0, 'capa sem CORS: nenhuma cor lida (neutro)')
    assert((await primaryText(page)) === '▶ Assistir', 'sem posição salva: "▶ Assistir" sem barra')
    assert((await page.locator('.vod-detail-action--primary [role="progressbar"]').count()) === 0, 'sem barra')
    await page.screenshot({ path: `${SHOTS}/05-filme-sem-fundo.png` })
    // Capa pública sem CORS: o navegador PODE escrever a URL dela no console (nativo, decisão de 2026-10-05) — é pública.
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    console.log('=== Cenário 5b: capa no domínio do painel, com query — nunca é lida (FR-024) ===')
    const panelCoverHitsBefore = imageHits['/img/capa-painel.png'] ?? 0
    await openDetailTimed(page, 'Capa do Painel')
    await page.waitForTimeout(1500)
    // O <img> do pôster pede a capa normalmente (1 vez, sem CORS); a leitura da cor NÃO pede de novo.
    const panelCoverHits = (imageHits['/img/capa-painel.png'] ?? 0) - panelCoverHitsBefore
    assert(panelCoverHits <= 1, `a capa do painel não foi pedida em modo CORS para ler a cor (${panelCoverHits} pedido(s), só o do pôster)`)
    assert((await page.locator('.vod-detail-hero.has-cover-color').count()) === 0, 'capa do painel: fundo neutro')
    const leaked = consoleLines.filter((line) => line.includes('segredo'))
    if (leaked.length > 0) console.log(`  · linhas do console com a query (fictícia): ${JSON.stringify(leaked)}`)
    assert(leaked.length === 0, 'nenhuma URL com credencial/token aparece no console (FR-024)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.keyboard.press('Escape')

    console.log('=== Cenário 6: série com episódio em andamento ===')
    await seedProgress(page, 'episode|id:5001|s1|e1', 1200)
    await openSectionCategory(page, 'series', 'Séries Drama')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    const openSeries = await openDetailTimed(page, 'Série Cinema')
    console.log(`  · OK → primária focada: ${openSeries} ms`)
    await page.waitForFunction(() => document.querySelector('.vod-detail-remaining')?.textContent?.includes('faltam'), null, { timeout: 8000 })
    assert((await primaryText(page)) === '▶ Continuar T1:E1', 'série: "▶ Continuar T1:E1"')
    assert((await page.locator('.vod-detail-remaining').textContent()) === 'faltam 20 min', 'série: "faltam 20 min" do episódio')
    const seriesIcons = await page.locator('.vod-detail-icon-action').allTextContents()
    assert(!seriesIcons.some((label) => label.includes('Reiniciar') || label.includes('assistido')), `série sem Reiniciar nem Marcar assistido (${seriesIcons.join(' | ')})`)
    await page.screenshot({ path: `${SHOTS}/06-serie-retomada.png` })
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO:', error)
    await page.screenshot({ path: `${SHOTS}/erro.png` }).catch(() => {})
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

run()
