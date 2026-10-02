// Roteiro E2E da feature 042 (Rede, lifecycle e erros acionáveis) — gate da
// constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre, num Chromium real: a reconexão automática do stream (≤ 3 tentativas)
// e a tela de erro com código + "Info técnica" sem segredo; o banner de offline
// com "Tentar de novo" ALCANÇÁVEL pelo teclado (item da topbar); e o app
// oculto → voltando sem rede o filme continua pausado até a rede voltar.
//
// Como o navegador não tem `webapis.avplay`, este script injeta um AVPlay
// FALSO antes da página carregar (mesmo padrão de `audio-legendas-info.mjs`),
// com um gancho (`window.__avplay.fail()`) para derrubar o stream. Isso prova
// o mapeamento do adaptador e a orquestração do app — **não** os nomes reais de
// erro do AVPlay nem uma queda de rede na TV (R-001/R-008 do plan.md): só a TV
// física prova isso.
//
// Pré-requisito: `npm run dev` já rodando em http://localhost:5173.
// Dados: só fictícios (`fixtures/player-chrome.m3u`), servidos por um HTTP
// server local deste script. As URLs de "stream" nunca são requisitadas.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'player-chrome.m3u')
const APP_URL = 'http://localhost:5173'
const SOURCE_NAME = 'Fonte E2E Rede'
const STREAM_HOST = 'chrome-e2e.test'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function eventually(check, message, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  let ok = false
  while (Date.now() < deadline) {
    try {
      ok = Boolean(await check())
    } catch {
      ok = false
    }
    if (ok) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert(ok, message)
}

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

/** Roda NA PÁGINA, antes de qualquer script do app: um AVPlay mínimo que chega a `playing` sozinho e que o script derruba. */
function installFakeAvplay() {
  const state = { calls: [], opens: 0, listener: null, url: '' }
  window.__avplay = state
  state.fail = (name) => state.listener?.onerror?.(name ?? 'PLAYER_ERROR_CONNECTION_FAILED')
  window.webapis = {
    avplay: {
      open(url) {
        state.url = url
        state.opens += 1
        state.calls.push('open')
      },
      close() {
        state.calls.push('close')
      },
      stop() {},
      setListener(listener) {
        state.listener = listener
      },
      setDisplayRect() {},
      setDisplayMethod() {},
      setSilentSubtitle() {},
      prepareAsync(onSuccess) {
        setTimeout(onSuccess, 0)
      },
      play() {
        state.calls.push('play')
        setTimeout(() => state.listener?.onbufferingcomplete?.(), 0)
      },
      pause() {
        state.calls.push('pause')
      },
      seekTo(_ms, onOk) {
        onOk()
      },
      jumpForward(_ms, onOk) {
        onOk()
      },
      jumpBackward(_ms, onOk) {
        onOk()
      },
      getCurrentTime() {
        return 42000
      },
      getDuration() {
        return 600000
      },
      getTotalTrackInfo() {
        return []
      },
      getCurrentStreamInfo() {
        return []
      },
      setSelectTrack() {},
      getStreamingProperty() {
        return ''
      },
    },
  }
}

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: SOURCE_NAME, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: SOURCE_NAME }).waitFor({ timeout: 8000 })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function enterCategory(page, name) {
  await page.locator('.side-category-nav-item.tv-focus', { hasText: name }).waitFor({ timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

const avplay = (page) => page.evaluate(() => ({ calls: [...window.__avplay.calls], opens: window.__avplay.opens }))

async function waitPlaying(page, minOpens = 1) {
  await page.waitForFunction((n) => window.__avplay.opens >= n && window.__avplay.calls.includes('play'), minOpens, { timeout: 12000 })
  await page.waitForTimeout(200)
}

async function setVisibility(page, state) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

/** O Playwright não conhece teclas de mídia: entrega o evento como o app as recebe (event.key). */
async function pressMedia(page, key) {
  await page.evaluate((k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), key)
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function openMovie(page) {
  await page.waitForSelector('.source-card', { timeout: 8000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await page.waitForTimeout(300)
  await openViaTopbar(page, 'movies')
  await enterCategory(page, 'Filmes')
  await page.keyboard.press('Enter') // detalhe
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await page.keyboard.press('Enter') // "Assistir"
  await page.waitForSelector('.player-chrome', { state: 'attached', timeout: 8000 })
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/player-chrome.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  await context.addInitScript(installFakeAvplay)
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    await addSource(page, m3uUrl)

    console.log('=== Cenário 1: o filme cai — reconecta sozinho (≤ 3), depois erro com código e Info técnica ===')
    await openMovie(page)
    await waitPlaying(page, 1)
    await page.evaluate(() => window.__avplay.fail())
    await page.getByText(/Reconectando/).waitFor({ timeout: 4000 })
    assert(true, 'aparece "Reconectando… (tentativa 1 de 3)" em vez de um erro imediato')
    assert((await page.getByRole('button', { name: 'Tentar de novo' }).count()) === 0, 'durante a espera não há botão de erro')

    for (const opens of [2, 3, 4]) {
      await page.waitForFunction((n) => window.__avplay.opens >= n, opens, { timeout: 15000 })
      await page.evaluate(() => window.__avplay.fail())
    }
    await page.getByRole('button', { name: 'Tentar de novo' }).waitFor({ timeout: 6000 })
    const { opens: finalOpens } = await avplay(page)
    assert(finalOpens === 4, `foram 1 abertura + 3 reconexões, e nenhuma a mais (${finalOpens} aberturas)`)
    assert((await page.getByTestId('player-error-code').textContent()) === 'PLAY-01', 'o erro mostra o código discreto PLAY-01 (rede)')
    assert(await page.getByRole('button', { name: 'Tentar de novo' }).evaluate((el) => el.classList.contains('tv-focus')), '"Tentar de novo" é a ação primária e vem focada')

    await page.keyboard.press('ArrowRight') // Info técnica
    await page.keyboard.press('Enter')
    const info = page.getByRole('dialog', { name: 'Info técnica do erro' })
    await info.waitFor({ timeout: 4000 })
    const html = await page.evaluate(() => document.body.innerHTML)
    assert((await info.locator('dt').count()) === 5, 'a Info técnica mostra exatamente 5 campos')
    assert(!html.includes(STREAM_HOST) && !html.includes('usuario') && !html.includes('senha'), 'nem a tela de erro nem a Info técnica carregam URL, host ou credencial')

    await page.keyboard.press('Escape')
    await info.waitFor({ state: 'detached', timeout: 4000 })
    assert((await page.locator('.player-overlay').count()) === 1, 'RETURN fecha só o painel; o player segue na tela de erro')
    await page.keyboard.press('Escape')
    await page.locator('.player-overlay').waitFor({ state: 'detached', timeout: 4000 })
    assert(true, 'o segundo RETURN fecha o player')

    console.log('=== Cenário 2: sem conexão — "Tentar de novo" alcançável pelo teclado ===')
    await page.waitForSelector('.vod-detail', { timeout: 6000 })
    await page.keyboard.press('Escape') // detalhe → grade de Filmes (que tem a topbar)
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.getByRole('button', { name: 'Início' }).click() // da grade, o caminho mais curto até o Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await context.setOffline(true)
    await page.getByText('Sem conexão com a internet.').waitFor({ timeout: 4000 })
    assert((await page.locator('.offline-banner button').count()) === 0, 'o banner offline é só texto, sem botão (a TV não alcançaria um botão ali)')

    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight')
    await eventually(
      () => page.getByRole('button', { name: /Tentar de novo/ }).evaluate((el) => el.classList.contains('tv-focus')),
      'RIGHT na topbar chega em "Tentar de novo" (o último item) e ele ganha foco',
    )
    await page.keyboard.press('Enter')
    await page.getByText(/Ainda sem conexão/).waitFor({ timeout: 4000 })
    assert(true, 'OK com a rede ainda fora: o banner diz "Ainda sem conexão" e o foco fica')

    await context.setOffline(false)
    await page.getByText(/Ainda sem conexão|Sem conexão com a internet/).waitFor({ state: 'detached', timeout: 4000 })
    assert((await page.getByRole('button', { name: /Tentar de novo/ }).count()) === 0, 'com a rede de volta o banner e o item somem')
    await eventually(
      () => page.locator('.topbar .tv-focus').first().evaluate((el) => (el.textContent ?? '').includes('Início')),
      'o foco caiu em "Início" — nunca num item que sumiu',
    )

    console.log('=== Cenário 3: oculto → voltando sem rede o filme continua pausado ===')
    await page.keyboard.press('ArrowDown')
    await openViaTopbar(page, 'movies')
    await enterCategory(page, 'Filmes')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.player-chrome', { state: 'attached', timeout: 8000 })
    const before = await avplay(page)
    await waitPlaying(page, before.opens)

    await setVisibility(page, 'hidden')
    await eventually(async () => (await avplay(page)).calls.includes('pause'), 'ocultar o app pausou o filme')
    await page.waitForTimeout(300)
    await context.setOffline(true)
    const playsBefore = (await avplay(page)).calls.filter((c) => c === 'play').length
    await setVisibility(page, 'visible')
    await page.getByText('Sem conexão. O filme continua pausado.').waitFor({ timeout: 5000 })
    assert(true, 'voltando sem rede aparece o aviso e o botão "Tentar de novo"')
    await pressMedia(page, 'MediaPlay')
    await page.waitForTimeout(400)
    assert((await avplay(page)).calls.filter((c) => c === 'play').length === playsBefore, 'MediaPlay NÃO retoma enquanto a rede não voltou')

    await context.setOffline(false)
    await page.keyboard.press('Enter') // OK no botão do aviso: repete a verificação
    await page.getByText('Sem conexão. O filme continua pausado.').waitFor({ state: 'detached', timeout: 5000 })
    assert(true, 'com a rede de volta, OK no aviso libera o play')
    await pressMedia(page, 'MediaPlay')
    await eventually(
      async () => (await avplay(page)).calls.filter((c) => c === 'play').length > playsBefore,
      'agora MediaPlay retoma o filme',
    )
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
