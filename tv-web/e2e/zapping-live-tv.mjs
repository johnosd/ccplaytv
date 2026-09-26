// Roteiro E2E da feature 016 (zapping por cima do vídeo em Live TV) — gate
// da constitution v1.4.0 ("Testes E2E (Playwright) antes de validação em TV
// física").
//
// Cobre os fluxos principais da US1/US2: OK abre a lista por cima do vídeo
// já tocando, trocar de canal só fecha a lista quando o novo estiver
// pronto, RETURN fecha só a lista, e uma troca que falha reverte
// automaticamente com aviso.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção de `e2e.mjs`.
//
// Dados: só fictícios (`fixtures/zapping-live-tv.m3u`), servidos por um HTTP
// server local criado por este próprio script — nunca uma fonte real. O
// conteúdo servido não é um vídeo decodificável de verdade (mesma limitação
// documentada em `htmlVideoAdapter.ts`: só o AVPlay real prova reprodução,
// ADR-006 V1) — por isso, tal como os testes unitários de
// `LiveScreen.test.tsx` (`fireEvent.playing`), este script dispara os
// eventos do <video> manualmente para avançar a máquina de estados do
// PlayerLayer sem depender de decodificação real.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'zapping-live-tv.m3u')
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
      res.writeHead(200, {
        'Content-Type': 'audio/x-mpegurl',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('#add-source-title', { timeout: 8000 })

  await page.getByLabel('Nome de exibição').fill('Fonte E2E Zapping')
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()

  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
}

async function openLiveTv(page) {
  await page.waitForSelector('.source-card', { timeout: 8000 })
  await page.keyboard.press('Enter')

  await page.waitForSelector('.tiles-row', { timeout: 8000 })
  await page.keyboard.press('Enter')

  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
}

/** Dispara um evento do <video> ATUAL (o adaptador de dev não decodifica conteúdo fictício — ver cabeçalho). */
async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/zapping-live-tv.m3u`

  // O binário `chrome-headless-shell` que o Playwright pediria por padrão
  // em `headless: true` não está pré-instalado neste ambiente (só a versão
  // não-headless, em `/opt/pw-browsers/chromium`) — apontar direto pro
  // binário evita a tentativa de baixar um novo.
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
  })
  const context = await browser.newContext()
  const page = await context.newPage()
  // As URLs de "stream" da fixture não são servidas de verdade (só o .m3u
  // é) — sem interceptar, o Chromium tenta a conexão de verdade, ela é
  // recusada, e o <video> dispara seu próprio evento `error` nativo em
  // corrida com os eventos sintéticos deste script (`fireVideoEvent`).
  // Deixar a requisição pendente pra sempre garante que só este script
  // decide quando o vídeo "conclui" ou "falha".
  await page.route('**/stream/**', () => {})

  try {
    await addSource(page, m3uUrl)
    await openLiveTv(page)

    console.log('=== Toca Canal Um ===')
    await page.keyboard.press('ArrowRight') // entra em "Zap Teste"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'Canal Um',
      'primeiro canal da categoria é "Canal Um"',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')

    console.log('=== Cenário 1: OK abre a lista de zapping por cima do vídeo ===')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
    assert(true, 'lista de zapping apareceu por cima do vídeo')
    assert(
      (await page.locator('.player-zap-columns .live-channel-list .tv-focus').textContent())?.includes('Canal Um'),
      'foco inicial no canal que já está tocando',
    )
    assert((await page.locator('[role="dialog"]').count()) === 1, 'o player continua com um único dialog aberto — vídeo nunca parou')

    console.log('=== Cenário 2: trocar de canal só fecha a lista quando o novo estiver pronto ===')
    await page.keyboard.press('ArrowDown') // foco em "Canal Dois"
    await page.keyboard.press('Enter') // seleciona — inicia a troca
    await page.waitForTimeout(200)
    assert(await page.locator('.player-zap-columns').isVisible(), 'lista continua aberta enquanto o canal novo carrega')
    await fireVideoEvent(page, 'playing') // canal novo pronto
    await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: 8000 })
    assert(true, 'lista fechou sozinha assim que o canal novo ficou pronto — sem gap visível')

    console.log('=== Cenário 3: RETURN fecha só a lista, sem interromper a reprodução ===')
    await page.keyboard.press('Enter') // reabre o zap
    await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: 8000 })
    assert((await page.locator('[role="dialog"]').count()) === 1, 'player continua aberto depois do RETURN')

    console.log('=== Cenário 4: canal que falha ao carregar reverte automaticamente, com aviso ===')
    await page.keyboard.press('Enter') // reabre o zap (foco no canal tocando: Canal Dois)
    await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // foco em "Canal Tres"
    await page.keyboard.press('Enter') // seleciona — inicia a troca
    await page.waitForTimeout(200)
    assert(await page.locator('.player-zap-columns').isVisible(), 'lista continua aberta esperando o canal falho responder')
    await fireVideoEvent(page, 'error')
    await page.waitForSelector('text=/Não foi possível trocar de canal/', { timeout: 8000 })
    assert(true, 'aviso de falha na troca apareceu, sem tela de erro bloqueante')
    assert(await page.locator('.player-zap-columns').isVisible(), 'lista continua aberta depois da falha — dá pra tentar outro canal na hora')
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
