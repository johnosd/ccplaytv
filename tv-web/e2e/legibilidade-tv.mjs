// Auditoria de legibilidade da feature 068 (`sdd/specs/068-legibilidade-tv/logic/escala-e-auditoria.md` §5).
//
// Percorre as telas principais a 1920×1080 em pt, en e es e mede, em cada uma:
// - SC-001: todo texto visível com pelo menos 20 px (tamanho calculado do elemento que contém o texto);
// - SC-002: nenhum texto saindo da caixa na vertical (linha de canal, item de trilha, card, botão, chip, aba…).
// A saída é uma lista "tela: seletor: problema" — vazia = passa. Serve para GUIAR os ajustes (rodar, corrigir, rodar
// de novo), não só como gate final.
//
//   node e2e/legibilidade-tv.mjs                       # gate: pt, en, es; sai com 1 se houver achado
//   node e2e/legibilidade-tv.mjs --langs pt            # só um idioma
//   node e2e/legibilidade-tv.mjs --relatorio           # só lista os achados, sem falhar (linha de base)
//   node e2e/legibilidade-tv.mjs --capturas <pasta>    # salva uma imagem por tela em <pasta> (só no 1º idioma)
//   node e2e/legibilidade-tv.mjs --quickstart         # também verifica marquee, movimento reduzido e RETURN nos 3 idiomas
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173). Dados: só fictícios
// (`fixtures/legibilidade-tv.m3u`, nomes longos e acentuados), servidos por um HTTP server local deste script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { cadastrarListaM3u } from './lib/entrada.mjs'
import { openSectionCategory } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'legibilidade-tv.m3u')
const APP_URL = 'http://localhost:5173'
const LANGUAGE_KEY = 'ccplaytv:app-language'
const MIN_FONT_PX = 20

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const LANGS = (argValue('--langs') ?? 'pt,en,es').split(',')
const REPORT_ONLY = args.includes('--relatorio')
const QUICKSTART = args.includes('--quickstart')
const SHOTS_DIR = argValue('--capturas') ? path.resolve(argValue('--capturas')) : undefined

/** Caixas cujo texto não pode vazar na vertical (SC-002). */
const BOX_SELECTORS = [
  '.live-channel-row',
  '.side-category-nav-item',
  '.content-card',
  '.chip',
  '.topbar-item',
  '.source-card',
  '.hint-bar-item',
  'button',
  '[role="tab"]',
  '[role="radio"]',
  '[role="option"]',
]

const findings = []
let screens = 0

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

/** Mede a tela atual no navegador; devolve a lista de problemas ("seletor: problema"). */
function measure({ minFontPx, boxSelectors, rootSelector }) {
  const problems = []
  const root = document.querySelector(rootSelector) ?? document.body
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter((c) => c && c !== 'tv-focus').slice(0, 2) : []
    return `${el.tagName.toLowerCase()}${cls.map((c) => `.${c}`).join('')}`
  }
  const visible = (el) => {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) return false
    return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
  }
  const textNodesOf = (root) => {
    const nodes = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) nodes.push(n)
    return nodes
  }

  // SC-001 — tamanho mínimo.
  const seen = new Set()
  for (const node of textNodesOf(root)) {
    const el = node.parentElement
    if (!el || seen.has(el) || !visible(el)) continue
    seen.add(el)
    const size = parseFloat(getComputedStyle(el).fontSize)
    if (size < minFontPx - 0.25) problems.push(`${describe(el)}: ${size}px < ${minFontPx}px ("${node.textContent.trim().slice(0, 40)}")`)
  }

  // SC-002 — texto saindo da caixa na vertical.
  const boxes = new Set()
  for (const selector of boxSelectors) for (const el of root.querySelectorAll(selector)) boxes.add(el)
  for (const box of boxes) {
    if (!visible(box)) continue
    const b = box.getBoundingClientRect()
    for (const node of textNodesOf(box)) {
      if (!node.parentElement || !visible(node.parentElement)) continue
      // Recorte dos ancestrais entre o texto e a caixa (ex.: título limitado a 2 linhas): linha inteira fora dele está
      // escondida de propósito (reticências), não vazando; linha cortada pela metade é problema.
      let clipTop = -Infinity
      let clipBottom = Infinity
      for (let el = node.parentElement; el && el !== box; el = el.parentElement) {
        if (getComputedStyle(el).overflowY === 'visible') continue
        const c = el.getBoundingClientRect()
        clipTop = Math.max(clipTop, c.top)
        clipBottom = Math.min(clipBottom, c.bottom)
      }
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) {
        if (r.height <= 0) continue
        // Folga: a caixa do glifo (ascendente + descendente da fonte) passa da linha (line-height 1.2) sem cortar nada visível.
        const slack = Math.max(0.5, r.height * 0.2)
        if (r.top >= clipBottom - slack || r.bottom <= clipTop + slack) continue
        if (r.top < clipTop - slack || r.bottom > clipBottom + slack) {
          problems.push(`${describe(box)}: linha cortada pela metade ("${node.textContent.trim().slice(0, 40)}")`)
          break
        }
        if (r.top < b.top - slack || r.bottom > b.bottom + slack) {
          problems.push(`${describe(box)}: texto sai da caixa (${Math.round(r.top - b.top)}/${Math.round(b.bottom - r.bottom)}px) ("${node.textContent.trim().slice(0, 40)}")`)
          break
        }
      }
    }
  }
  return [...new Set(problems)]
}

async function audit(page, lang, screen, rootSelector = 'body') {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {})
  await page.waitForTimeout(350)
  const problems = await page.evaluate(measure, { minFontPx: MIN_FONT_PX, boxSelectors: BOX_SELECTORS, rootSelector })
  screens += 1
  for (const problem of problems) findings.push(`[${lang}] ${screen}: ${problem}`)
  console.log(`  ${problems.length === 0 ? '✓' : '✗'} ${screen} (${lang})${problems.length ? ` — ${problems.length} achado(s)` : ''}`)
  if (SHOTS_DIR && lang === LANGS[0]) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    const file = `${String(screens).padStart(2, '0')}-${screen.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.png`
    await page.screenshot({ path: path.join(SHOTS_DIR, file) })
  }
}

/** Uma etapa que pode falhar sem derrubar as outras telas (registra como achado). */
async function step(lang, screen, fn) {
  try {
    await fn()
  } catch (error) {
    findings.push(`[${lang}] ${screen}: não consegui abrir a tela (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`)
    console.log(`  ✗ ${screen} (${lang}) — não abriu`)
  }
}

async function toHome(page) {
  await page.goto(APP_URL)
  await page.waitForSelector('.source-card, .home-content', { timeout: 15000 })
  if (await page.locator('.source-card').first().isVisible().catch(() => false)) await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 10000 })
}

/** Da Home, destino da topbar: home 0, live 1, movies 2, series 3, lista ativa 4, settings 6 (cai na engrenagem). */
async function viaTopbar(page, index) {
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < index; i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** As URLs da fixture não respondem: o player cai no erro, mas mostra o chrome — basta para medir. */
async function fakePlaying(page) {
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await page.evaluate(() => document.querySelector('.player-video')?.dispatchEvent(new Event('playing')))
  await page.waitForTimeout(800)
}

/** Abre cada aba da trilha (clique: o painel troca) e mede. */
async function auditTabs(page, lang, rootSelector, title) {
  const items = page.locator(`${rootSelector} .side-category-nav-item`)
  const count = await items.count()
  for (let i = 0; i < count; i += 1) {
    const label = (await items.nth(i).innerText()).trim().split('\n')[0]
    await items.nth(i).click()
    await page.waitForTimeout(300)
    await audit(page, lang, `${title} — ${label}`)
  }
}

/** Segura OK além do limiar do gesto (favoritar), como `favoritos.mjs`. */
async function holdEnter(page) {
  await page.keyboard.down('Enter')
  await page.waitForTimeout(950)
  await page.keyboard.up('Enter')
}

/** Favoritos só na 1ª passada (segurar OK de novo desfavoritaria): dão fileiras à Início. */
let favorited = false

/** Quickstart 2/3/6: animação real no Chromium e RETURN/foco em cada idioma. */
async function checkLiveQuickstart(page, categoryLabel) {
  assert.equal(await page.locator('.topbar, .live-header').count(), 0, 'Live sem cabeçalho')
  assert.equal(await page.locator('.live-body').getAttribute('data-live-view'), 'channels')
  assert.equal(await page.locator('.live-column-groups').isVisible(), false)
  assert.equal(await page.locator('.live-column-channels').isVisible(), true)
  assert.match(await page.locator('.live-column-channels .live-panel-head').innerText(), /3/)
  assert.equal(await page.locator('[role="dialog"]').count(), 0, 'focar não reproduz')

  const firstName = await page.locator('.live-channel-row .live-item-name').first().textContent()
  for (let i = 0; i < 5 && await page.locator('.live-channel-row.tv-focus .live-item-name').textContent() !== firstName; i += 1) {
    await page.keyboard.press('ArrowUp')
  }
  const inner = '.live-channel-row.tv-focus .marquee.is-running .marquee-inner'
  await page.waitForSelector(inner)
  assert.equal(await page.locator(inner).evaluate((el) => getComputedStyle(el).animationDelay), '1s')
  await page.waitForFunction((selector) => {
    const el = document.querySelector(selector)
    const transform = el && getComputedStyle(el).transform
    return transform && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)'
  }, inner, { timeout: 10000 })
  assert.equal(await page.locator('.live-channel-row:not(.tv-focus) .marquee.is-running').count(), 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator(inner).evaluate((el) => getComputedStyle(el).animationName), 'none')
  const fullName = await page.locator(inner).textContent()
  assert.ok((await page.locator('.live-preview-panel').textContent()).includes(fullName))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => document.documentElement.classList.add('reduce-motion'))
  assert.equal(await page.locator(inner).evaluate((el) => getComputedStyle(el).animationName), 'none')
  await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'))

  await page.keyboard.press('ArrowDown')
  const remembered = await page.locator('.live-channel-row.tv-focus .live-item-name').textContent()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.live-body').getAttribute('data-live-view'), 'categories')
  assert.equal(await page.locator('.live-column-groups .tv-focus .side-category-nav-label').textContent(), categoryLabel)
  assert.equal(await page.locator('.live-column-channels').isVisible(), false)
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.live-channel-row.tv-focus .live-item-name').textContent(), remembered)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.home-content')
  console.log('  ✓ Quickstart: nome rola só no foco; reduzir movimento; lista única; RETURN e canal lembrado')
}

async function walk(page, lang) {
  console.log(`=== ${lang} ===`)
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [LANGUAGE_KEY, lang])

  await step(lang, 'Perfis', async () => {
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card', { timeout: 15000 })
    await audit(page, lang, 'Perfis')
  })

  await step(lang, 'Cadastro de lista', async () => {
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 15000 })
    await page.locator('.add-card').click()
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await audit(page, lang, 'Cadastro de lista')
  })

  await step(lang, 'Início', async () => {
    await toHome(page)
    await audit(page, lang, 'Início')
  })

  await step(lang, 'TV ao vivo', async () => {
    await toHome(page)
    await viaTopbar(page, 1)
    await page.waitForSelector('.live-column-groups .side-category-nav-item', { timeout: 8000 })
    await audit(page, lang, 'TV ao vivo — categorias')
    const categoryLabel = await page.locator('.live-column-groups .tv-focus .side-category-nav-label').textContent()
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-channel-row', { timeout: 8000 })
    await page.waitForTimeout(1500) // nome longo no foco (FR-005) já rolando
    await audit(page, lang, 'TV ao vivo — canais')
    if (QUICKSTART) {
      await checkLiveQuickstart(page, categoryLabel)
      await viaTopbar(page, 1)
      await page.waitForSelector('.live-column-groups .side-category-nav-item')
      await page.keyboard.press('Enter')
      await page.waitForSelector('.live-channel-row.tv-focus')
    }
    if (!favorited) await holdEnter(page)
    await page.keyboard.press('Enter')
    await fakePlaying(page)
    await audit(page, lang, 'Player ao vivo', '[role="dialog"]')
  })

  await step(lang, 'Filmes', async () => {
    await toHome(page)
    await viaTopbar(page, 2)
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    await audit(page, lang, 'Filmes — vitrine')
    await toHome(page)
    await openSectionCategory(page, 'movies', 'Aventura')
    await page.waitForSelector('.content-card', { timeout: 8000 })
    await audit(page, lang, 'Filmes — grade')
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.vod-grid .content-card.tv-focus, .vod-grid .tv-focus', { timeout: 4000 })
    if (!favorited) await holdEnter(page)
    favorited = true
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await audit(page, lang, 'Detalhe de filme')
    await page.keyboard.press('Enter')
    await fakePlaying(page)
    await audit(page, lang, 'Player de filme', '[role="dialog"]')
  })

  await step(lang, 'Séries', async () => {
    await toHome(page)
    await viaTopbar(page, 3)
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    await audit(page, lang, 'Séries — vitrine')
    await toHome(page)
    await openSectionCategory(page, 'series', 'Dramas')
    await page.waitForSelector('.content-card', { timeout: 8000 })
    await audit(page, lang, 'Séries — grade')
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.vod-grid .tv-focus', { timeout: 4000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await audit(page, lang, 'Detalhe de série')
  })

  await step(lang, 'Início com fileiras', async () => {
    await toHome(page)
    await page.waitForSelector('.home-content .rail, .home-content section', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // foco numa fileira: card focado (expandido) também é medido
    await audit(page, lang, 'Início com fileiras')
  })

  await step(lang, 'Configurações', async () => {
    await toHome(page)
    await viaTopbar(page, 6)
    await page.waitForSelector('.settings-screen .side-category-nav-item', { timeout: 8000 })
    await auditTabs(page, lang, '.settings-screen', 'Configurações')
  })

  await step(lang, 'Tela da lista', async () => {
    await toHome(page)
    await viaTopbar(page, 6)
    await page.waitForSelector('.settings-screen .sources-panel-row', { timeout: 8000 })
    await page.locator('.sources-panel-row').first().getByRole('button', { name: /^(Configurar|Configure)$/ }).click()
    await page.waitForSelector('.list-settings-screen .side-category-nav-item', { timeout: 8000 })
    await auditTabs(page, lang, '.list-settings-screen', 'Tela da lista')
  })

  // Feature 070 (SC-004): a edição mostra os valores salvos em campos grandes (servidor/URL, usuário, senha).
  await step(lang, 'Edição de lista', async () => {
    await toHome(page)
    await viaTopbar(page, 6)
    await page.waitForSelector('.settings-screen .sources-panel-row', { timeout: 8000 })
    await page.locator('.sources-panel-row').first().getByRole('button', { name: /^(Configurar|Configure)$/ }).click()
    await page.waitForSelector('.list-settings-screen .side-category-nav-item', { timeout: 8000 })
    await page.getByRole('button', { name: /^(Editar|Edit)$/ }).click()
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.source-setup input.text-field-input')).some((el) => el.value !== ''))
    await audit(page, lang, 'Edição de lista')
  })
}

async function run() {
  const server = await startFixtureServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/legibilidade-tv.m3u`
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()

  try {
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 15000 })
    await cadastrarListaM3u(page, { nome: 'Fonte E2E Legibilidade Com Nome Comprido', url: m3uUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    for (const lang of LANGS) await walk(page, lang)
  } catch (error) {
    findings.push(`erro não tratado: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  } finally {
    await browser.close()
    server.close()
  }

  console.log(`\n${screens} tela(s) medidas, ${findings.length} achado(s).`)
  for (const finding of findings) console.log(`  - ${finding}`)
  if (findings.length > 0 && !REPORT_ONLY) process.exit(1)
}

run()
