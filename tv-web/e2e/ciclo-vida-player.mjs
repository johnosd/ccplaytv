// Roteiro E2E da feature 020 (Ciclo de Vida do Player na TV) — gate da
// constitution v1.5.0 ("Testes E2E (Playwright) antes de validação em TV
// física").
//
// Cobre US1 (proteção de tela ligada/desligada pelo estado de reprodução) e
// US2 (ocultar o app pausa filme/fecha canal, sem áudio residual; voltar a
// ficar visível revalida sem quebrar a sessão). Como o navegador de
// desenvolvimento não tem `tizen.power` de verdade, este script injeta um
// mock ANTES da página carregar (`page.addInitScript`) — o mesmo padrão de
// feature-detect que `screenSaver.ts` já usa em produção (sem `tizen.power`,
// vira no-op; com ele, chama de verdade). Isso prova que `PlayerLayer.tsx`
// CHAMA a API certa nos momentos certos, algo que nenhum teste de contrato
// (que só espiona o módulo TypeScript, nunca um browser real) prova sozinho.
//
// Limite estrutural achado ao escrever este script (mesma família de
// limitação já documentada em `htmlVideoAdapter.ts`: "não decodifica
// conteúdo fictício"): com `autoplay` e uma URL cuja requisição de rede fica
// pendente pra sempre (`page.route` sem `fulfill`/`continue`), o `<video>`
// real NUNCA chega a tocar de verdade — `.paused` já nasce `true` e o evento
// nativo `pause` nunca dispara, então checar `.paused` não prova nada sobre
// o pause/resume real de filme aqui (ao contrário do fechamento de sessão de
// canal, que É observável via a camada some/permanece do DOM). Por isso este
// script verifica pausa de filme pela AUSÊNCIA de fechamento da camada
// (D-002 nunca fecha filme), não por `.paused` — o pause/resume de verdade
// via `togglePause()`/`adapter.resume()` já é feature 011, coberto pelos
// testes de contrato desta feature com o adaptador fake controlável.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/ciclo-vida-player.m3u`), servidos por um
// HTTP server local criado por este próprio script — nunca uma fonte real.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ciclo-vida-player.m3u')
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

  await page.getByLabel('Nome de exibição').fill('Fonte E2E Ciclo de Vida')
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

async function setVisibility(page, state) {
  await page.evaluate((visibilityState) => {
    Object.defineProperty(document, 'visibilityState', { value: visibilityState, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

async function screenSaverCalls(page) {
  return page.evaluate(() => window.__screenSaverCalls ?? [])
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
  const m3uUrl = `http://127.0.0.1:${port}/ciclo-vida-player.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  // Mock de `tizen.power` — injetado ANTES de qualquer script da página
  // carregar, pra `screenSaver.ts` (feature-detect) o encontre já pronto.
  // Nunca existe de verdade no navegador de desenvolvimento (só na TV real).
  await page.addInitScript(() => {
    window.__screenSaverCalls = []
    window.tizen = {
      power: {
        request: (resource, state) => window.__screenSaverCalls.push(['request', resource, state]),
        release: (resource) => window.__screenSaverCalls.push(['release', resource]),
      },
    }
  })

  try {
    await addSource(page, m3uUrl)
    await page.route('**/stream/**', () => {})
    await page.route('**/vod/**', () => {})

    console.log('=== Cenário A: proteção de tela liga/desliga com o estado de reprodução (US1) ===')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Filmes" (categoria única)
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre o detalhe
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    await page.keyboard.press('Enter') // "Assistir"
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    let calls = await screenSaverCalls(page)
    assert(calls.some((c) => c[0] === 'request'), 'proteção de tela desligada (tizen.power.request) ao entrar em playing')

    await page.keyboard.press('Escape') // RETURN encerra a reprodução
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    calls = await screenSaverCalls(page)
    assert(calls.some((c) => c[0] === 'release'), 'proteção de tela religada (tizen.power.release) ao encerrar a reprodução')

    console.log('=== Cenário B: ocultar o app durante um filme nunca fecha a camada (US2, D-002 ramo pausável) ===')
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    await page.keyboard.press('Enter') // reabre
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    await setVisibility(page, 'hidden')
    await page.waitForTimeout(300) // dá tempo pro handler de visibilitychange rodar
    assert(await page.locator('[role="dialog"]').isVisible(), 'a camada de player continua aberta com o app oculto (filme tem pausa real, D-002 nunca fecha)')

    console.log('=== Cenário C: voltar a ficar visível não fecha nem quebra a sessão (US2, D-003) ===')
    await setVisibility(page, 'visible')
    await page.waitForTimeout(300) // dá tempo pra revalidação (fetchPlayback local) rodar
    assert(await page.locator('[role="dialog"]').isVisible(), 'player continua aberto depois de voltar a ficar visível — revalidação bem-sucedida não fecha nem mostra erro')
    assert(!(await page.locator('text=/Não foi possível/').isVisible().catch(() => false)), 'nenhum estado de erro apareceu (o item revalidado continua válido)')

    await page.keyboard.press('Escape') // limpa a sessão de filme
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    console.log('=== Cenário D: ocultar o app com um canal ao vivo fecha a sessão (sem pausa real, D-002 ramo canal) ===')
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    await page.keyboard.press('Escape') // detalhe -> grade
    await page.waitForSelector('.poster-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('Escape') // trilha -> hub
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('Enter') // Live TV
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria de canais
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.keyboard.press('Enter') // toca o canal
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    await setVisibility(page, 'hidden')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(true, 'ocultar o app com um canal ao vivo fechou a camada de player inteira (sem pausa real disponível)')
    assert(await page.locator('.live-column-channels').isVisible(), 'voltou pra lista de canais — sem reabertura automática')
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
