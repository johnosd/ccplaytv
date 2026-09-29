// Roteiro E2E da feature 027 (Player chrome do Design System V14 com
// auto-hide e teclas de mídia) — gate da constitution v1.5.1 ("Testes E2E
// (Playwright) antes de validação em TV física").
//
// Cobre os fluxos principais da spec: chrome do filme (auto-hide, mock "Em
// breve", salto com o chrome escondido), a faixa do canal (↓ troca, limite,
// OK abre o zapping, → revela a linha, RETURN em camadas), episódio
// anterior/próximo atravessando temporada, e as teclas de mídia sintéticas
// (MediaPlayPause, MediaStop, ChannelDown).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/player-chrome.m3u`), servidos por um HTTP
// server local criado por este próprio script — nunca uma fonte real. O
// conteúdo servido não é um vídeo decodificável de verdade (mesma limitação
// documentada em `htmlVideoAdapter.ts` — só o AVPlay real prova reprodução,
// ADR-006 V1), por isso este script dispara os eventos do <video>
// manualmente (mesmo padrão de `zapping-live-tv.mjs`/`historico-continuar-
// assistindo.mjs`) e teclas de mídia via `KeyboardEvent` sintético em
// `document` (Playwright não reconhece nomes como "MediaPlayPause" em
// `page.keyboard.press`).
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'player-chrome.m3u')
const APP_URL = 'http://localhost:5173'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
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

const SOURCE_NAME = 'Fonte E2E Chrome'

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
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

/** Dispara um evento do <video> ATUAL (o adaptador de dev não decodifica conteúdo fictício — ver cabeçalho). */
async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

/** Posição/duração conhecidas — grava via timeupdate, mesmo mecanismo de progresso real. */
async function setProgress(page, currentTimeSec, durationSec) {
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

async function videoCurrentTime(page) {
  return page.evaluate(() => document.querySelector('.player-video')?.currentTime ?? null)
}


/**
 * Troca de canal por tecla e confirma o novo nome na FAIXA especificamente
 * (`.player-chrome-name`, nunca `getByText` genérico — "Canal Tres" também
 * aparece em `.player-status-channel` enquanto a sessão nova ainda não
 * chegou a 'playing'). Já dispara `playing` pra sessão nova, senão
 * `.player-status` ("Preparando…") continua sobreposto à faixa.
 */
async function pressAndWaitBand(page, key, expectedName) {
  await page.keyboard.press(key)
  await page.waitForSelector(`.player-chrome-name:has-text("${expectedName}")`, { timeout: 8000 })
  await fireVideoEvent(page, 'playing')
}

/** Tecla de mídia sintética — `page.keyboard.press` não reconhece nomes como "MediaPlayPause". */
async function pressMediaKey(page, key) {
  await page.evaluate((k) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  }, key)
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) {
    return chromium.launch({ headless: true, executablePath: fixedPath })
  }
  return chromium.launch({ headless: true })
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/player-chrome.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    await addSource(page, m3uUrl)

    // As URLs de "stream" da fixture não são servidas de verdade — sem
    // interceptar, o <video> dispara seu próprio evento `error` em corrida
    // com os eventos sintéticos deste script (mesmo padrão dos demais
    // scripts em `e2e/`).
    await page.route('**/live/**', () => {})
    await page.route('**/vod/**', () => {})
    await page.route('**/series/**', () => {})

    console.log('=== Cenário 1: chrome do filme — controles, mock "Em breve", auto-hide, salto com o chrome escondido ===')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.waitForTimeout(300)
    await openViaTopbar(page, 'movies')
    await enterCategory(page, 'Filmes')
    await page.keyboard.press('Enter') // abre o detalhe
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Enter') // "Assistir" (ação primária)
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    assert(
      (await page.getByRole('button', { name: 'Pausar' }).getAttribute('class'))?.includes('tv-focus'),
      'chrome do filme abre com o foco em Play/Pause ("Pausar", tocando)',
    )
    // Feature 029: no navegador de desenvolvimento (`<video>`) não há faixas de
    // áudio (Áudio e legendas fica "— indisponível") e a Info do stream é real
    // (o elemento informa a resolução). Qualidade/Velocidade/Aspecto seguem mock.
    for (const label of [
      'Áudio e legendas — indisponível',
      'Qualidade — em breve',
      'Velocidade — em breve',
      'Aspecto — em breve',
      'Info do stream',
    ]) {
      assert(await page.getByRole('button', { name: label }).isVisible(), `controle "${label}" está na linha`)
    }
    assert(
      (await page.locator('button', { hasText: /Episódio anterior|Próximo episódio/ }).count()) === 0,
      'filme não mostra botões de episódio',
    )

    await setProgress(page, 60, 600) // duração conhecida — timeline aparece
    assert(await page.locator('.player-chrome-time-bar').isVisible(), 'timeline aparece com duração conhecida')

    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight') // playPause -> jumpForward -> tracks -> quality -> speed
    assert(
      (await page.getByRole('button', { name: 'Velocidade — em breve' }).getAttribute('class'))?.includes('tv-focus'),
      '4× → a partir de Play/Pause chega em "Velocidade"',
    )
    const timeBeforeMock = await videoCurrentTime(page)
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=/^Em breve — /', { timeout: 4000 })
    assert(true, 'selecionar o mock avisa "Em breve — …", sem abrir nada')
    assert((await videoCurrentTime(page)) === timeBeforeMock, 'nenhum salto/busca aconteceu ao selecionar o mock')

    await page.waitForTimeout(5300) // > HIDE_CONTROLS_MS (5000ms)
    assert((await page.locator('.player-chrome').count()) === 0, 'o chrome some sozinho após 5s de reprodução contínua')

    const beforeJump = await videoCurrentTime(page)
    await page.keyboard.press('ArrowLeft') // chrome escondido: ← salta ∓10s e revela
    const afterJump = await videoCurrentTime(page)
    assert(afterJump < beforeJump - 9, `← com o chrome escondido saltou 10s de volta (${beforeJump} → ${afterJump})`)
    assert((await page.locator('.player-chrome').count()) === 1, 'e revelou o chrome de novo')

    await page.keyboard.press('Escape') // fecha o player (VOD: RETURN sempre sai)
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    console.log('=== Cenário 2: faixa do canal — ↓ troca, limite, OK abre o zapping, → revela a linha, RETURN em camadas ===')
    // Sai do detalhe do filme (sem topbar, FR-004) de volta ao Início antes
    // de navegar por `openViaTopbar` — mesma sequência de RETURNs do cenário
    // B de `historico-continuar-assistindo.mjs`.
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Escape') // detalhe -> grade de Filmes
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.waitForSelector('.vod-side-nav', { timeout: 8000 })
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Canais Chrome" (única categoria real)
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.keyboard.press('Enter') // toca "Canal Um"
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    assert(await page.getByText('AO VIVO').isVisible(), 'faixa mostra o live bug "AO VIVO"')
    assert(await page.getByText('Canal Um').isVisible(), 'faixa mostra o nome do canal tocando')
    assert((await page.locator('.player-chrome button').count()) === 0, 'a faixa não tem nenhum <button>')

    await pressAndWaitBand(page, 'ArrowDown', 'Canal Dois')
    assert(true, '↓ trocou para "Canal Dois"')
    await pressAndWaitBand(page, 'ArrowDown', 'Canal Tres')
    assert(true, '↓ trocou para "Canal Tres" (último da lista)')

    await page.keyboard.press('ArrowDown') // no último — só avisa
    await page.waitForSelector('text=Este é o último canal desta lista.', { timeout: 4000 })
    assert(
      await page.locator('.player-chrome-name', { hasText: 'Canal Tres' }).isVisible(),
      'no limite, a faixa continua mostrando o mesmo canal (sem dar a volta)',
    )

    await page.keyboard.press('Enter') // OK na faixa — abre o zapping (016)
    await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
    assert(true, 'OK na faixa abriu a lista de zapping, como antes desta feature')
    await page.keyboard.press('Escape') // RETURN fecha só o zapping
    await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: 8000 })
    assert((await page.locator('[role="dialog"]').count()) === 1, 'RETURN fechou só o zapping — o player continua aberto')

    await page.keyboard.press('ArrowRight') // revela a linha
    // Rótulo acessível vem do `aria-label` (D-030), não do texto visível do
    // botão (só o ícone + rótulo curto) — `getByRole` computa o nome
    // acessível; um seletor CSS de texto não acharia nada.
    await page.getByRole('button', { name: 'Guia — em breve' }).waitFor({ timeout: 4000 })
    assert(
      (await page.getByRole('button', { name: 'Guia — em breve' }).getAttribute('class'))?.includes('tv-focus'),
      '→ na faixa revela a linha, com foco no primeiro controle ("Guia")',
    )
    assert((await page.locator('button', { hasText: /Velocidade/ }).count()) === 0, 'linha do canal nunca tem "Velocidade"')
    assert((await page.locator('button', { hasText: /Pausar|Reproduzir/ }).count()) === 0, 'linha do canal nunca tem play/pause')

    await page.keyboard.press('Escape') // RETURN na linha — só volta à faixa
    await page.waitForSelector('.player-chrome-row', { state: 'detached', timeout: 4000 })
    assert((await page.locator('[role="dialog"]').count()) === 1, 'RETURN na linha voltou só à faixa — player continua aberto')
    await page.keyboard.press('Escape') // RETURN na faixa — agora sim fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(true, 'RETURN na faixa fechou o player inteiro')

    console.log('=== Cenário 3: episódio anterior/próximo, atravessando temporada ===')
    // Saímos do RETURN-na-faixa ainda dentro da coluna de canais (col 1) do
    // Live TV — diferente do Início/grades de Filmes/Séries, lá ↑ não sobe
    // direto à topbar (precisa primeiro voltar à trilha, col 0, por ←).
    await page.keyboard.press('ArrowLeft')
    await openViaTopbar(page, 'series')
    await enterCategory(page, 'Series')
    await page.keyboard.press('Enter') // abre o detalhe da série
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    // actions -> tabs -> season -> episodes (3 setas, logic/detalhe-vod.md §6), focando o 1º episódio.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.vod-episode-row', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // episódio 1 -> episódio 2 (S01E02, último da T1)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    const subtitleBefore = await page.locator('.player-chrome-subtitle').textContent()
    // Ordem: episodePrevious(0) jumpBack(1) playPause(2) jumpForward(3)
    // episodeNext(4) … — foco começa em playPause(2); 2× → chega em episodeNext(4).
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert(
      (await page.getByRole('button', { name: 'Próximo episódio' }).getAttribute('class'))?.includes('tv-focus'),
      '2× → a partir de Play/Pause chega em "Próximo episódio"',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await page.waitForFunction(
      (before) => document.querySelector('.player-chrome-subtitle')?.textContent !== before,
      subtitleBefore,
      { timeout: 8000 },
    )
    const subtitleAfterNext = await page.locator('.player-chrome-subtitle').textContent()
    assert(
      subtitleAfterNext !== subtitleBefore,
      `"Próximo episódio" no último da T1 atravessou pra T2 (${subtitleBefore} → ${subtitleAfterNext})`,
    )

    // Nova sessão também começa focada em playPause(2); 2× ← chega em episodePrevious(0).
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    assert(
      (await page.getByRole('button', { name: 'Episódio anterior' }).getAttribute('class'))?.includes('tv-focus') &&
        !(await page.getByRole('button', { name: 'Episódio anterior' }).getAttribute('class'))?.includes('is-soft-disabled'),
      '"Episódio anterior" está disponível (T2:E1 tem antecessor em T1)',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await page.waitForFunction(
      (before) => document.querySelector('.player-chrome-subtitle')?.textContent === before,
      subtitleBefore,
      { timeout: 8000 },
    )
    assert(true, '"Episódio anterior" voltou pro episódio original (T1)')

    console.log('=== Cenário 4: teclas de mídia sintéticas (MediaPlayPause, MediaStop, ChannelDown) ===')
    // A fonte fictícia nunca chega a carregar de verdade (interceptada) — o
    // <video> real nunca sai de `paused=true` nativamente (autoplay nunca
    // chega a iniciar), então `element.pause()` real não dispara o evento
    // `pause` (já "pausado" do ponto de vista do engine: sem transição, sem
    // evento, por spec). A tecla síncrona ainda chega ao handler real e
    // chama `session.togglePause()` de verdade — só a CONFIRMAÇÃO do motor
    // é sintética aqui, mesmo padrão de `fireVideoEvent` já usado no script
    // inteiro para `playing`/`ended`.
    await pressMediaKey(page, 'MediaPlayPause')
    await fireVideoEvent(page, 'pause')
    assert(
      (await page.getByRole('button', { name: 'Reproduzir' }).getAttribute('class'))?.includes('tv-focus'),
      'MediaPlayPause pausou (confirmado) e focou "Reproduzir"',
    )
    await pressMediaKey(page, 'MediaPlayPause')
    await fireVideoEvent(page, 'playing')
    assert(
      (await page.getByRole('button', { name: 'Pausar' }).getAttribute('class'))?.includes('tv-focus'),
      'MediaPlayPause de novo retomou (confirmado) e voltou a focar "Pausar"',
    )

    await pressMediaKey(page, 'MediaStop')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(true, 'MediaStop fechou o player exatamente como RETURN')

    // Mesma sequência de RETURNs do Cenário 1 (SeriesDetailScreen também é
    // `.vod-detail`, sem topbar própria — FR-004).
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Escape') // detalhe -> grade de Séries
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.waitForSelector('.vod-side-nav', { timeout: 8000 })
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.keyboard.press('Enter') // toca "Canal Um" de novo
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await page.waitForSelector('text=Canal Um', { timeout: 8000 })

    await pressMediaKey(page, 'ChannelDown')
    await page.waitForSelector('.player-chrome-name:has-text("Canal Dois")', { timeout: 4000 })
    assert(true, 'ChannelDown trocou de canal como ↓')
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
