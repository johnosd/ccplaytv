// Roteiro E2E da feature 036 (Limpar histórico e remover item do Histórico).
//
// Cobre `quickstart.md`: (A) tecla vermelha na grade do "↺ Histórico" tira o
// título, foca o vizinho e mantém a retomada em "Continuar assistindo", com a
// dica "● Remover do histórico" aparecendo porque a tecla foi registrada; (B)
// "Remover do histórico" no detalhe, com "apagar progresso", tira o título de
// Continuar e volta à grade vazia com foco no "Voltar"; (C) Configurações ›
// Privacidade: linha vazia soft disabled, e limpar "Filmes e Séries" com
// "apagar progresso" esvazia Continuar.
//
// A tecla vermelha não existe no navegador: o app só a registra (e só mostra
// a dica) com `tizen.tvinputdevice` confirmando que ela é suportada (D-007),
// então este script injeta um `tizen.tvinputdevice` FALSO por
// `addInitScript` (mesmo padrão do `tizen.power` de `ciclo-vida-player.mjs`)
// e entrega a tecla por um `KeyboardEvent` sintético com `key: 'ColorF0Red'`.
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173). Dados só
// fictícios (`fixtures/historico-continuar-assistindo.m3u`), servidos por um
// HTTP local criado aqui.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'historico-continuar-assistindo.m3u')
const APP_URL = 'http://localhost:5173'
const SOURCE_NAME = 'Fonte E2E Limpar Histórico'
const CONTINUE_ROW = 'section.home-row[aria-label="Continuar assistindo"]'

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

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

/** Topbar: sobe, volta a "Início" e conta as setas até o destino (mesmo padrão dos outros roteiros). */
async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series', 'profile', 'search', 'settings']
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

/**
 * Da 1ª categoria focada na trilha (4ª entrada: ★ Favoritos, ↺ Histórico,
 * Todos, categorias), sobe até "↺ Histórico" e entra. Nunca ↑ de sobra: no
 * 1º item da trilha, ↑ vai para a topbar.
 */
async function enterHistoryFromTrail(page) {
  await page.keyboard.press('ArrowUp') // "Todos"
  await page.keyboard.press('ArrowUp') // "↺ Histórico"
  await page.locator('.side-category-nav-item.tv-focus', { hasText: 'Histórico' }).waitFor({ timeout: 4000 })
  await page.keyboard.press('ArrowRight')
}

async function pressRed(page) {
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ColorF0Red', bubbles: true })))
}

async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => document.querySelector('.player-video')?.dispatchEvent(new Event(eventType)), type)
}

/** Reproduz e sai com progresso parcial (40 s de 600 s): entra no Histórico e em Continuar. */
async function watchPartially(page) {
  await page.keyboard.press('Enter') // ação primária
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await fireVideoEvent(page, 'playing')
  await page.evaluate(() => {
    const video = document.querySelector('.player-video')
    if (!video) return
    Object.defineProperty(video, 'duration', { value: 600, configurable: true })
    video.currentTime = 40
    video.dispatchEvent(new Event('timeupdate'))
  })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
}

const gridTitles = (page) => page.locator('.vod-grid .content-card-title').allTextContents()
const focusedCardTitle = (page) =>
  page.evaluate(() => {
    const cell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
    return cell?.querySelector('.content-card-title')?.textContent ?? null
  })

async function continueTitles(page) {
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await page.waitForTimeout(400) // a rail relê depois da invalidação
  return page.locator(`${CONTINUE_ROW} .content-card-title`).allTextContents()
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/historico-continuar-assistindo.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  // `tizen.tvinputdevice` falso: só a vermelha e a amarela "suportadas".
  await context.addInitScript(() => {
    window.__registeredKeys = []
    window.tizen = {
      tvinputdevice: {
        getSupportedKeys: () => [
          { name: 'ColorF0Red', code: 403 },
          { name: 'ColorF2Yellow', code: 405 },
        ],
        registerKey: (name) => window.__registeredKeys.push(name),
      },
    }
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    console.log('=== Preparação: lista fictícia e progresso em dois filmes e um episódio ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await cadastrarListaM3u(page, { nome: SOURCE_NAME, url: m3uUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: SOURCE_NAME }).waitFor({ timeout: 8000 })
    await page.route('**/vod/**', () => {})
    await page.route('**/series/**', () => {})
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert(
      (await page.evaluate(() => window.__registeredKeys)).includes('ColorF0Red'),
      'a tecla vermelha foi registrada (getSupportedKeys a lista)',
    )

    await openViaTopbar(page, 'movies')
    await enterCategory(page, 'Filmes')
    await page.keyboard.press('Enter') // Duna
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await watchPartially(page)
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // Arrival
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await watchPartially(page) // Arrival por último = 1º do Histórico
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-grid', { timeout: 8000 })

    console.log('=== Cenário A: tecla vermelha na grade do ↺ Histórico ===')
    await page.keyboard.press('Escape') // grade -> trilha
    await enterHistoryFromTrail(page)
    await page.waitForFunction(() => document.querySelectorAll('.vod-grid .content-card-title').length === 2, null, { timeout: 8000 })
    assert((await gridTitles(page)).join('|') === 'Arrival Fictício|Duna Fictício', 'Histórico: Arrival (mais recente) e Duna')
    assert((await page.locator('.fav-hint', { hasText: '● Remover do histórico' }).count()) === 1, 'dica "● Remover do histórico" visível com a tecla registrada')

    const dialog = page.getByRole('dialog', { name: 'Remover "Arrival Fictício" do histórico?' })
    await pressRed(page)
    await dialog.waitFor({ timeout: 5000 })
    await page.keyboard.press('Escape') // RETURN = Cancelar (FR-010)
    await dialog.waitFor({ state: 'detached', timeout: 5000 })
    assert(
      (await gridTitles(page)).length === 2 && (await focusedCardTitle(page)) === 'Arrival Fictício',
      'RETURN fecha a confirmação sem remover, foco no mesmo título',
    )

    await page.waitForTimeout(450) // debounce da tecla vermelha (400 ms, FR-021)
    await pressRed(page)
    await dialog.waitFor({ timeout: 5000 })
    assert((await dialog.locator('.tv-focus').textContent())?.trim() === 'Cancelar', 'a confirmação abre com "Cancelar" focado')
    assert((await dialog.getByRole('button').allTextContents()).length === 3, 'com retomada, a confirmação tem as três ações')
    await page.keyboard.press('ArrowRight') // "Remover do histórico"
    const startedAt = Date.now()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.vod-grid .content-card-title').length === 1, null, { timeout: 5000 })
    const elapsed = Date.now() - startedAt
    assert((await gridTitles(page)).join('|') === 'Duna Fictício', 'Arrival saiu da grade do Histórico')
    assert((await focusedCardTitle(page)) === 'Duna Fictício', 'o foco foi para o vizinho (Duna)')
    console.log(`  · SC-003: confirmação → grade atualizada em ${elapsed} ms`)
    assert(elapsed <= 1000, 'a remoção aparece na grade em até 1 s (SC-003)')

    console.log('=== Cenário B: "Remover do histórico" no detalhe, apagando o progresso ===')
    await page.keyboard.press('Enter') // detalhe de Duna
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    const actions = await page.locator('.vod-detail-action').allTextContents()
    assert(actions.at(-1) === 'Remover do histórico', 'no detalhe, "Remover do histórico" é a última ação')
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    const detailDialog = page.getByRole('dialog', { name: 'Remover "Duna Fictício" do histórico?' })
    await detailDialog.waitFor({ timeout: 5000 })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // "Remover e apagar progresso"
    await page.keyboard.press('Enter')
    await detailDialog.waitFor({ state: 'detached', timeout: 5000 })
    await page.waitForFunction(
      () => ![...document.querySelectorAll('.vod-detail-action')].some((el) => el.textContent === 'Remover do histórico'),
      null,
      { timeout: 5000 },
    )
    assert(true, 'a ação sumiu do detalhe depois de remover')
    await page.keyboard.press('Escape') // volta à grade do Histórico
    await page.getByText('Seu histórico está vazio').waitFor({ timeout: 8000 })
    assert((await page.getByRole('button', { name: 'Voltar' }).getAttribute('class'))?.includes('tv-focus'), 'grade vazia com "Voltar" focado')

    await page.keyboard.press('Enter') // "Voltar" -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    const afterMovies = await continueTitles(page)
    assert(afterMovies.includes('Arrival Fictício'), '"Remover do histórico" manteve Arrival em Continuar assistindo')
    assert(!afterMovies.includes('Duna Fictício'), '"Remover e apagar progresso" tirou Duna de Continuar assistindo')

    console.log('=== Cenário C: Configurações › Privacidade ===')
    await openViaTopbar(page, 'series')
    await enterCategory(page, 'Series')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await watchPartially(page) // um episódio no Histórico
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    await openViaTopbar(page, 'settings')
    await page.waitForSelector('.settings-screen', { timeout: 8000 })
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown') // Fontes IPTV -> Privacidade
    assert((await page.locator('.side-category-nav-item.tv-focus').textContent())?.includes('Privacidade'), 'aba "Privacidade" antes de "Sobre & créditos"')
    await page.keyboard.press('ArrowRight')
    const moviesRow = page.getByRole('button', { name: /^Limpar histórico de Filmes —/ })
    await page.waitForFunction(() => !document.body.textContent?.includes('Carregando…'), null, { timeout: 5000 })
    assert((await moviesRow.getAttribute('aria-disabled')) === 'true', 'Filmes vazio: linha soft disabled')
    await page.keyboard.press('Enter')
    await page.getByText('O histórico de Filmes já está vazio.').waitFor({ timeout: 3000 })
    assert((await page.getByRole('dialog').count()) === 0, 'linha vazia avisa sem abrir confirmação')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown') // "Limpar ambos"
    assert(
      (await page.locator('.privacy-panel-row.tv-focus span').first().textContent()) === 'Limpar ambos',
      'a 3ª ação se chama "Limpar ambos" (FR-023)',
    )
    await page.keyboard.press('Enter')
    const batchDialog = page.getByRole('dialog', { name: 'Limpar o histórico de Filmes e Séries?' })
    await batchDialog.waitFor({ timeout: 5000 })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // "Limpar e apagar progresso"
    await page.keyboard.press('Enter')
    await page.getByText('Histórico de Filmes e Séries limpo.').waitFor({ timeout: 5000 })
    assert(true, 'limpeza em lote confirmada')

    await page.keyboard.press('Escape') // Configurações -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await page.waitForTimeout(400)
    assert((await page.locator(CONTINUE_ROW).count()) === 0, 'limpar ambos apagando o progresso esvaziou "Continuar assistindo"')
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
