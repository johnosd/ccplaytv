// Roteiro E2E da feature 029 (Player: trilhas de áudio, legendas e info do
// stream) — gate da constitution v1.5.1 ("Testes E2E (Playwright) antes de
// validação em TV física").
//
// Cobre, num Chromium real: o painel "Áudio e legendas" (trocar áudio, ligar
// a legenda embutida, atraso de +500 ms, "Desativadas"), o painel "Info do
// stream" (só o que o motor informa, relido a cada ~1 s, sem URL), a
// continuidade do idioma de áudio ao trocar de canal (↓ no Live) e a
// mensagem quando o motor não informa faixas.
//
// Como o navegador não tem `webapis.avplay`, este script injeta um AVPlay
// FALSO antes da página carregar (`context.addInitScript`) — o mesmo padrão de
// `ciclo-vida-player.mjs` para `tizen.power`. Isso faz o app escolher o
// `avplayAdapter` de verdade (o caminho da TV), então o que se prova aqui é o
// mapeamento `getTotalTrackInfo`/`setSelectTrack`/`onsubtitlechange` do
// adaptador contra um motor de mentira. **Não prova** o formato real do
// AVPlay nem a legenda sobre o plano de hardware: só a TV física prova isso
// (R-001…R-004 do plan.md, SC-006 da spec).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/player-chrome.m3u`, reaproveitada da feature
// 027), servidos por um HTTP server local criado por este próprio script —
// nunca uma fonte real. As URLs de "stream" nunca são requisitadas: o AVPlay
// falso não as abre.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'player-chrome.m3u')
const APP_URL = 'http://localhost:5173'
const SOURCE_NAME = 'Fonte E2E Faixas'

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
 * Verificação de estado DEPOIS de uma tecla: o app atualiza a tela num render
 * assíncrono do React, e sob carga (a suíte completa roda vários navegadores
 * em sequência) um `assert` imediato pode enxergar o quadro anterior. Consulta
 * até estabilizar; só falha se o estado nunca chegar. Nunca use para provar
 * uma AUSÊNCIA que dependa de o app ainda não ter reagido.
 */
async function eventually(check, message, timeoutMs = 3000) {
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
 * Roda NA PÁGINA, antes de qualquer script do app. Um AVPlay mínimo que
 * chega a `playing` sozinho e responde ao que o adaptador chama. As faixas
 * dependem da URL aberta (`/live/canal-…` × o resto):
 *  - filme/série: áudio 1 "por" AC3 5.1 (padrão) e 2 "eng" AAC estéreo, texto 3 "por";
 *  - canal um: áudio 1 "por" e 2 "eng", sem legenda;
 *  - canal dois: áudio 5 "pt" e 6 "en" (outros ÍNDICES e códigos de 2 letras).
 * O estado observável fica em `window.__avplay`.
 */
function installFakeAvplay() {
  const VIDEO = { index: 0, type: 'VIDEO', extra_info: '{"fourCC":"H264","Width":"1920","Height":"1080","Bit_rate":"4000000"}' }
  const audio = (index, language, channels, fourCC) => ({
    index,
    type: 'AUDIO',
    extra_info: JSON.stringify({ language, channels: String(channels), sample_rate: '48000', bit_rate: '128000', fourCC }),
  })
  const text = (index, language) => ({
    index,
    type: 'TEXT',
    extra_info: JSON.stringify({ track_num: '0', track_lang: language, subtitle_type: '0', fourCC: 'SRT' }),
  })

  function tracksFor(url) {
    if (url.includes('canal-dois')) return [VIDEO, audio(5, 'pt', 2, 'AAC'), audio(6, 'en', 2, 'AAC')]
    if (url.includes('/live/')) return [VIDEO, audio(1, 'por', 2, 'AAC'), audio(2, 'eng', 2, 'AAC')]
    return [VIDEO, audio(1, 'por', 6, 'AC3'), audio(2, 'eng', 2, 'AAC'), text(3, 'por')]
  }
  const firstAudio = (tracks) => tracks.find((t) => t.type === 'AUDIO').index

  const state = {
    calls: [],
    listener: null,
    url: '',
    audioIndex: 0,
    textIndex: null,
    bandwidth: '4000000',
    failTracks: false,
  }
  window.__avplay = state

  window.webapis = {
    avplay: {
      open(url) {
        state.url = url
        state.audioIndex = firstAudio(tracksFor(url))
        state.textIndex = null
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
      setSilentSubtitle(silent) {
        state.calls.push(`silent:${silent}`)
      },
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
      getCurrentTime() {
        return 0
      },
      getDuration() {
        return 0
      },
      getTotalTrackInfo() {
        if (state.failTracks) throw new Error('sem faixas')
        return tracksFor(state.url)
      },
      getCurrentStreamInfo() {
        const tracks = tracksFor(state.url)
        return [tracks[0], tracks.find((t) => t.type === 'AUDIO' && t.index === state.audioIndex)].filter(Boolean)
      },
      setSelectTrack(type, index) {
        state.calls.push(`select:${type}:${index}`)
        if (type === 'AUDIO') state.audioIndex = index
        else state.textIndex = index
      },
      getStreamingProperty(name) {
        return name === 'CURRENT_BANDWIDTH' ? state.bandwidth : ''
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

  await page.getByLabel('Nome de exibição').fill(SOURCE_NAME)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()

  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: SOURCE_NAME }).waitFor({ timeout: 8000 })
}

/** Do Início, abre TV ao vivo/Filmes/Séries pela topbar (mesmo helper dos demais scripts em e2e/). */
async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Entra na categoria `name` de Filmes/Séries (grade real do trilho já em foco). */
async function enterCategory(page, name) {
  await page.locator('.side-category-nav-item.tv-focus', { hasText: name }).waitFor({ timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

async function pressTimes(page, key, times) {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}

const avplayCalls = (page) => page.evaluate(() => [...window.__avplay.calls])

/** Espera o AVPlay falso ter chegado a `playing` (o adaptador só reporta depois de `play()`). */
async function waitPlaying(page) {
  await page.waitForFunction(() => window.__avplay.calls.includes('play'), null, { timeout: 8000 })
  await page.waitForTimeout(150)
}

/** O motor entrega uma linha de legenda embutida (`onsubtitlechange`). */
async function emitSubtitle(page, durationMs, text) {
  await page.evaluate(
    ([d, t]) => window.__avplay.listener.onsubtitlechange(String(d), t, '0', []),
    [durationMs, text],
  )
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) {
    return chromium.launch({ headless: true, executablePath: fixedPath })
  }
  return chromium.launch({ headless: true })
}

const tracksDialog = (page) => page.getByRole('dialog', { name: 'Áudio e legendas' })
const isFocused = async (locator) => (await locator.getAttribute('class'))?.includes('tv-focus') ?? false

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/player-chrome.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  await context.addInitScript(installFakeAvplay)
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    await addSource(page, m3uUrl)

    console.log('=== Cenário 1: filme — painel de faixas, troca de áudio, RETURN devolve o foco ===')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.waitForTimeout(300)
    await openViaTopbar(page, 'movies')
    await enterCategory(page, 'Filmes')
    await page.keyboard.press('Enter') // detalhe
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Enter') // "Assistir"
    // `attached`, não visível: `.player-chrome` é só um contêiner sem tamanho
    // (os filhos são absolutos), que o Playwright trata como "hidden".
    await page.waitForSelector('.player-chrome', { state: 'attached', timeout: 8000 })
    await waitPlaying(page)
    assert((await avplayCalls(page)).includes('silent:true'), 'o adaptador silenciou a legenda ao abrir (D-005)')

    await pressTimes(page, 'ArrowRight', 2) // ▶⏸ → ⏩ → "Áudio e legendas"
    const tracksButton = page.getByRole('button', { name: 'Áudio e legendas' })
    await eventually(() => isFocused(tracksButton), '2× → de Play/Pause chega em "Áudio e legendas" (botão real, não "em breve")')
    await page.keyboard.press('Enter')
    await tracksDialog(page).waitFor({ timeout: 4000 })

    const audioGroup = tracksDialog(page).getByRole('radiogroup', { name: 'Áudio' })
    const pt = audioGroup.getByRole('radio', { name: /^Português/ })
    const en = audioGroup.getByRole('radio', { name: /^Inglês/ })
    assert((await pt.getAttribute('aria-checked')) === 'true', 'painel marca o áudio ativo ("Português • AC3 • 5.1")')
    assert((await pt.textContent())?.includes('AC3') && (await pt.textContent())?.includes('5.1'), 'rótulo traz codec e canais que o motor informou')
    assert(await isFocused(pt), 'foco inicial do painel na faixa de áudio ativa')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter') // "Inglês"
    assert((await avplayCalls(page)).includes('select:AUDIO:2'), 'SELECT em "Inglês" chamou setSelectTrack("AUDIO", 2)')
    await eventually(async () => (await en.getAttribute('aria-checked')) === 'true', 'a marcação seguiu o motor (Inglês marcado)')
    await eventually(async () => (await pt.getAttribute('aria-checked')) === 'false', 'Português desmarcado')
    assert((await page.locator('.player-video').count()) === 0, 'trocar o áudio não recriou nada (sem <video>: o AVPlay é o motor)')

    await page.keyboard.press('Escape') // RETURN fecha só o painel
    await tracksDialog(page).waitFor({ state: 'detached', timeout: 4000 })
    assert((await page.locator('.player-chrome').count()) === 1, 'RETURN fechou o painel e o player continua aberto')
    await eventually(() => isFocused(tracksButton), 'o foco voltou ao botão "Áudio e legendas"')

    console.log('=== Cenário 2: legenda embutida — ligar, atrasar +500 ms, desativar ===')
    await page.keyboard.press('Enter')
    await tracksDialog(page).waitFor({ timeout: 4000 })
    await emitSubtitle(page, 3000, 'Linha antes de ligar')
    assert((await page.getByText('Linha antes de ligar').count()) === 0, 'com a legenda desativada a linha do motor não aparece')

    await pressTimes(page, 'ArrowDown', 3) // de "Inglês": áudio-descrição → Desativadas → "Português" (legenda)
    await page.keyboard.press('Enter')
    let calls = await avplayCalls(page)
    assert(calls.includes('select:TEXT:3') && calls.lastIndexOf('silent:false') > calls.indexOf('select:TEXT:3'), 'ligar a legenda: setSelectTrack("TEXT", 3) e só depois setSilentSubtitle(false)')
    await emitSubtitle(page, 5000, 'Olá, mundo')
    await eventually(() => page.getByText('Olá, mundo').isVisible(), 'a linha do motor aparece sobre o vídeo, desenhada pelo app')

    await page.keyboard.press('ArrowDown') // −1000 ms
    await page.keyboard.press('Enter')
    await page.getByText('Adiantar a legenda não é possível para legendas embutidas.').waitFor({ timeout: 4000 })
    assert(true, '−1000 ms é soft disabled e explica (o AVPlay não adianta legenda embutida, D-006)')

    await pressTimes(page, 'ArrowDown', 3) // −500 → Sem atraso → +500
    await page.keyboard.press('Enter')
    const plus500 = tracksDialog(page).getByRole('radio', { name: '+500 ms' })
    await eventually(async () => (await plus500.getAttribute('aria-checked')) === 'true', '"+500 ms" ficou marcado')

    await emitSubtitle(page, 4000, 'Linha atrasada')
    assert((await page.getByText('Linha atrasada').count()) === 0, 'com +500 ms a linha NÃO aparece no mesmo instante')
    await page.getByText('Linha atrasada').waitFor({ timeout: 2000 })
    assert(true, '…e aparece depois do atraso')

    await pressTimes(page, 'ArrowUp', 5) // +500 → 0 → −500 → −1000 → legenda "Português" → "Desativadas"
    await page.keyboard.press('Enter')
    calls = await avplayCalls(page)
    assert(calls.lastIndexOf('silent:true') > calls.lastIndexOf('silent:false'), '"Desativadas" silenciou a legenda de novo')
    await eventually(async () => (await page.getByText('Linha atrasada').count()) === 0, 'e a linha na tela sumiu na hora')
    await page.keyboard.press('Escape')
    await tracksDialog(page).waitFor({ state: 'detached', timeout: 4000 })

    console.log('=== Cenário 3: info do stream — só o que o motor informa, relida a cada ~1 s ===')
    await pressTimes(page, 'ArrowRight', 4) // "Áudio e legendas" → Qualidade → Velocidade → Aspecto → "Info do stream"
    const infoButton = page.getByRole('button', { name: 'Info do stream' })
    await eventually(() => isFocused(infoButton), '4× → chega em "Info do stream" (botão real)')
    await page.keyboard.press('Enter')
    const infoDialog = page.getByRole('dialog', { name: 'Info do stream' })
    await infoDialog.waitFor({ timeout: 4000 })
    assert(await infoDialog.getByText('1920 × 1080').isVisible(), 'mostra a resolução informada pelo motor')
    assert(await infoDialog.getByText('H264').isVisible(), 'mostra o codec informado')
    assert(await infoDialog.getByText('4,0 Mbps').isVisible(), 'mostra a taxa de bits (bits/s do motor → Mbps, vírgula decimal)')
    assert(await infoDialog.getByText('Online').isVisible(), 'mostra o estado de conexão')
    for (const absent of ['Quadros por segundo', 'Buffer', 'Protocolo']) {
      assert((await infoDialog.getByText(absent).count()) === 0, `sem "${absent}": o motor não informa, então a linha não existe`)
    }
    assert(!(await page.locator('body').textContent())?.includes('chrome-e2e.test'), 'nenhuma URL/host do stream aparece na tela (FR-018)')

    await page.evaluate(() => {
      window.__avplay.bandwidth = '5000000'
    })
    await infoDialog.getByText('5,0 Mbps').waitFor({ timeout: 3000 })
    assert(true, 'a taxa se atualiza sozinha em ~1 s enquanto o painel está aberto')

    assert(await isFocused(infoDialog.getByRole('button', { name: 'Fechar' })), '"Fechar" é o foco do painel')
    await page.keyboard.press('Enter')
    await infoDialog.waitFor({ state: 'detached', timeout: 4000 })
    await eventually(() => isFocused(infoButton), '"Fechar" devolveu o foco ao botão "Info do stream"')

    await page.keyboard.press('Escape') // VOD: RETURN sem painel fecha o player
    await page.waitForSelector('.player-chrome', { state: 'detached', timeout: 8000 })

    console.log('=== Cenário 4: canal ao vivo — o idioma de áudio escolhido segue no ↓ ===')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Escape') // detalhe -> grade de Filmes
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.waitForSelector('.vod-side-nav', { timeout: 8000 })
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Canais Chrome"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    // Histórico limpo: as asserções abaixo só valem se a chamada ao motor for
    // DESTE cenário, não sobra do filme (o `select:AUDIO:2` do canal um é o mesmo).
    await page.evaluate(() => {
      window.__avplay.calls.length = 0
    })
    await page.keyboard.press('Enter') // toca "Canal Um"
    await page.waitForSelector('.player-chrome-name:has-text("Canal Um")', { timeout: 8000 })
    await waitPlaying(page)

    await pressTimes(page, 'ArrowRight', 2) // faixa → linha (Guia) → "Áudio e legendas"
    await eventually(() => isFocused(page.getByRole('button', { name: 'Áudio e legendas' })), 'Live: a linha tem "Áudio e legendas" real')
    await page.keyboard.press('Enter')
    await tracksDialog(page).waitFor({ timeout: 4000 })
    assert((await tracksDialog(page).getByText('Nenhuma legenda neste conteúdo').count()) === 1, 'canal sem legenda: o painel diz "Nenhuma legenda neste conteúdo"')
    await page.keyboard.press('ArrowDown') // "Inglês" (índice 2 no canal um)
    await page.keyboard.press('Enter')
    assert((await avplayCalls(page)).includes('select:AUDIO:2'), 'trocou para o áudio em inglês no canal um')
    await page.keyboard.press('Escape') // fecha o painel
    await tracksDialog(page).waitFor({ state: 'detached', timeout: 4000 })
    await page.keyboard.press('Escape') // linha → faixa
    await page.waitForSelector('.player-chrome-row', { state: 'detached', timeout: 4000 })

    await page.keyboard.press('ArrowDown') // próximo canal: "Canal Dois" (áudio 5 "pt", 6 "en")
    await page.waitForSelector('.player-chrome-name:has-text("Canal Dois")', { timeout: 8000 })
    await page.waitForFunction(() => window.__avplay.calls.includes('select:AUDIO:6'), null, { timeout: 4000 })
    assert(true, 'no "Canal Dois" o inglês foi reaplicado por IDIOMA (índice 6, código "en"), sem nova escolha')
    assert((await page.getByText(/Não foi possível/).count()) === 0, 'a reaplicação não gerou nenhum aviso')

    console.log('=== Cenário 5: motor que não informa as faixas — o botão explica em vez de abrir vazio ===')
    await page.evaluate(() => {
      window.__avplay.failTracks = true
    })
    await pressTimes(page, 'ArrowRight', 2)
    await page.keyboard.press('Enter')
    await page.getByText('Este aparelho não informou as faixas deste conteúdo.').waitFor({ timeout: 4000 })
    assert((await tracksDialog(page).count()) === 0, 'sem faixas informadas nenhum painel vazio abre (FR-002)')
    assert((await page.locator('.player-chrome-row button').count()) > 0, 'e a linha de controles continua com foco (sem beco sem saída)')
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
