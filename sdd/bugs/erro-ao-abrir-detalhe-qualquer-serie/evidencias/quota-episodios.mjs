import { readFile } from 'node:fs/promises'
const staticServer = createServer(async (req, res) => { try { const pathname = new URL(req.url, 'http://localhost').pathname; const file = "C:/Users/johns/Documents/Projetos/ccplayTv/CCPlayTv" + (pathname === '/' ? '/index.html' : pathname); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(await readFile(file)); } catch { res.writeHead(404); res.end(); } })
await new Promise(r => staticServer.listen(0, '127.0.0.1', r))
staticServer.unref()
// Roteiro E2E do bug `foco-some-ao-descer-na-lista` (detalhe da série): com o hero Cinema (059) a lista de episódios
// fica abaixo da dobra e tem o tamanho do conteúdo — quem rola é a página. Ao descer pelos episódios a linha focada
// tinha de continuar dentro da tela (1920×1080); antes da correção ela saía na 1ª seta ↓ e `.vod-detail` ficava com
// `scrollTop` 0. Painel Xtream FICTÍCIO com uma temporada de 14 episódios (o roteiro 025 só tem 2, por isso nunca viu isto).
//
// Também trava o bug `serie-sem-proximo-episodio-controles-somem`: o chrome do player fica na tela ao trocar de episódio pelo
// "Próximo episódio" e ao abrir um episódio com a página rolada, e o fim real do vídeo (`pause` + `ended`) chama a contagem.
//
// Pré-requisito: `npm run dev` rodando (http://127.0.0.1:5179).

import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'file:///C:/Users/johns/Documents/Projetos/ccplayTv/tv-web/node_modules/playwright/index.mjs'
import { openSectionCategory } from 'file:///C:/Users/johns/Documents/Projetos/ccplayTv/tv-web/e2e/lib/vod.mjs'
import { cadastrarListaM3u } from 'file:///C:/Users/johns/Documents/Projetos/ccplayTv/tv-web/e2e/lib/entrada.mjs'

const APP_URL = 'http://127.0.0.1:' + staticServer.address().port
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'

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
              '1': [{ id: '5001', episode_num: 1, title: 'Episodio 1', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5002', episode_num: 2, title: 'Episodio 2', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5003', episode_num: 3, title: 'Episodio 3', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5004', episode_num: 4, title: 'Episodio 4', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5005', episode_num: 5, title: 'Episodio 5', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5006', episode_num: 6, title: 'Episodio 6', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5007', episode_num: 7, title: 'Episodio 7', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5008', episode_num: 8, title: 'Episodio 8', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5009', episode_num: 9, title: 'Episodio 9', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5010', episode_num: 10, title: 'Episodio 10', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5011', episode_num: 11, title: 'Episodio 11', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5012', episode_num: 12, title: 'Episodio 12', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5013', episode_num: 13, title: 'Episodio 13', container_extension: 'mp4', info: { duration_secs: 1800 } },{ id: '5014', episode_num: 14, title: 'Episodio 14', container_extension: 'mp4', info: { duration_secs: 1800 } }],
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
  await cadastrarListaM3u(page, { nome: displayName, url: m3uUrl })
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
  const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()

  const snap = () =>
    page.evaluate(() => {
      const f = document.querySelector('.vod-episode-row.tv-focus')
      const b = f?.getBoundingClientRect()
      const det = document.querySelector('.vod-detail')
      return { name: f?.querySelector('.vod-episode-title')?.textContent ?? null, top: b ? Math.round(b.top) : null, bottom: b ? Math.round(b.bottom) : null, vh: innerHeight, pageScroll: det ? Math.round(det.scrollTop) : null, focused: document.querySelectorAll('.vod-episode-row.tv-focus').length }
    })
  const visible = (s) => s.top !== null && s.top >= 0 && s.bottom <= s.vh

  try {
    console.log('=== Série com 14 episódios: o foco fica à vista ao descer e ao subir ===')
    await page.addInitScript(() => {
      window.originalTransactionForQuotaTest = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
        const names = typeof stores === 'string' ? [stores] : [...stores]
        if (window.simulateEpisodeQuota && mode === 'readwrite' && names.includes('channels') && names.includes('categories')) throw new DOMException('quota fixture', 'QuotaExceededError')
        return window.originalTransactionForQuotaTest.call(this, stores, mode, ...args)
      }
    })
    await addSource(page, m3uUrl, 'Fonte E2E Foco Episódios')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.route(/\/series\/(usuario|teste)\//, () => {})
    await openSectionCategory(page, 'series', 'Séries')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.evaluate(() => { window.simulateEpisodeQuota = true })
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid="series-diagnostics"]')
    await page.waitForFunction(() => document.querySelector('[data-testid="series-diagnostics"]')?.textContent.includes('EPISODES_QUERY failed'))
    const report = await page.locator('[data-testid="series-diagnostics"]').innerText()
    assert(report.includes('EPISODES_STORE failed | StorageFullError'), 'assinatura visível')
    assert(!/usuario|senha|127\.0\.0\.1|player_api/.test(report), 'credenciais e URL omitidas')
    assert(report.includes('SERIES-DIAG-03'), 'versão 03 visível')
    const bounds = await page.locator('.diagnostic-report').boundingBox()
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 1080, 'painel inteiro na tela')
    await page.screenshot({path:'../sdd/bugs/erro-ao-abrir-detalhe-qualquer-serie/evidencias/quota-episodios.png'})
    assert(await page.getByText('Sem espaço no aparelho', { exact: true }).isVisible(), 'título específico de quota')
    assert(await page.getByText(/STO-01/).isVisible(), 'código de quota visível')
    await page.evaluate(() => { window.simulateEpisodeQuota = false })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail')
    assert(await page.locator('.vod-episode-row').count() > 0, 'retry abre episódios após restaurar escrita')
    await page.keyboard.press('Backspace')
    await page.waitForSelector('.vod-grid')
    assert(true, 'RETURN volta ao catálogo')
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} checagem(ns) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as checagens passaram.')
}

run()