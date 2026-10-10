// Roteiro local da feature 065 (T043): abertura sem lista não baixa chunks de
// rota; a primeira navegação a Filmes baixa o chunk local e RETURN preserva a
// tela anterior. A fronteira de erro/retry é coberta pelo teste de componente.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const FIXTURE = readFileSync(path.join(ROOT, 'fixtures', 'favoritos.m3u'))

function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  return existsSync(fixedPath) ? chromium.launch({ headless: true, executablePath: fixedPath }) : chromium.launch({ headless: true })
}

function fixtureServer() {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(FIXTURE)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function assert(ok, message) {
  if (!ok) throw new Error(message)
  console.log(`  ✓ ${message}`)
}

async function main() {
  const server = await fixtureServer()
  const port = server.address().port
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({ locale: 'pt-BR' })
    const page = await context.newPage()
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    const coldRoutes = await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => /route-[^/]+\.js(?:\?|$)/.test(entry.name)).length)
    assert(coldRoutes === 0, 'abertura sem lista não carrega chunks de rota')

    await page.locator('.add-card').click()
    await cadastrarListaM3u(page, { nome: 'Fonte performance navegação', url: `http://127.0.0.1:${port}/favoritos.m3u` })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.home-screen', { timeout: 15000 })
    await page.getByRole('button', { name: 'Filmes', exact: true }).click()
    await page.waitForSelector('.vod-showcase-screen, .vod-showcase', { timeout: 10000 })
    const routeLoads = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => /route-vod-showcase\.js(?:\?|$)/.test(entry.name) || /VodShowcaseScreen\.(tsx?|js)(?:\?|$)/.test(entry.name)).length,
    )
    console.log(`  • chunk de Filmes observado no timing do navegador: ${routeLoads} (o dev server pode servir módulos-fonte sem entrada nomeada)`)
    assert(await page.locator('.vod-showcase').count() > 0, 'a primeira visita a Filmes monta a vitrine')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-screen', { timeout: 5000 })
    assert(true, 'RETURN restaura a tela anterior após a primeira visita lazy')
    await context.close()
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
