// E2E da feature 074 (Rádio global). Cobre o fluxo principal do `quickstart.md` (cenários 1–8) contra o dev server,
// com o diretório Radio Browser INTERCEPTADO por `page.route` — nunca o serviço real. Os streams apontam para um
// servidor local que responde 404: o caminho de falha da barra é o que dá para provar no navegador; som de verdade
// só na TV (quickstart, "Passada na TV física").
//
//   node e2e/radio-global.mjs          # com `npm run dev` já rodando (http://localhost:5173)
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { mockRadioDirectory, radioDirectoryStation } from './lib/radioDirectoryMock.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'favoritos.m3u')
const APP_URL = 'http://localhost:5173'

/** Lista M3U e streams de rádio quebrados (404), no mesmo servidor local. */
function startServer() {
  const playlist = readFileSync(FIXTURE_PATH)
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith('/lista.m3u')) {
        res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
        res.end(playlist)
        return
      }
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
      res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/** Intercepta o diretório (fictício) e devolve as requisições vistas. */
function mockDirectory(page, streamBase) {
  return mockRadioDirectory(page, {
    BR: [radioDirectoryStation('br-1', 'Rádio Alfa E2E', 'BR', streamBase), radioDirectoryStation('br-2', 'Rádio Beta E2E', 'BR', streamBase)],
    AR: [radioDirectoryStation('ar-1', 'Radio Gama E2E', 'AR', streamBase)],
  })
}

const press = (page, key, times = 1) => (async () => {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
})()

async function focusedText(page) {
  return page.evaluate(() => document.querySelector('.tv-focus')?.textContent ?? null)
}

async function run() {
  const server = await startServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const requests = await mockDirectory(page, `${base}/stream`)
  const searches = () => requests.filter((request) => request.path === '/json/stations/search').length

  try {
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 15000 })
    await cadastrarListaM3u(page, { nome: 'Fonte E2E Rádio', url: `${base}/lista.m3u` })
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card', { timeout: 15000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })

    // 1. "Rádio" logo depois de "Séries" na topbar do Início.
    const nav = await page.locator('.topbar-nav .topbar-item').allTextContents()
    assert.deepEqual(nav, ['Início', 'TV ao vivo', 'Filmes', 'Séries', 'Rádio'], 'ordem da topbar')
    await press(page, 'ArrowUp', 6)
    await press(page, 'ArrowLeft', 6)
    await press(page, 'ArrowRight', 4)
    assert.equal(await focusedText(page), 'Rádio')
    await page.keyboard.press('Enter')

    // 2. Abre no país da TV (pt-BR → Brasil), com o recorte e o foco na 1ª estação.
    await page.waitForSelector('.radio-station.tv-focus', { timeout: 10000 })
    assert.match(await page.locator('.radio-station.tv-focus').textContent(), /Rádio Alfa E2E/)
    await page.waitForSelector('text=2 mais ouvidas de 500')
    for (const request of requests) assert.ok(!request.query.includes('fonte') && !request.query.includes('E2E'), 'nada da lista vai ao diretório')

    // 4. Focar países na trilha não consulta o diretório.
    await page.keyboard.press('Escape')
    const before = searches()
    await press(page, 'ArrowDown', 2)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(300)
    assert.equal(searches(), before, 'focar a trilha não consulta estações')

    // 5. OK num país troca a lista.
    await page.waitForFunction(() => document.querySelector('.side-category-nav-item.tv-focus')?.textContent?.includes('Argentina'))
    await page.keyboard.press('Enter')
    await page.waitForSelector('.radio-station.tv-focus >> text=Radio Gama E2E', { timeout: 10000 })
    assert.equal(searches(), before + 1)

    // 7. Estação que não toca: "Estação indisponível" com as ações, nada toca sozinho, clique NÃO contado.
    await page.keyboard.press('Enter')
    const bar = page.getByRole('region', { name: 'Tocando agora' })
    await bar.getByText('Estação indisponível').waitFor({ timeout: 20000 })
    await bar.getByRole('button', { name: 'Tentar de novo' }).waitFor()
    assert.equal(requests.filter((request) => request.path.startsWith('/json/url/')).length, 0, 'clique só depois de tocar')
    await page.keyboard.press('ArrowUp')
    assert.equal(await focusedText(page), 'Tentar de novo')
    await page.keyboard.press('ArrowDown')

    // 6. Segurar OK favorita sem tocar; ★ Favoritos lista a estação.
    await page.keyboard.down('Enter')
    await page.waitForTimeout(900)
    await page.keyboard.up('Enter')
    await page.waitForSelector('.radio-station.tv-focus .fav-star', { timeout: 5000 })
    await page.keyboard.press('Escape')
    await press(page, 'ArrowUp', 3)
    await page.waitForFunction(() => document.querySelector('.side-category-nav-item.tv-focus')?.textContent?.includes('Favoritos'))
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=1 favorita')
    await page.waitForSelector('.radio-list >> text=Radio Gama E2E')

    // 8. RETURN até o Início; voltar à Rádio reabre a mesma entrada com o foco na mesma estação.
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    await page.waitForFunction(() => document.querySelector('.topbar-item.tv-focus')?.textContent === 'Rádio')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.radio-station.tv-focus >> text=Radio Gama E2E', { timeout: 10000 })

    console.log('radio-global: ok')
  } finally {
    await browser.close()
    server.close()
  }
}

run().catch((error) => {
  console.error(`radio-global: FALHOU — ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
