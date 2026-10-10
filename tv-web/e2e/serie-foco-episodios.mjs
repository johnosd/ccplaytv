// Roteiro E2E do bug `foco-some-ao-descer-na-lista` (detalhe da série): com o hero Cinema (059) a lista de episódios
// fica abaixo da dobra e tem o tamanho do conteúdo — quem rola é a página. Ao descer pelos episódios a linha focada
// tinha de continuar dentro da tela (1920×1080); antes da correção ela saía na 1ª seta ↓ e `.vod-detail` ficava com
// `scrollTop` 0. Painel Xtream FICTÍCIO com uma temporada de 14 episódios (o roteiro 025 só tem 2, por isso nunca viu isto).
//
// Também trava o bug `serie-sem-proximo-episodio-controles-somem`: o chrome do player fica na tela ao trocar de episódio pelo
// "Próximo episódio" e ao abrir um episódio com a página rolada, e o fim real do vídeo (`pause` + `ended`) chama a contagem.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173).

import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { openSectionCategory } from './lib/vod.mjs'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
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
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

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
    await addSource(page, m3uUrl, 'Fonte E2E Foco Episódios')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.route(/\/series\/(usuario|teste)\//, () => {})
    await openSectionCategory(page, 'series', 'Séries')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowDown') // ações → abas → episódios
    await page.waitForSelector('.vod-episode-row.tv-focus', { timeout: 8000 })
    await page.waitForTimeout(300)

    let s = await snap()
    assert(s.focused === 1 && visible(s), `1º episódio focado e à vista (topo ${s.top}, base ${s.bottom} de ${s.vh})`)

    let allVisible = true
    let maxScroll = 0
    for (let i = 2; i <= 14; i += 1) {
      await page.keyboard.press('ArrowDown')
      await page.waitForFunction((n) => document.querySelector('.vod-episode-row.tv-focus .vod-episode-title')?.textContent === `Episodio ${n}`, i, { timeout: 4000 })
      await page.waitForTimeout(80)
      s = await snap()
      if (!visible(s)) {
        allVisible = false
        console.error(`    episódio ${i} fora da tela (topo ${s.top}, base ${s.bottom} de ${s.vh})`)
      }
      maxScroll = Math.max(maxScroll, s.pageScroll ?? 0)
    }
    assert(allVisible, 'descendo do episódio 2 ao 14, a linha focada ficou dentro da tela em todos os passos')
    assert(maxScroll > 0, `a página rolou para acompanhar o foco (rolagem máxima ${maxScroll}px)`)

    let upVisible = true
    for (let i = 13; i >= 1; i -= 1) {
      await page.keyboard.press('ArrowUp')
      await page.waitForFunction((n) => document.querySelector('.vod-episode-row.tv-focus .vod-episode-title')?.textContent === `Episodio ${n}`, i, { timeout: 4000 })
      await page.waitForTimeout(80)
      s = await snap()
      if (!visible(s)) {
        upVisible = false
        console.error(`    episódio ${i} fora da tela ao subir (topo ${s.top}, base ${s.bottom} de ${s.vh})`)
      }
    }
    assert(upVisible, 'subindo do episódio 13 ao 1, a linha focada ficou dentro da tela em todos os passos')

    for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowUp') // episódios → abas → ações
    await page.waitForFunction(() => document.querySelector('.vod-detail')?.scrollTop === 0, null, { timeout: 4000 })
    assert(((await snap()).pageScroll ?? -1) === 0, 'de volta às ações, a página volta ao topo e o hero reaparece inteiro')
    assert((await page.locator('.tv-focus').count()) >= 1, 'sempre há um elemento com foco na tela')

    // Bug `serie-sem-proximo-episodio-controles-somem`: (2) a camada do player rolava junto com a página do detalhe e o chrome
    // saía da tela; (1) o fim real do `<video>` (`pause` antes de `ended`) era descartado e não vinha a contagem do próximo.
    const overlayGeo = () =>
      page.evaluate(() => {
        const ov = document.querySelector('.player-overlay')?.getBoundingClientRect()
        const btn = document.querySelector('.player-chrome-button')?.getBoundingClientRect()
        return { overlayTop: ov ? Math.round(ov.top) : null, chromeTop: btn ? Math.round(btn.top) : null, chromeBottom: btn ? Math.round(btn.bottom) : null, vh: innerHeight }
      })
    const chromeOnScreen = (g) => g.overlayTop === 0 && g.chromeTop !== null && g.chromeTop >= 0 && g.chromeBottom <= g.vh
    const focusedControl = () => page.evaluate(() => document.querySelector('.player-chrome-button.tv-focus')?.getAttribute('aria-label') ?? '')

    console.log('=== "Próximo episódio" no player troca de episódio sem tirar o chrome da tela ===')
    await page.keyboard.press('Enter') // ação primária: episódio 1
    await page.waitForSelector('.player-video', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await setPartialProgress(page, 100, 600)
    // O chrome abre já revelado, com o foco em "Pausar" (↑ levaria o foco à barra de tempo).
    for (let i = 0; i < 8 && !/Próximo episódio/.test(await focusedControl()); i += 1) await page.keyboard.press('ArrowRight')
    assert(/Próximo episódio/.test(await focusedControl()), 'o foco chegou em "Próximo episódio" no chrome')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Reproduzindo Episodio 2"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await setPartialProgress(page, 50, 600)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(300)
    let g = await overlayGeo()
    assert(chromeOnScreen(g), `episódio 2: camada no topo e chrome dentro da tela (camada ${g.overlayTop}, chrome ${g.chromeTop}–${g.chromeBottom} de ${g.vh})`)

    console.log('=== Episódio aberto pela lista com a página rolada: chrome na tela ===')
    await page.keyboard.press('Escape') // fecha o player; foco no episódio 2 da lista
    await page.waitForSelector('.player-overlay', { state: 'detached', timeout: 8000 })
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown') // desce na lista: a página rola
    await page.waitForTimeout(300)
    const scrolledBefore = (await snap()).pageScroll ?? 0
    assert(scrolledBefore > 0, `a página do detalhe está rolada antes de abrir o episódio (${scrolledBefore}px)`)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.player-video', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await setPartialProgress(page, 50, 600)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(300)
    g = await overlayGeo()
    assert(chromeOnScreen(g), `episódio da lista: camada no topo e chrome dentro da tela (camada ${g.overlayTop}, chrome ${g.chromeTop}–${g.chromeBottom})`)

    console.log('=== Fim real do vídeo (pause antes de ended) chama a contagem do próximo ===')
    await setPartialProgress(page, 599, 600)
    await fireVideoEvent(page, 'pause')
    await fireVideoEvent(page, 'ended')
    await page.waitForSelector('[role="dialog"][aria-label="Próximo episódio"]', { timeout: 8000 })
    assert(true, 'a contagem "Próximo episódio" apareceu')
    g = await overlayGeo()
    assert(g.overlayTop === 0, `a contagem também fica presa à tela (topo ${g.overlayTop})`)
  } catch (error) {
    console.error('  ✗ ERRO NO ROTEIRO:', error)
    failures += 1
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