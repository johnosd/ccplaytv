// Roteiro E2E da feature 028 (Limpeza e QA do DS V14) — US1: nenhuma barra
// de rolagem nativa em Filmes (trilha e grade) nem no Início, foco levado
// ao último item da grade, folga do Início dentro do limite, e transbordo
// horizontal real (se houver) na grade de Filmes (`logic/migracao-css.md`
// §6, R-003 do plan.md).
//
// Diferente dos demais scripts de `e2e/`: lança o Chromium com
// `ignoreDefaultArgs: ['--hide-scrollbars']` — o padrão do Playwright
// esconde barras nativas, e é por isso que nenhum E2E anterior pegou este
// bug (achado ao escrever este script).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts.
//
// Dados: só fictícios (`fixtures/limpeza-qa.m3u`, servida por um HTTP
// server local criado por este próprio script).
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'limpeza-qa.m3u')
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

/**
 * Mesmo binário fixo dos demais scripts quando existe — mas SEM
 * `--hide-scrollbars` (o Playwright o adiciona por padrão a
 * `ignoreDefaultArgs`; aqui ele é excluído de propósito, `logic/
 * migracao-css.md` §6).
 */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  const opts = { headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] }
  if (existsSync(fixedPath)) return chromium.launch({ ...opts, executablePath: fixedPath })
  return chromium.launch(opts)
}

async function addSourceAndOpen(page, m3uUrl, displayName) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 8000 })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series', 'profile', 'search', 'settings']
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function waitForRealCategory(page) {
  await page.locator('.side-category-nav-item.tv-focus:not(:has-text("Favoritos")):not(:has-text("Todos"))').waitFor({
    timeout: 8000,
  })
}

/**
 * Espessura de barra nativa de um elemento (0 quando `overflow` esconde a
 * barra por CSS, sempre que o navegador conta com espaço reservado pra
 * ela — `offsetWidth - clientWidth` é exatamente essa reserva).
 */
async function scrollbarThickness(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    return {
      vertical: el.offsetWidth - el.clientWidth,
      horizontal: el.offsetHeight - el.clientHeight,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }
  }, selector)
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/limpeza-qa.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log('=== Preparação: fonte com trilha/grade que transbordam ===')
    await addSourceAndOpen(page, m3uUrl, 'Fonte E2E Limpeza QA')
    await page.route('**/limpeza-qa.e2e.test/**', () => {})

    console.log('=== US1: Filmes — trilha e grade sem barra nativa (FR-001) ===')
    await openViaTopbar(page, 'movies')
    await waitForRealCategory(page)
    await page.keyboard.press('ArrowRight') // trilha -> entra em "Filmes" (30 itens, transborda)
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    const trilha = await scrollbarThickness(page, '.vod-side-nav')
    assert(trilha !== null, '.vod-side-nav existe')
    assert(trilha.scrollHeight > trilha.clientHeight, 'a trilha de categorias realmente transborda (baseline do teste)')
    assert(trilha.vertical === 0, `trilha de categorias sem barra de rolagem vertical (medida: ${trilha?.vertical}px)`)

    const grade = await scrollbarThickness(page, '.vod-grid')
    assert(grade !== null, '.vod-grid existe')
    assert(grade.scrollHeight > grade.clientHeight, 'a grade de Filmes realmente transborda na vertical (baseline do teste)')
    assert(grade.vertical === 0, `grade de Filmes sem barra de rolagem vertical (medida: ${grade?.vertical}px)`)
    assert(grade.horizontal === 0, `grade de Filmes sem barra de rolagem horizontal (medida: ${grade?.horizontal}px)`)

    // R-003 do plan.md: se a grade também transborda na horizontal, é
    // achado real (folga de layout), não corrigido escondendo a barra.
    if (grade.scrollWidth > grade.clientWidth) {
      console.log(
        `  ℹ transbordo horizontal real na grade: scrollWidth=${grade.scrollWidth} clientWidth=${grade.clientWidth} — registrar em plan.md (R-003)`,
      )
    } else {
      assert(true, 'grade de Filmes sem transbordo horizontal real (nada a corrigir além da barra)')
    }

    console.log('=== US1: Filmes — foco no último item continua trazendo a grade (FR-002) ===')
    // A grade é virtualizada (feature 009): a contagem de `.content-card-title`
    // no DOM é só a janela visível, nunca os 30 itens inteiros — não é
    // assertável aqui. O que este bloco prova é que o item focado continua
    // sendo trazido pra área visível mesmo sem a barra nativa.
    for (let i = 0; i < 35; i += 1) await page.keyboard.press('ArrowDown') // sobra clampada no último item
    await page.waitForTimeout(200) // a virtualização re-renderiza a janela após a rolagem
    assert(
      await page.evaluate(() => {
        const focused = document.querySelector('.tv-focus')
        if (!focused) return false
        const rect = focused.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= window.innerHeight
      }),
      'o item focado da grade está dentro da área visível (rolagem por foco continua funcionando)',
    )

    await page.keyboard.press('Escape') // grade -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== US1: Início — sem barra nativa e sem faixa vazia grande (FR-001/FR-004, SC-002) ===')
    const inicio = await scrollbarThickness(page, '.home-content')
    assert(inicio !== null, '.home-content existe')
    assert(inicio.vertical === 0, `.home-content sem barra de rolagem vertical (medida: ${inicio?.vertical}px)`)

    const slack = await page.evaluate(() => {
      const content = document.querySelector('.home-content')
      if (!content) return null
      const last = content.lastElementChild
      if (!last) return null
      const contentRect = content.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      const spaceToken = getComputedStyle(document.documentElement).getPropertyValue('--space-5').trim()
      return { slackPx: contentRect.bottom - lastRect.bottom, spaceToken }
    })
    assert(slack !== null, 'folga abaixo do último elemento do Início é medível')
    if (slack) {
      const limit = 3 * parseFloat(slack.spaceToken || '0') || 200 // SC-002 é qualitativo; 3× --space-5 como teto de sanidade até a Fase 3 fixar o layout
      console.log(`  ℹ folga medida abaixo do último elemento do Início: ${slack.slackPx.toFixed(1)}px (limite provisório: ${limit}px)`)
      assert(
        slack.slackPx <= limit,
        `folga do Início dentro do limite provisório (medida: ${slack.slackPx.toFixed(1)}px, limite: ${limit}px) — SC-002`,
      )
    }
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
