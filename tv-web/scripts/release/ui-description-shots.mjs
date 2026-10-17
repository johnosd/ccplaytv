// Feature 078 (SAM-KIT-UIDESC): uma captura por tela do app, EM INGLÊS, para os slides "Menus and Functions" do
// template de Application UI Description da Samsung. Mesmo painel fictício das capturas da loja (`fakePanel.mjs`);
// o diretório Radio Browser também é interceptado (estações inventadas). Variante COMERCIAL (R-015), subida pelo
// próprio roteiro com portal e licença fictícios (`fakeCommercial.mjs`). Nenhuma chamada sai para fora.
//
// Uso (sem servidor no ar; `ffmpeg` no PATH dá um vídeo abstrato ao player):
//   node scripts/release/ui-description-shots.mjs [--out <pasta>]
// Grava ui_NN_<tela>.jpg em `release/samsung/kit/ui-description/` por padrão.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from '../../e2e/lib/entrada.mjs'
import { openVodCategory, enterRows } from '../../e2e/lib/vod.mjs'
import { mockRadioDirectory, radioDirectoryStation } from '../../e2e/lib/radioDirectoryMock.mjs'
import { startCommercialApp } from './fakeCommercial.mjs'
import { MOVIES, SERIES, startPanel, waitPainted } from './fakePanel.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const outArg = process.argv.indexOf('--out')
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'release', 'samsung', 'kit', 'ui-description')
const LISTA = 'My Playlist'
const DAY = 86_400_000
const LABELS = { home: 'Home', live: 'Live TV', movies: 'Movies', series: 'Series', radio: 'Radio' }

/** Vídeo abstrato (gradiente animado, sem som) para o player, se houver ffmpeg; senão o player mostra o erro do stream. */
function makeVideo() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ccplay-uidesc-')), 'demo.webm')
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'gradients=s=1280x720:d=60:speed=0.01:r=25', '-c:v', 'libvpx-vp9', '-b:v', '600k', '-deadline', 'realtime', '-cpu-used', '8', '-y', file])
    return file
  } catch {
    console.log('  · sem ffmpeg: o player vai mostrar o erro do stream')
    return undefined
  }
}

const settle = (page, ms = 900) => page.waitForTimeout(ms)
const visible = (page, selector) => page.locator(selector).first().isVisible().catch(() => false)

async function shot(page, name) {
  // Na TV não há mouse: o hover e o foco de DOM de um clique não podem parecer um segundo foco (o do app é `.tv-focus`).
  await page.mouse.move(1919, 1079)
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement && !document.activeElement.matches('input')) document.activeElement.blur() })
  await waitPainted(page)
  const file = path.join(OUT, `${name}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 85 })
  console.log(`  ✓ ${name}.jpg`)
}

/** RETURN até o Início aparecer e clique no destino da topbar (clique na topbar navega). */
async function openViaTopbar(page, destination) {
  for (let i = 0; i < 6 && !(await visible(page, '.home-content')); i += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
  await page.locator('.topbar-nav .topbar-item', { hasText: LABELS[destination] }).first().click()
}

async function openShowcase(page, section) {
  await openViaTopbar(page, section)
  await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
}

/** RETURN até a tela de listas (sem abrir a confirmação de saída). */
async function backToProfiles(page) {
  for (let i = 0; i < 8 && !(await visible(page, '.add-card')); i += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await page.waitForSelector('.add-card', { timeout: 8000 })
}

async function run() {
  mkdirSync(OUT, { recursive: true })
  const server = await startPanel({ videoFile: makeVideo() })
  const app = await startCommercialApp({ port: 5183 })
  const APP_URL = app.url
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort('failed'))
  await app.prepare(context) // depois do bloqueio: o portal fictício tem precedência
  const streamBase = `http://127.0.0.1:${server.address().port}/radio`
  const stations = (code, names) => names.map((name, i) => radioDirectoryStation(`${code.toLowerCase()}-${i}`, name, code, streamBase))
  await mockRadioDirectory(page, {
    US: stations('US', ['Harbor FM', 'Sunset Jazz Radio', 'Morning Talk 101', 'Classic Drive', 'Indie Waves', 'City Beat']),
    BR: stations('BR', ['Rádio Horizonte', 'Litoral FM', 'Clássicos MPB']),
  })
  try {
    console.log('== lista fictícia (cadastro em pt, o roteiro E2E usa os rótulos em pt)')
    await page.addInitScript(() => { if (!sessionStorage.getItem('uidesc-lang')) localStorage.setItem('ccplaytv:app-language', 'pt') })
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card.tv-focus', { timeout: 15000 })
    await page.keyboard.press('Enter')
    await cadastrarListaXtream(page, { nome: LISTA, servidor: `http://127.0.0.1:${server.address().port}`, usuario: 'demo', senha: 'demo' })
    await page.waitForSelector('text=/Concluída/', { timeout: 60000 })

    console.log('== app em inglês')
    await page.evaluate(() => { sessionStorage.setItem('uidesc-lang', '1'); localStorage.setItem('ccplaytv:app-language', 'en') })
    await page.reload()
    await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 15000 })
    await settle(page, 1200)
    await shot(page, 'ui_01_lists')

    console.log('== confirmação de saída (RETURN na tela de listas)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.modal-title', { timeout: 5000 })
    await settle(page, 500)
    await shot(page, 'ui_02_exit')
    await page.keyboard.press('Escape')
    await settle(page, 500)

    console.log('== adicionar lista')
    await page.locator('.add-card').click()
    await settle(page, 300)
    if (await visible(page, '.add-card')) await page.keyboard.press('Enter')
    // Com portal, o cadastro abre na aba "On the website" (QR, ID e chave); depois a aba Xtream Codes.
    await page.getByText('A0:8C:FD:19:0A:8C').first().waitFor({ timeout: 15000 })
    await settle(page, 1000)
    await shot(page, 'ui_03a_add_site')
    await page.getByRole('button', { name: /^.?\s*Xtream Codes/ }).click()
    await page.waitForSelector('input', { timeout: 8000 })
    await settle(page, 800)
    await shot(page, 'ui_03_add_list')
    await backToProfiles(page)

    console.log('== ajustes, portal e compra')
    const settingsCorner = page.locator('.profiles-settings-corner:not(.profiles-portal-corner)')
    await settingsCorner.click()
    await settle(page, 300)
    if (await settingsCorner.isVisible().catch(() => false)) await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.querySelector('.add-card'), null, { timeout: 8000 })
    await settle(page, 1000)
    await shot(page, 'ui_04_settings')
    for (const [label, name] of [['Playback', 'ui_04b_playback'], ['Portal & license', 'ui_04c_portal']]) {
      await page.getByText(label, { exact: true }).first().click() // o clique abre a aba
      await settle(page, 1500)
      await shot(page, name)
    }
    // Comprar licença: o foco já está em "Buy license"; OK abre o Pix (valor, QR e Atualizar).
    await page.getByRole('button', { name: 'Buy license' }).click()
    await settle(page, 300)
    if (!(await visible(page, '[role="dialog"]'))) await page.keyboard.press('Enter')
    await page.getByRole('dialog').getByText(/R\$/).first().waitFor({ timeout: 15000 })
    await settle(page, 1200)
    await shot(page, 'ui_14_pix')
    await page.keyboard.press('Escape')
    await settle(page, 600)
    await backToProfiles(page)

    console.log('== início')
    await page.locator('.source-card-wrap', { hasText: LISTA }).click()
    await settle(page, 300)
    if (!(await visible(page, '.home-content'))) await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })

    console.log('== carregando categorias de filmes e séries')
    await openShowcase(page, 'movies')
    for (const [name] of MOVIES) {
      await openVodCategory(page, name)
      await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
      await page.keyboard.press('Escape')
      await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    }
    await openShowcase(page, 'series')
    for (const [name] of SERIES) {
      await openVodCategory(page, name)
      await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
      await page.keyboard.press('Escape')
      await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    }

    await openViaTopbar(page, 'home')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    // A pré-carga em segundo plano termina sozinha: a linha "Preparing catalog — n of m" vira "Catalog updated".
    await page.waitForFunction(() => !/Preparing catalog/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => console.log('  · aviso: pré-carga ainda em curso'))
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft') // o foco volta de "Series" para "Home"
    await settle(page, 1500)
    await shot(page, 'ui_05_home')

    console.log('== TV ao vivo')
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
    await shot(page, 'ui_06_live')

    console.log('== player ao vivo')
    await page.keyboard.press('Enter')
    await settle(page, 4000)
    await shot(page, 'ui_07_live_player')
    await page.keyboard.press('Escape')
    await settle(page, 1000)

    console.log('== Filmes (vitrine)')
    await openShowcase(page, 'movies')
    await settle(page, 1200)
    await enterRows(page)
    await page.keyboard.press('ArrowRight')
    await settle(page, 1500)
    await shot(page, 'ui_08_movies')

    console.log('== categoria de filmes (grade)')
    await openVodCategory(page, 'Lançamentos')
    await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
    await page.keyboard.press('ArrowDown')
    await settle(page, 1500)
    await shot(page, 'ui_09_category')

    console.log('== detalhe de filme')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-grid', { state: 'detached', timeout: 10000 })
    await settle(page, 2500)
    await shot(page, 'ui_10_movie_detail')

    console.log('== player de filme')
    await page.keyboard.press('Enter')
    await settle(page, 4500)
    await page.keyboard.press('ArrowDown') // mostra a barra do player
    await settle(page, 800)
    await shot(page, 'ui_11_movie_player')
    for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Escape'); await settle(page, 700) }

    console.log('== Séries e detalhe')
    await openShowcase(page, 'series')
    await openVodCategory(page, 'Séries em Alta')
    await page.locator('.vod-grid .content-card', { hasText: 'Distrito Zero' }).first().click() // clique só foca
    await settle(page, 600)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-grid', { state: 'detached', timeout: 10000 })
    await page.getByText('O Primeiro Apagão').first().waitFor({ timeout: 10000 })
    await settle(page, 2500)
    await shot(page, 'ui_12_series_detail')

    console.log('== Rádio')
    await openViaTopbar(page, 'radio')
    await page.getByText('Harbor FM').first().waitFor({ timeout: 15000 })
    await settle(page, 1500)
    await shot(page, 'ui_13_radio')

    console.log('== fim do teste: bloqueio ao entrar na lista')
    await backToProfiles(page)
    await app.skew(page, 8 * DAY) // 8 dias depois: o teste local de 7 dias venceu
    await settle(page, 1500)
    await page.locator('.source-card-wrap', { hasText: LISTA }).click()
    await settle(page, 300)
    if (!(await visible(page, '[role="dialog"]'))) await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: 'A license is required to open the list' }).waitFor({ timeout: 15000 })
    await settle(page, 1500)
    await shot(page, 'ui_15_license_gate')
    if (app.unknownCalls.length) console.log('  · rotas do portal sem fixture:', [...new Set(app.unknownCalls)].join(', '))
  } catch (error) {
    await page.screenshot({ path: path.join(OUT, '_falha.png') }).catch(() => {})
    throw error
  } finally {
    await browser.close()
    server.close()
    app.stop()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
