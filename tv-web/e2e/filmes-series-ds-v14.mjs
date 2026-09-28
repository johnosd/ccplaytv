// Roteiro E2E da feature 025 (Filmes e Séries no Design System V14, Onda 4)
// — gate da constitution v1.5.0 ("Testes E2E (Playwright) antes de
// validação em TV física").
//
// Cobre, com um painel Xtream fictício (único jeito de exercitar "Ano"/
// "Recém-adicionados" de verdade — M3U não declara esses campos, `research.md`
// R1): composição de foco topbar ↔ side nav; memória de foco por entrada
// (inclusive ir ao Início e voltar); "↺ Histórico" com um filme e uma série;
// "Ordenar" por Ano; detalhe de filme (ações, mocks, sem placeholder);
// detalhe de série (modal de temporada, barra × texto conforme duração);
// screenshot da grade (R-002 do plan.md).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios, servidos por um painel Xtream fictício criado por
// este próprio script (mesmo padrão de `m3u-sob-demanda.mjs`) — nunca uma
// fonte real.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'
const OUT_DIR = path.join(__dirname, '..', '..', 'sdd', 'specs', '025-filmes-series-ds-v14', 'evidencias')

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/**
 * Painel Xtream fictício com filmes (dois com `year`, um sem) e uma série
 * de duas temporadas (um episódio com duração declarada, outro sem) — o
 * necessário para "Ordenar por Ano" e para a barra de progresso real vs.
 * "Continuar de mm:ss" do episódio.
 */
function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/player_api.php') {
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })

      if (action === 'get_live_categories' || action === 'get_live_streams') {
        res.end(JSON.stringify([]))
        return
      }
      if (action === 'get_vod_categories') {
        res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes' }]))
        return
      }
      if (action === 'get_vod_streams') {
        res.end(
          JSON.stringify([
            { name: 'Filme Antigo', stream_id: 1, category_id: '10', year: 1999 },
            { name: 'Filme Novo', stream_id: 2, category_id: '10', year: 2023 },
            { name: 'Filme Sem Ano', stream_id: 3, category_id: '10' },
          ]),
        )
        return
      }
      if (action === 'get_series_categories') {
        res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries' }]))
        return
      }
      if (action === 'get_series') {
        res.end(JSON.stringify([{ name: 'Série Exemplo', series_id: '500', category_id: '20' }]))
        return
      }
      if (action === 'get_series_info') {
        res.end(
          JSON.stringify({
            episodes: {
              '1': [
                { id: '5001', episode_num: 1, title: 'Piloto', container_extension: 'mp4', info: { duration_secs: 1800 } },
                { id: '5002', episode_num: 2, title: 'Capítulo Dois', container_extension: 'mp4' },
              ],
              '2': [{ id: '5003', episode_num: 1, title: 'Retorno', container_extension: 'mp4' }],
            },
          }),
        )
        return
      }
      // Sem ação: status da conta (autenticação).
      res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
      return
    }

    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function addSource(page, m3uUrl, displayName) {
  await page.goto(APP_URL)
  // Sem lista, só "Adicionar lista", já em foco (feature 023).
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: displayName }).waitFor({ timeout: 8000 })
}

/**
 * Do Início (hero, rails ou topbar — qualquer foco restaurado), abre TV ao
 * vivo/Filmes/Séries pela topbar. Substitui o antigo hub de atalhos
 * (`.tiles-row`, removido na feature 026 — US1 troca o hub provisório pela
 * Home definitiva com hero+rails; a entrada nas 3 categorias passa a ser só
 * pela topbar). Sobe até a topbar (não importa em que linha do conteúdo o
 * foco esteja — `ArrowUp` de sobra não faz nada uma vez lá dentro), reseta
 * a posição horizontal pra "Início" (`ArrowLeft` de sobra, com clamp) e só
 * então conta as setas certas — nunca assume de onde o foco restaurado
 * (FR-017/FR-029) partiu.
 */
async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Espera a categoria REAL aparecer na trilha (feature 025, `VIRTUAL_TRAIL_COUNT = 3`: ★/↺/Todos). */
async function waitForRealCategory(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('.side-category-nav-item').length >= 4,
    null,
    { timeout: 8000 },
  )
}

async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

async function setPartialProgress(page, currentTimeSec, durationSec) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate(
    ({ currentTimeSec, durationSec }) => {
      const video = document.querySelector('.player-video')
      if (!video) return
      Object.defineProperty(video, 'duration', { value: durationSec, configurable: true })
      video.currentTime = currentTimeSec
      video.dispatchEvent(new Event('timeupdate'))
    },
    { currentTimeSec, durationSec },
  )
}

/**
 * `markCompleted` (US4, D-005 do plan.md) grava `completedAt` mas
 * DELIBERADAMENTE não toca `lastWatched` (violaria FR-011 — corrigido no
 * comentário pela própria feature 025, T040). "↺ Histórico" é lido por
 * `lastWatched` (`listPlayed`): sem um `timeupdate` real antes do fim, como
 * a reprodução de verdade sempre tem, o item concluído nunca apareceria em
 * ↺ nesta simulação — por isso, ao contrário de `historico-continuar-
 * assistindo.mjs` (que só precisava do selo "Assistido"), este script grava
 * um progresso intermediário antes de concluir.
 */
async function completePlayback(page, durationSec = 600) {
  await fireVideoEvent(page, 'playing')
  await setPartialProgress(page, Math.floor(durationSec * 0.5), durationSec)
  await fireVideoEvent(page, 'ended')
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function run() {
  const server = await startPanelServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`

  const browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('icon-size')) console.error('  [console.error]', msg.text())
  })

  try {
    console.log('=== Adicionar fonte via painel Xtream fictício (com ano/duração) ===')
    await addSource(page, m3uUrl, 'Fonte E2E DS V14')
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.route('**/movie/**', () => {})
    await page.route('**/series/**', () => {})

    console.log('=== Composição de foco: topbar ↔ side nav ===')
    await openViaTopbar(page, 'movies')
    await waitForRealCategory(page)
    assert(
      (await page.locator('.side-category-nav-item.tv-focus').textContent())?.includes('Filmes') ?? false,
      'padrão sem navegação: foco na 1ª categoria real ("Filmes")',
    )
    // Trilha: Favoritos(0)/Histórico(1)/Todos(2)/Filmes(3, foco padrão) —
    // 3x CIMA chega em ★ Favoritos; só uma 4ª CIMA (já em Favoritos) sobe à
    // topbar (`logic/foco-vod.md` §1: "saída só por ↑ em ★").
    await page.keyboard.press('ArrowUp') // Filmes -> Todos
    await page.keyboard.press('ArrowUp') // Todos -> Histórico
    await page.keyboard.press('ArrowUp') // Histórico -> Favoritos
    await page.keyboard.press('ArrowUp') // Favoritos -> topbar
    assert(
      (await page.locator('.topbar-item.tv-focus').textContent()) === 'Filmes',
      'subir além de ★ Favoritos sobe à topbar, com "Filmes" em foco',
    )
    await page.keyboard.press('ArrowDown') // topbar -> conteúdo (volta em ★ Favoritos)
    assert(
      (await page.locator('.side-category-nav-item.tv-focus').textContent())?.includes('Favoritos') ?? false,
      'descer da topbar devolve o foco à side nav, em ★ Favoritos (de onde se saiu)',
    )
    await page.keyboard.press('ArrowDown') // Favoritos -> Histórico
    await page.keyboard.press('ArrowDown') // Histórico -> Todos
    await page.keyboard.press('ArrowDown') // Todos -> Filmes

    console.log('=== Grade de Filmes: entra e captura evidência (R-002) ===')
    await page.keyboard.press('ArrowRight') // entra em "Filmes"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    const titlesInSourceOrder = await page.locator('.content-card-title').allTextContents()
    assert(
      titlesInSourceOrder.join(',') === 'Filme Antigo,Filme Novo,Filme Sem Ano',
      'grade mostra os 3 filmes na ordem da fonte',
    )
    mkdirSync(OUT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(OUT_DIR, 'grade-filmes.png') })

    console.log('=== Memória de foco por entrada (inclusive ir ao Início e voltar) ===')
    await page.keyboard.press('ArrowRight') // Filme Antigo -> Filme Novo
    await page.keyboard.press('Escape') // grade -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'movies') // volta a Filmes
    await waitForRealCategory(page)
    await page.keyboard.press('ArrowRight') // entra de novo em "Filmes"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.vod-grid-cell .tv-focus').locator('..').locator('.content-card-title').textContent()) ===
        'Filme Novo',
      'reentrar na categoria lembra o último card focado ("Filme Novo"), não volta ao 1º',
    )

    console.log('=== Ordenar por Ano (US4) ===')
    await page.keyboard.press('ArrowUp') // grade -> toolbar ("Pesquisar")
    await page.keyboard.press('ArrowRight') // "Pesquisar" -> "Ordenar"
    await page.keyboard.press('Enter') // abre o modal
    await page.waitForSelector('[role="dialog"][aria-label="Ordenar"]', { timeout: 4000 })
    await page.waitForTimeout(150) // setas em sequência rápida logo após montar o modal podem se perder (achado ao rodar este script)
    await page.keyboard.press('ArrowDown') // "Ordem da fonte" -> "A–Z"
    await page.keyboard.press('ArrowDown') // "A–Z" -> "Ano"
    await page.waitForTimeout(50)
    assert((await page.locator('.vod-sort-modal-item.tv-focus').textContent())?.includes('Ano') ?? false, 'terceira opção do modal é "Ano"')
    await page.keyboard.press('Enter') // escolhe "Ano"
    await page.waitForSelector('[role="dialog"][aria-label="Ordenar"]', { state: 'detached', timeout: 4000 })
    const titlesByYear = await page.locator('.content-card-title').allTextContents()
    assert(
      titlesByYear.join(',') === 'Filme Novo,Filme Antigo,Filme Sem Ano',
      'ordenado por Ano: mais recente primeiro, sem ano por último (2023, 1999, ausente)',
    )

    console.log('=== ↺ Histórico: assistir um filme até o fim ===')
    // Depois de escolher no modal, o foco volta ao botão "Ordenar" (FR-018)
    // — uma seta BAIXO devolve à grade antes do OK abrir o detalhe.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    const heroTitle = await page.locator('.vod-detail-title').textContent()
    await page.keyboard.press('Enter') // ação primária "Assistir" (índice 0)
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await completePlayback(page)
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    await page.waitForSelector('text=/Desmarcar assistido/', { timeout: 8000 })
    assert(true, `"${heroTitle}" concluído`)

    await page.keyboard.press('Escape') // detalhe -> grade
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha (em "Filmes", 4ª posição: Favoritos/Histórico/Todos/Filmes)
    await page.keyboard.press('ArrowUp') // Filmes -> Todos
    await page.keyboard.press('ArrowUp') // Todos -> Histórico
    assert(
      (await page.locator('.side-category-nav-item.tv-focus').textContent())?.includes('Histórico') ?? false,
      'subir 2x a partir da única categoria real chega em "↺ Histórico"',
    )
    await page.keyboard.press('ArrowRight') // entra em ↺
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.content-card-title').allTextContents()).includes(heroTitle ?? ''),
      '"↺ Histórico" mostra o filme concluído',
    )

    console.log('=== Detalhe de filme: ações, mocks, sem placeholder (US5) ===')
    await page.keyboard.press('Enter') // reabre o detalhe pelo Histórico
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    assert(
      !(await page.getByText(/Resumo não disponível/).isVisible().catch(() => false)),
      'sem sinopse fixa inventada',
    )
    assert(!(await page.getByText('Elenco: Desconhecido').isVisible().catch(() => false)), 'sem "Elenco: Desconhecido"')
    await page.keyboard.press('ArrowRight') // Assistir -> Minha Lista
    await page.keyboard.press('ArrowRight') // Minha Lista -> Trailer
    await page.keyboard.press('Enter') // Trailer (soft-disabled) — só anuncia
    assert(await page.getByText(/Em breve — Trailer/).isVisible(), 'Trailer soft-disabled anuncia "Em breve" sem abrir o player')
    assert((await page.locator('[role="dialog"]').count()) === 0, 'Trailer não abriu nenhuma camada')
    await page.keyboard.press('ArrowDown') // ações -> abas
    await page.keyboard.press('ArrowRight') // Detalhes -> Elenco
    await page.keyboard.press('Enter')
    assert(await page.getByText(/Em breve — Elenco/).isVisible(), 'aba "Elenco" soft-disabled anuncia "Em breve"')
    await page.keyboard.press('Escape') // detalhe -> grade (↺ Histórico)
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== Séries: histórico parcial e o modal de temporada (US6) ===')
    await openViaTopbar(page, 'series')
    await waitForRealCategory(page)
    await page.keyboard.press('ArrowRight') // entra em "Séries"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre o detalhe da série
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    assert(
      (await page.locator('.vod-detail-action').first().textContent()) === '▶ Assistir T1:E1',
      'sem histórico, a ação primária é "Assistir T1:E1"',
    )
    await page.keyboard.press('Enter') // toca o episódio 1 (Piloto, com duração declarada)
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await setPartialProgress(page, 300, 1800) // 5min de 30min — retomada, sem concluir
    await page.keyboard.press('Escape') // RETURN encerra sem concluir
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    assert(
      (await page.locator('.vod-detail-action').first().textContent()) === '▶ Continuar T1:E1',
      'com retomada salva, a ação primária vira "Continuar T1:E1"',
    )

    // actions -> tabs -> season -> episodes (3 setas, `logic/detalhe-vod.md` §6).
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.vod-episode-row', { timeout: 8000 })
    const piloto = page.locator('.vod-episode-row', { hasText: 'Piloto' })
    assert(
      (await piloto.locator('.vod-episode-progress-bar').count()) === 1,
      'episódio com duração declarada (Piloto) mostra barra real de progresso',
    )
    const capitulo2 = page.locator('.vod-episode-row', { hasText: 'Capítulo Dois' })
    assert(
      (await capitulo2.locator('.vod-episode-progress-bar').count()) === 0 &&
        !(await capitulo2.getByText(/Continuar de/).isVisible().catch(() => false)),
      'episódio sem duração e nunca aberto não mostra barra nem texto de retomada',
    )

    console.log('=== Modal de temporada troca a lista (FR-040) ===')
    await page.keyboard.press('ArrowUp') // episódios -> temporada
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter') // abre o modal
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { timeout: 4000 })
    await page.waitForTimeout(150) // setas em sequência rápida logo após montar o modal podem se perder (achado ao rodar este script)
    await page.keyboard.press('ArrowDown') // Temporada 1 -> Temporada 2
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter') // escolhe
    await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { state: 'detached', timeout: 4000 })
    assert(
      await page.locator('.content-card-title', { hasText: 'Retorno' }).isVisible(),
      'modal trocou pra Temporada 2, mostrando "Retorno"',
    )
    assert(
      (await page.locator('.content-card-title', { hasText: 'Piloto' }).count()) === 0,
      'episódios da Temporada 1 somem da lista',
    )

    console.log('=== ↺ Histórico também resolve a série (episódio agregado) ===')
    await page.keyboard.press('Escape') // detalhe -> grade
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha (em "Séries", 4ª posição)
    await page.keyboard.press('ArrowUp') // Séries -> Todos
    await page.keyboard.press('ArrowUp') // Todos -> Histórico
    assert(
      (await page.locator('.side-category-nav-item.tv-focus').textContent())?.includes('Histórico') ?? false,
      'subir 2x a partir da única categoria real de Séries chega em "↺ Histórico"',
    )
    await page.keyboard.press('ArrowRight')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.content-card-title').first().textContent()) === 'Série Exemplo',
      '"↺ Histórico" de Séries mostra a série (uma entrada, não o episódio solto)',
    )
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
  } finally {
    await browser.close()
    server.close()
  }

  console.log('')
  if (failures > 0) {
    console.error(`${failures} verificação(ões) falharam.`)
    process.exitCode = 1
  } else {
    console.log('Todas as verificações passaram.')
  }
}

await run()
