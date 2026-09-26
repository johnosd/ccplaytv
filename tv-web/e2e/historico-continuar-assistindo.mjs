// Roteiro E2E da feature 019 (Histórico e Continuar Assistindo) — gate da
// constitution v1.5.0 ("Testes E2E (Playwright) antes de validação em TV
// física").
//
// Cobre os 4 cenários de `quickstart.md`: (A) filme concluído fica marcado
// como assistido automaticamente; (B) correção manual no detalhe do filme
// e a seção "Continuar assistindo" no hub (progresso parcial aparece,
// concluído sai da lista, SELECT retoma); (C) série ganha o selo "Em dia"
// na grade só depois que todos os episódios conhecidos são assistidos,
// nunca antes.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/historico-continuar-assistindo.m3u`),
// servidos por um HTTP server local criado por este próprio script — nunca
// uma fonte real. O conteúdo servido não é um vídeo decodificável de
// verdade (mesma limitação documentada em `htmlVideoAdapter.ts`) — por
// isso este script dispara o evento `ended` do <video> diretamente, que
// já é suficiente para marcar "assistido" (conclusão real do motor,
// independente de duração/posição — o cruzamento do limiar de 90% em si
// já tem teste de contrato dedicado, `progressRecorder.historico.contract.
// test.ts`, não precisa ser reprovado aqui).
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'historico-continuar-assistindo.m3u')
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

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('#add-source-title', { timeout: 8000 })

  await page.getByLabel('Nome de exibição').fill('Fonte E2E Histórico')
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()

  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
}

/** Dispara um evento do <video> ATUAL (o adaptador de dev não decodifica conteúdo fictício). */
async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

/** Conclusão real do motor — marca "assistido" e fecha a camada (filme) ou dispara o autoplay (episódio). */
async function completePlayback(page) {
  await fireVideoEvent(page, 'playing') // a máquina de estados precisa confirmar "playing" antes de aceitar "ended"
  await fireVideoEvent(page, 'ended')
}

/** Progresso parcial (acima do limiar mínimo de retomada, abaixo do de conclusão) — grava via onProgress/timeupdate. */
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
  const m3uUrl = `http://127.0.0.1:${port}/historico-continuar-assistindo.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    await addSource(page, m3uUrl)

    // As URLs de vídeo da fixture não são servidas de verdade — sem
    // interceptar, o <video> dispara seu próprio evento `error` em corrida
    // com o evento sintético `ended` deste script (mesmo padrão de
    // `busca-por-categoria.mjs`/`zapping-live-tv.mjs`). Registradas só
    // depois da primeira navegação (achado da feature 017).
    await page.route('**/vod/**', () => {})
    await page.route('**/series/**', () => {})

    console.log('=== Cenário A: filme concluído fica marcado como assistido automaticamente ===')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    // Dá tempo de `useContinueWatchingContent` (feature 019) resolver antes
    // de navegar — sem fonte com progresso ainda, fica vazio, mas a consulta
    // em voo pode competir com o keydown seguinte nesta máquina.
    await page.waitForTimeout(300)
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Filmes" (categoria única)
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.poster-card-title').first().textContent()) === 'Duna Fictício',
      'categoria "Filmes" mostra "Duna Fictício" primeiro',
    )

    await page.keyboard.press('Enter') // abre o detalhe de Duna
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    await page.keyboard.press('Enter') // ação primária "Assistir" já focada
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })

    await completePlayback(page)
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(true, 'conclusão real fechou o player e voltou ao detalhe')

    await page.waitForSelector('text=/Desmarcar assistido/', { timeout: 8000 })
    assert(true, 'o filme concluído ganhou a ação "Desmarcar assistido"')
    const actionsAfterWatch = await page.locator('.detail-button').allTextContents()
    assert(actionsAfterWatch.some((label) => label.includes('Assistir')), 'a ação primária continua "Assistir" (sem retomada)')

    console.log('=== Cenário B: correção manual + "Continuar assistindo" no hub ===')
    await page.keyboard.press('Escape') // volta pra grade de Filmes
    await page.waitForSelector('.poster-grid', { timeout: 8000 })
    await page.waitForSelector('.watched-badge', { timeout: 8000 })
    assert(true, 'a grade de Filmes mostra o selo "Assistido" em Duna')

    await page.keyboard.press('ArrowRight') // Duna -> Arrival
    await page.keyboard.press('Enter') // abre o detalhe de Arrival
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    await page.keyboard.press('Enter') // "Assistir"
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    // Progresso parcial (40s de 600s — acima do limiar mínimo de retomada,
    // longe do limiar de conclusão) — grava via updateProgress ao sair
    // pausado, mesmo mecanismo do progressRecorder de verdade.
    await setPartialProgress(page, 40, 600)
    await page.keyboard.press('Escape') // RETURN/pause fecha sem concluir
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    await page.keyboard.press('Escape') // detalhe -> grade da categoria
    await page.waitForSelector('.poster-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('Escape') // trilha -> hub da fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.waitForSelector('.continue-watching-row', { timeout: 8000 })
    assert(
      (await page.locator('.continue-watching-title').first().textContent()) === 'Arrival Fictício',
      '"Continuar assistindo" mostra Arrival com progresso parcial',
    )

    await page.keyboard.press('ArrowUp') // tiles -> "Continuar assistindo"
    await page.keyboard.press('Enter') // SELECT no item
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    assert(
      (await page.locator('.detail-button').allTextContents()).some((label) => label.includes('Retomar')),
      'abrir pelo hub retoma a posição salva (ação primária "Retomar")',
    )

    // Correção manual: marca Arrival como assistido sem reproduzir mais.
    await page.keyboard.press('ArrowRight') // Retomar -> Reiniciar
    await page.keyboard.press('ArrowRight') // Reiniciar -> toggle-watched
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=/Desmarcar assistido/', { timeout: 8000 })
    assert(true, 'correção manual marcou Arrival como assistido')

    await page.keyboard.press('Escape') // volta pro hub
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert(
      !(await page.locator('.continue-watching-row').isVisible().catch(() => false)),
      'Arrival concluído (sem progresso de retomada) some de "Continuar assistindo"',
    )

    console.log('=== Cenário C: série só fica "Em dia" com todos os episódios conhecidos assistidos ===')
    await page.keyboard.press('ArrowRight') // Filmes -> Séries
    await page.keyboard.press('ArrowRight') // Séries
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Series" (categoria única)
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    assert(
      !(await page.locator('.watched-badge').isVisible().catch(() => false)),
      'série nunca aberta não mostra nenhum selo agregado',
    )

    await page.keyboard.press('Enter') // abre o detalhe da série
    await page.waitForSelector('.episode-row', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // abas de temporada (foco inicial) -> episódios
    await page.keyboard.press('Enter') // SELECT no episódio 1
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await completePlayback(page)
    await page.waitForSelector('[role="dialog"][aria-label="Próximo episódio"]', { timeout: 8000 })
    await page.keyboard.press('Escape') // cancela o autoplay — volta à lista, foco no episódio concluído

    await page.waitForSelector('.episode-row', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // episódio 1 -> episódio 2
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await completePlayback(page)
    // Sem próximo episódio — volta direto à lista, sem countdown.
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    await page.keyboard.press('Escape') // volta pra grade de Séries
    await page.waitForSelector('.poster-grid', { timeout: 8000 })
    await page.waitForSelector('.watched-badge', { timeout: 8000 })
    assert(
      (await page.locator('.watched-badge').first().textContent()) === 'Em dia',
      'com todos os episódios conhecidos assistidos, a série mostra "Em dia"',
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
