// Evidência visual da feature 023 (shell, navegação e entrada do DS V14) —
// NÃO é um gate de asserção como os demais scripts de `e2e/`: captura as telas
// novas em 1920×1080, para revisão humana do layout (o jsdom não calcula
// layout, então só um Chromium real prova que nada colapsa ou é cortado — foi
// assim que a 022 achou o `Rail` de altura zero).
//
//   node e2e/shell-visual.mjs
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173).
// Saída: `sdd/specs/023-shell-navegacao-entrada-ds-v14/evidencias/*.png`.
// Dados: só fictícios (`fixtures/favoritos.m3u`), servidos por um HTTP server
// local criado por este script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'favoritos.m3u')
const APP_URL = 'http://localhost:5173'
const OUT_DIR = path.resolve(__dirname, '..', '..', 'sdd', 'specs', '023-shell-navegacao-entrada-ds-v14', 'evidencias')

let shots = 0

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

async function shot(page, name) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {})
  await page.waitForTimeout(350) // deixa as transições de foco terminarem
  shots += 1
  await page.screenshot({ path: path.join(OUT_DIR, `${String(shots).padStart(2, '0')}-${name}.png`) })
  console.log(`  ✓ ${String(shots).padStart(2, '0')}-${name}.png`)
}

async function addList(page, m3uUrl, name) {
  await page.waitForSelector('.add-card.tv-focus', { timeout: 8000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(name)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true })
  const server = await startFixtureServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/favoritos.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    await page.goto(APP_URL)
    await page.waitForSelector('.splash', { timeout: 5000 })
    await shot(page, 'splash')

    await page.waitForSelector('.add-card', { timeout: 10000 })
    await shot(page, 'perfis-sem-lista')

    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]')
    await shot(page, 'modal-sair')
    await page.keyboard.press('Escape')

    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title')
    await shot(page, 'onboarding')

    await page.getByLabel('Nome de exibição').fill('Sala de estar')
    await page.getByLabel('URL da lista M3U').fill(m3uUrl)
    await page.getByRole('button', { name: 'Adicionar lista' }).click()
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    await page.getByRole('button', { name: 'Abrir lista' }).waitFor()
    await shot(page, 'progresso-concluido')

    await page.keyboard.press('Enter') // Abrir lista
    await page.waitForSelector('.tiles-row')
    await shot(page, 'inicio')

    await page.keyboard.press('ArrowUp')
    await shot(page, 'inicio-foco-topbar')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight')
    await shot(page, 'inicio-foco-indicador')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]')
    await shot(page, 'inicio-modal-sair')
    await page.keyboard.press('Escape')

    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await page.waitForTimeout(300)
    await shot(page, 'inicio-offline')
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // Trocar de lista → perfis com uma lista
    await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.source-card')
    await shot(page, 'perfis-uma-lista')

    await page.keyboard.press('ArrowDown')
    await shot(page, 'perfis-acoes')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]')
    await shot(page, 'perfis-modal-excluir')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowUp')

    // Muitas listas: rolagem horizontal acompanhando o foco (FR-012)
    for (let i = 2; i <= 7; i += 1) {
      await page.keyboard.press('ArrowRight') // "Adicionar lista"
      await addList(page, m3uUrl, i === 4 ? 'Uma lista com um nome bem comprido para testar as reticências' : `Lista ${i}`)
      await page.getByRole('button', { name: 'Voltar' }).click()
      await page.locator('.source-card-wrap', { hasText: i === 4 ? 'nome bem comprido' : `Lista ${i}` }).waitFor()
    }
    await shot(page, 'perfis-muitas-listas-foco-na-ultima')
    await page.keyboard.press('ArrowRight')
    await shot(page, 'perfis-muitas-listas-foco-adicionar')
    for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowLeft')
    await shot(page, 'perfis-muitas-listas-foco-na-primeira')

    await page.keyboard.press('Enter') // abre a primeira lista com nome de 13 caracteres
    await page.waitForSelector('.tiles-row')
    await shot(page, 'inicio-lista-escolhida')

    // Formulário de edição (hint no lugar de placeholder)
    await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.source-card')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight') // Editar
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title')
    await shot(page, 'onboarding-edicao')
  } catch (error) {
    console.error('  ✗ ERRO:', error)
    await page.screenshot({ path: path.join(OUT_DIR, `zz-erro.png`) }).catch(() => {})
    process.exitCode = 1
  } finally {
    await browser.close()
    server.close()
  }
  console.log(`\n${shots} captura(s) em ${OUT_DIR}`)
}

await run()
