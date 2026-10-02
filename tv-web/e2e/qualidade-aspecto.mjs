// Roteiro E2E da feature 041 (qualidade, aspecto e preferências do player, sem
// velocidade) — gate da constitution ("Testes E2E (Playwright) antes de
// validação em TV física").
//
// Dois contextos de navegador:
//  A) `<video>` de desenvolvimento (sem `webapis`): Aspecto é REAL (object-fit),
//     Qualidade fica "— indisponível", Velocidade não existe; a aba "Player &
//     reprodução" de Configurações grava a preferência do aparelho, e um filme
//     NOVO parte dela — mesmo depois de uma escolha diferente no player
//     anterior (SC-003).
//  B) `webapis.avplay` FALSO injetado: prova o mapeamento do `avplayAdapter`
//     (qualidade por `setSelectTrack('VIDEO', i)`, aspecto por
//     `setDisplayRect`/`setDisplayMethod`), a preferência "Máxima" aplicada ao
//     abrir, e que o "Info do stream" mostra a nova resolução (A-02 do analyze).
//
// **Não prova** o AVPlay real: só a TV física (R-009: nem a troca de variante
// foi vista lá — o catálogo do usuário não tem stream multi-variante).
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173), como os
// demais scripts em `e2e/`. Dados só fictícios (`fixtures/player-chrome.m3u`),
// servidos por um HTTP server local; as URLs de "stream" nunca são abertas.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'player-chrome.m3u')
const APP_URL = 'http://localhost:5173'
const PREFS_KEY = 'ccplaytv:player-preferences'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Consulta até estabilizar (a tela atualiza num render assíncrono do React). */
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

/**
 * Roda NA PÁGINA, antes do app. AVPlay mínimo que chega a `playing` sozinho:
 * filme com 3 variantes de vídeo (1080/720/480), canal com uma só. Estado
 * observável em `window.__avplay`.
 */
function installFakeAvplay() {
  const video = (index, w, h, bps) => ({
    index,
    type: 'VIDEO',
    extra_info: JSON.stringify({ fourCC: 'H264', Width: String(w), Height: String(h), Bit_rate: String(bps) }),
  })
  const variantsFor = (url) =>
    url.includes('/live/') ? [video(0, 1280, 720, 2_000_000)] : [video(0, 1920, 1080, 5_000_000), video(1, 1280, 720, 2_500_000), video(2, 854, 480, 1_000_000)]

  const state = { calls: [], listener: null, url: '', videoIndex: 0 }
  window.__avplay = state
  window.webapis = {
    avplay: {
      open(url) {
        state.url = url
        state.videoIndex = 0
        state.calls.push('open')
      },
      close() {},
      stop() {},
      setListener(listener) {
        state.listener = listener
      },
      setDisplayRect(x, y, w, h) {
        state.calls.push(`rect:${x},${y},${w},${h}`)
      },
      setDisplayMethod(method) {
        state.calls.push(`method:${method}`)
      },
      setSilentSubtitle() {},
      prepareAsync(onSuccess) {
        setTimeout(onSuccess, 0)
      },
      play() {
        state.calls.push('play')
        setTimeout(() => state.listener?.onbufferingcomplete?.(), 0)
      },
      pause() {},
      seekTo(_ms, onOk) {
        onOk()
      },
      jumpForward(_ms, onOk) {
        onOk()
      },
      jumpBackward(_ms, onOk) {
        onOk()
      },
      getCurrentTime: () => 0,
      getDuration: () => 0,
      getTotalTrackInfo: () => variantsFor(state.url),
      getCurrentStreamInfo: () => [variantsFor(state.url)[state.videoIndex]],
      setSelectTrack(type, index) {
        state.calls.push(`select:${type}:${index}`)
        if (type === 'VIDEO') state.videoIndex = index
      },
      getStreamingProperty: () => '',
    },
  }
}

const SOURCE_NAME = 'Fonte E2E Qualidade'

async function addSource(page, m3uUrl) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: SOURCE_NAME, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: SOURCE_NAME }).waitFor({ timeout: 8000 })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function enterCategory(page, name) {
  await page.locator('.side-category-nav-item.tv-focus', { hasText: name }).waitFor({ timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

async function pressTimes(page, key, times) {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}

const isFocused = async (locator) => (await locator.getAttribute('class'))?.includes('tv-focus') ?? false

/** Abre o filme da fixture até o player (a partir do Início). */
async function playMovie(page) {
  await openViaTopbar(page, 'movies')
  await enterCategory(page, 'Filmes')
  await page.keyboard.press('Enter') // detalhe
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await page.keyboard.press('Enter') // "Assistir"
  await page.waitForSelector('.player-chrome', { state: 'attached', timeout: 8000 })
}

async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => document.querySelector('.player-video')?.dispatchEvent(new Event(eventType)), type)
}

const objectFit = (page) => page.evaluate(() => document.querySelector('.player-video')?.style.objectFit ?? null)
const avplayCalls = (page) => page.evaluate(() => [...window.__avplay.calls])

async function waitPlayingFake(page) {
  await page.waitForFunction(() => window.__avplay.calls.includes('play'), null, { timeout: 8000 })
  await page.waitForTimeout(200)
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

function watch(page) {
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })
}

/** RETURN até a tela de Início (fecha seletor, painel, Configurações…). */
async function backToHome(page) {
  for (let i = 0; i < 6; i += 1) {
    if (await page.locator('.home-content').count()) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

async function scenarioVideo(m3uUrl) {
  console.log('=== A) <video> de desenvolvimento: aspecto real, qualidade indisponível, aba de Configurações ===')
  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  watch(page)
  try {
    await addSource(page, m3uUrl)
    await page.route('**/live/**', () => {})
    await page.route('**/vod/**', () => {})
    await page.route('**/series/**', () => {})

    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.waitForTimeout(300)

    await playMovie(page)
    await fireVideoEvent(page, 'playing')
    await eventually(async () => (await objectFit(page)) === 'contain', 'filme novo começa em "Ajustar" (object-fit: contain)')
    assert((await page.locator('button', { hasText: /Velocidade/ }).count()) === 0, 'a linha não tem "Velocidade"')
    assert(await page.getByRole('button', { name: 'Qualidade — indisponível' }).isVisible(), '"Qualidade — indisponível" no <video> (o elemento não expõe variantes)')

    await pressTimes(page, 'ArrowRight', 4) // ▶⏸ → ⏩ → Áudio → Qualidade → Aspecto
    const aspectButton = page.getByRole('button', { name: 'Aspecto', exact: true })
    await eventually(() => isFocused(aspectButton), '4× → chega em "Aspecto" (real)')
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Aspecto' })
    await dialog.waitFor({ timeout: 4000 })
    const labels = await dialog.getByRole('radio').allTextContents()
    assert(labels.map((l) => l.replace(/^[●○]/, '')).join('|') === 'Ajustar|Preencher|Original|Zoom', 'o painel lista os 4 modos do <video>')
    await pressTimes(page, 'ArrowDown', 3) // Zoom
    await page.keyboard.press('Enter')
    await eventually(async () => (await objectFit(page)) === 'cover', 'escolher "Zoom" aplica object-fit: cover na hora')
    assert((await page.evaluate(() => localStorage.getItem('ccplaytv:player-preferences'))) === null, 'a escolha no player NÃO grava a preferência do aparelho')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached', timeout: 4000 })
    assert(await isFocused(aspectButton), 'RETURN fecha o painel e devolve o foco ao botão "Aspecto"')

    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('.player-overlay', { state: 'detached', timeout: 8000 })
    await backToHome(page)

    console.log('--- Configurações › Player & reprodução ---')
    await openViaTopbar(page, 'home')
    await pressTimes(page, 'ArrowRight', 6) // Início → … → Configurações
    await page.keyboard.press('Enter')
    await page.waitForSelector('.settings-screen', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // Fontes IPTV → Player & reprodução
    await eventually(
      async () => ((await page.locator('.side-category-nav-item.tv-focus').textContent()) ?? '').includes('Player & reprodução'),
      'a trilha de abas chega em "Player & reprodução"',
    )
    await page.keyboard.press('ArrowRight')
    await eventually(
      () => page.getByRole('button', { name: 'Aspecto padrão: Ajustar' }).isVisible(),
      'a aba mostra os valores de fábrica ("Aspecto padrão: Ajustar")',
    )
    assert(await page.getByRole('button', { name: 'Qualidade padrão: Auto' }).isVisible(), '"Qualidade padrão: Auto"')
    assert(await page.getByRole('button', { name: 'Legenda: Desligada' }).isVisible(), '"Legenda: Desligada"')
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: 'Aspecto padrão' }).waitFor({ timeout: 4000 })
    await page.keyboard.press('ArrowDown') // Preencher
    await page.keyboard.press('Enter')
    await eventually(() => page.getByRole('button', { name: 'Aspecto padrão: Preencher' }).isVisible(), 'o valor da linha vira "Preencher"')
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), PREFS_KEY)
    assert(saved.aspect === 'fill', 'a preferência do aparelho foi gravada (aspect: "fill")')

    await backToHome(page)
    await page.waitForTimeout(300)
    await playMovie(page)
    await fireVideoEvent(page, 'playing')
    await eventually(async () => (await objectFit(page)) === 'fill', 'o filme NOVO parte da preferência ("Preencher"), não do "Zoom" do player anterior')
  } finally {
    await browser.close()
  }
}

async function scenarioAvplay(m3uUrl) {
  console.log('=== B) AVPlay falso: qualidade, aspecto, preferências e Info do stream ===')
  const browser = await launchBrowser()
  const context = await browser.newContext()
  await context.addInitScript(installFakeAvplay)
  await context.addInitScript(
    ([key]) => localStorage.setItem(key, JSON.stringify({ aspect: 'fill', quality: 'max' })),
    [PREFS_KEY],
  )
  const page = await context.newPage()
  watch(page)
  try {
    await addSource(page, m3uUrl)
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.waitForTimeout(300)

    await playMovie(page)
    await waitPlayingFake(page)
    let calls = await avplayCalls(page)
    assert(calls.includes('method:PLAYER_DISPLAY_MODE_FULL_SCREEN'), 'a preferência "Preencher" foi aplicada ao abrir (FULL_SCREEN)')
    assert(calls.includes('select:VIDEO:0'), 'a preferência "Máxima" escolheu a maior resolução (1080p = índice 0)')

    await pressTimes(page, 'ArrowRight', 3) // ⏩ → Áudio → Qualidade
    const quality = page.getByRole('button', { name: 'Qualidade', exact: true })
    await eventually(() => isFocused(quality), '3× → chega em "Qualidade" (real: o stream anuncia 3 variantes)')
    await page.keyboard.press('Enter')
    const qualityDialog = page.getByRole('dialog', { name: 'Qualidade' })
    await qualityDialog.waitFor({ timeout: 4000 })
    const options = (await qualityDialog.getByRole('radio').allTextContents()).map((l) => l.replace(/^[●○]/, ''))
    assert(options.join('|') === 'Auto|1080p|720p|480p', `o painel lista Auto + só o que o stream anuncia (${options.join(', ')})`)
    assert((await qualityDialog.getByRole('radio', { name: '1080p' }).getAttribute('aria-checked')) === 'true', '"1080p" aparece marcada (a preferência aplicada)')
    await page.keyboard.press('ArrowDown') // 720p
    await page.keyboard.press('Enter')
    await eventually(async () => (await avplayCalls(page)).includes('select:VIDEO:1'), 'escolher "720p" chama setSelectTrack("VIDEO", 1)')
    await page.keyboard.press('Escape')
    await qualityDialog.waitFor({ state: 'detached', timeout: 4000 })

    await pressTimes(page, 'ArrowRight', 2) // Qualidade → Aspecto → Info
    const infoButton = page.getByRole('button', { name: 'Info do stream' })
    await eventually(() => isFocused(infoButton), '2× → chega em "Info do stream"')
    await page.keyboard.press('Enter')
    const info = page.getByRole('dialog', { name: 'Info do stream' })
    await info.waitFor({ timeout: 4000 })
    await eventually(async () => (await info.getByText('1280 × 720').count()) > 0, 'o Info do stream mostra a NOVA resolução (1280 × 720)')
    await page.keyboard.press('Escape')
    await info.waitFor({ state: 'detached', timeout: 4000 })

    await page.keyboard.press('ArrowLeft') // Info → Aspecto
    await page.keyboard.press('Enter')
    const aspectDialog = page.getByRole('dialog', { name: 'Aspecto' })
    await aspectDialog.waitFor({ timeout: 4000 })
    assert((await aspectDialog.getByRole('radio', { name: 'Preencher' }).getAttribute('aria-checked')) === 'true', '"Preencher" aparece marcado (a preferência aplicada)')
    await pressTimes(page, 'ArrowDown', 2) // Original → Zoom
    await page.keyboard.press('Enter')
    await eventually(async () => (await avplayCalls(page)).includes('rect:-96,-54,2112,1188'), '"Zoom" usa o retângulo 10% maior que a tela (o ROI é recusado pela TV)')
    calls = await avplayCalls(page)
    assert(calls.lastIndexOf('method:PLAYER_DISPLAY_MODE_LETTER_BOX') > calls.lastIndexOf('method:PLAYER_DISPLAY_MODE_FULL_SCREEN'), '…com o método LETTER_BOX')
    await page.keyboard.press('Escape')

    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('.player-overlay', { state: 'detached', timeout: 8000 })

    console.log('--- canal ao vivo: uma só variante ---')
    await backToHome(page)
    await openViaTopbar(page, 'live')
    await page.locator('.side-category-nav-item.tv-focus').first().waitFor({ timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria
    await page.waitForSelector('.channel-row', { timeout: 8000 })
    await page.keyboard.press('Enter') // toca o canal
    await page.waitForSelector('.player-chrome', { state: 'attached', timeout: 8000 })
    await page.waitForFunction(() => window.__avplay.url.includes('/live/'), null, { timeout: 8000 })
    await page.waitForTimeout(300)
    await pressTimes(page, 'ArrowRight', 3) // revela a linha (Guia) → Áudio → Qualidade
    const single = page.getByRole('button', { name: 'Qualidade — só uma disponível' })
    await eventually(() => isFocused(single), 'canal: "Qualidade — só uma disponível" (soft disabled, focado)')
    await page.keyboard.press('Enter')
    await page.getByText('Este stream oferece uma única qualidade.').waitFor({ timeout: 4000 })
    assert((await page.getByRole('dialog', { name: 'Qualidade' }).count()) === 0, 'e só explica — nenhum painel abre')
  } finally {
    await browser.close()
  }
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/player-chrome.m3u`
  try {
    await scenarioVideo(m3uUrl)
    await scenarioAvplay(m3uUrl)
  } finally {
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
