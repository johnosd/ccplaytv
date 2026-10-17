// Feature 078 (SAM-KIT-SHOTS): as 4 capturas da loja Samsung, tiradas do app real no navegador a 1920×1080.
//
// Tudo é FICTÍCIO: o painel Xtream local de `fakePanel.mjs` (canais, guia, filmes e séries de nomes inventados, capas e
// logos em SVG abstrato) — nenhuma marca, pôster ou logo de terceiros, nenhuma lista real.
// Sem chave TMDB: a tela mostra só o que a lista declara, como na TV de quem não configurou o TMDB.
//
// Uso (com `npm run dev` no ar em http://localhost:5173):
//   node scripts/release/store-screenshots.mjs [--out <pasta>]
// Grava screenshot_01.jpg … screenshot_04.jpg (JPEG < 500 kB) em `release/samsung/kit/media/` por padrão.
import { mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from '../../e2e/lib/entrada.mjs'
import { openVodCategory, enterRows } from '../../e2e/lib/vod.mjs'
import { MOVIES, SERIES, startPanel, waitPainted } from './fakePanel.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const outArg = process.argv.indexOf('--out')
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'release', 'samsung', 'kit', 'media')
const APP_URL = 'http://localhost:5173'
const LISTA = 'Minha Playlist'
const MAX_BYTES = 500_000

// ---------------------------------------------------------------- roteiro

async function shot(page, n) {
  await waitPainted(page)
  const file = path.join(OUT, `screenshot_0${n}.jpg`)
  for (const quality of [88, 80, 72, 64]) {
    await page.screenshot({ path: file, type: 'jpeg', quality })
    const size = statSync(file).size
    if (size < MAX_BYTES) {
      console.log(`  ✓ screenshot_0${n}.jpg (${Math.round(size / 1024)} KB, qualidade ${quality})`)
      return
    }
  }
  throw new Error(`screenshot_0${n}.jpg passou de ${MAX_BYTES} bytes`)
}

const settle = (page, ms = 900) => page.waitForTimeout(ms)
const LABELS = { home: 'Início', live: 'TV ao vivo', movies: 'Filmes', series: 'Séries' }

/** Vai a um destino da topbar por clique (as setas dependem de onde o foco estava). */
async function openViaTopbar(page, destination) {
  if (process.env.SHOTS_DEBUG) {
    console.log('DEBUG', await page.evaluate(() => JSON.stringify({
      home: !!document.querySelector('.home-content'),
      items: [...document.querySelectorAll('.topbar-item')].map((el) => { const r = el.getBoundingClientRect(); return `${el.textContent?.trim()}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}` }),
    })))
  }
  // A vitrine e a TV ao vivo não mostram a topbar: RETURN até ela aparecer (volta ao Início).
  for (let i = 0; i < 6 && !(await page.locator('.home-content').isVisible().catch(() => false)); i += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
  await page.locator('.topbar-nav .topbar-item', { hasText: LABELS[destination] }).first().click()
}

async function openShowcase(page, section) {
  await openViaTopbar(page, section)
  await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
}

async function run() {
  mkdirSync(OUT, { recursive: true })
  const server = await startPanel()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  // Nenhuma chamada sai para fora: TMDB e qualquer outro host externo são recusados.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort('failed'))
  try {
    console.log('== lista fictícia')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card.tv-focus', { timeout: 15000 })
    await page.keyboard.press('Enter')
    await cadastrarListaXtream(page, { nome: LISTA, servidor: `http://127.0.0.1:${server.address().port}`, usuario: 'demo', senha: 'demo' })
    await page.waitForSelector('text=/Concluída/', { timeout: 60000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })

    console.log('== carregando categorias de filmes e séries')
    await openShowcase(page, 'movies')
    for (const [name] of MOVIES) {
      await openVodCategory(page, name)
      await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
      await page.keyboard.press('Escape')
      await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    }
    await openViaTopbar(page, 'series')
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    for (const [name] of SERIES) {
      await openVodCategory(page, name)
      await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
      await page.keyboard.press('Escape')
      await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    }

    // Ordem da loja: 1 Filmes (catálogo), 2 TV ao vivo (canais + guia), 3 Séries, 4 detalhe de série com episódios.
    console.log('== 1. Filmes')
    await openShowcase(page, 'movies')
    await settle(page, 1200)
    await enterRows(page)
    await page.keyboard.press('ArrowRight')
    await settle(page, 1500)
    await shot(page, 1)

    console.log('== 2. TV ao vivo')
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups .side-category-nav-item', { timeout: 10000 })
    await settle(page)
    for (let i = 0; i < 12; i += 1) {
      const text = (await page.locator('.live-column-groups .side-category-nav-item.tv-focus').textContent().catch(() => '')) ?? ''
      if (text.includes('Esportes')) break
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 10000 })
    await page.keyboard.press('ArrowDown')
    await settle(page, 2500)
    await shot(page, 2)

    console.log('== 3. Séries')
    await openShowcase(page, 'series')
    await settle(page, 1200)
    await enterRows(page)
    await page.keyboard.press('ArrowRight')
    await settle(page, 1500)
    await shot(page, 3)

    console.log('== 4. Detalhe de série')
    // "Séries em Alta" na ordem da fonte: o 1º card é "Distrito Zero", a série com sinopse escrita.
    await openVodCategory(page, 'Séries em Alta')
    await page.locator('.vod-grid .content-card', { hasText: 'Distrito Zero' }).first().click() // clique só foca
    await settle(page, 600)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-grid', { state: 'detached', timeout: 10000 })
    await page.getByText('Distrito Zero', { exact: true }).first().waitFor({ timeout: 10000 })
    await page.getByText('O Primeiro Apagão').first().waitFor({ timeout: 10000 })
    await settle(page, 2500)
    await shot(page, 4)
  } catch (error) {
    await page.screenshot({ path: path.join(OUT, '_falha.png') }).catch(() => {})
    throw error
  } finally {
    await browser.close()
    server.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
