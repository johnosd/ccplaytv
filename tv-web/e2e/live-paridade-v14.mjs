// Roteiro E2E da feature 048 (paridade visual da TV ao vivo com o Design System V14)
// — gate da constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Num Chromium de verdade, a 1920×1080 (o palco do app roda na escala 1:1), mede o
// que o jsdom não vê: (SC-001) o destaque ocupa ≥ 55% da largura útil; (FR-007) colunas
// de 200/340px; (SC-002) o anel de foco da lista e da trilha não é cortado no 1º e no
// último item; (SC-006/FR-021) o indicador de continuação aparece só nas bordas com itens
// ocultos e o item focado nunca fica sob o degradê. Tira capturas para `test-results/`.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173). A lista M3U é fictícia e
// gerada aqui mesmo, servida por um HTTP server local.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Live Paridade'
const SHOTS = path.join(process.cwd(), 'test-results', 'live-paridade-v14')
// O anel V14: 4px de contorno + 3px de deslocamento + 8px de halo.
const RING = 15
const FILLERS = 14

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** M3U fictária: "Canais Curto" (2), "Canais Longo" (30) e vários grupos de 1 canal (trilha longa). */
function buildM3u() {
  const lines = ['#EXTM3U']
  const add = (group, name, n) =>
    lines.push(`#EXTINF:-1 group-title="${group}",${name}`, `http://127.0.0.1:59998/stream/c${n}.mp4`)
  let n = 0
  for (const name of ['Curto 1', 'Curto 2']) add('Canais Curto', name, (n += 1))
  for (let i = 1; i <= 30; i += 1) add('Canais Longo', `Longo ${String(i).padStart(2, '0')}`, (n += 1))
  for (let i = 1; i <= FILLERS; i += 1) add(`Canais Filler ${String(i).padStart(2, '0')}`, `Fill ${i}`, (n += 1))
  return lines.join('\n')
}

function startFixtureServer() {
  const body = buildM3u()
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
  await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: LISTA, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 8000 })
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function openLiveTv(page) {
  await page.waitForSelector('.source-card', { timeout: 8000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await openViaTopbar(page, 'live')
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
}

async function press(page, key, times = 1) {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

/** Com o foco na trilha, anda ↑/↓ até a entrada pedida (nunca passa do topo para a topbar). */
async function gotoTrail(page, label) {
  const labels = await page.locator('.live-column-groups .side-category-nav-label').allTextContents()
  const target = labels.indexOf(label)
  if (target < 0) throw new Error(`entrada "${label}" não existe na trilha`)
  for (let i = 0; i < labels.length + 2; i += 1) {
    const focused = (await page.locator('.live-column-groups .tv-focus .side-category-nav-label').first().textContent({ timeout: 4000 })) ?? ''
    const at = labels.indexOf(focused)
    if (at === target) return
    await page.keyboard.press(at > target ? 'ArrowUp' : 'ArrowDown')
  }
  throw new Error(`não cheguei em "${label}" na trilha`)
}

const rectOf = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
  })

/** O anel (RING px em volta) da linha focada cabe dentro do contêiner rolável. */
async function ringInside(page, rowSelector, containerSelector) {
  const row = await rectOf(page, rowSelector)
  const box = await rectOf(page, containerSelector)
  return (
    row.top - RING >= box.top - 0.5 &&
    row.bottom + RING <= box.bottom + 0.5 &&
    row.left - RING >= box.left - 0.5 &&
    row.right + RING <= box.right + 0.5
  )
}

const frameFlags = (page, scope) =>
  page.locator(`${scope} .live-scroll-frame`).first().evaluate((el) => ({
    above: el.classList.contains('is-more-above'),
    below: el.classList.contains('is-more-below'),
  }))

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/lista.m3u`

  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true },
  )
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  await page.route('**/stream/**', () => {})
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    await addSource(page, m3uUrl)
    await openLiveTv(page)
    await page.waitForSelector('.live-column-groups .side-category-nav-item', { timeout: 8000 })

    console.log('=== Painéis: larguras e cabeçalho (FR-007) ===')
    const groups = await rectOf(page, '.live-column-groups')
    const channels = await rectOf(page, '.live-column-channels')
    assert(Math.abs(groups.width - 280) <= 1, `coluna de categorias com 280px (${groups.width.toFixed(1)})`)
    assert(Math.abs(channels.width - 400) <= 1, `coluna de canais com 400px (${channels.width.toFixed(1)})`)
    assert(
      ((await page.locator('.live-column-groups .live-panel-sub').textContent()) ?? '').trim() === 'Grupos',
      'cabeçalho da trilha com o subtítulo "Grupos"',
    )

    console.log('=== Trilha: indicador de continuação e anel de foco ===')
    assert(
      (await page.locator('.live-column-groups .side-category-nav-tile').count()) > 0,
      'cada entrada da trilha tem tile',
    )
    // Foco no 1º item da trilha (★ Favoritos): anel inteiro, só "continua abaixo".
    await gotoTrail(page, 'Favoritos') // topo real da trilha (a próxima ↑ iria para a topbar)
    let flags = await frameFlags(page, '.live-column-groups')
    assert(!flags.above && flags.below, `trilha no topo: só "continua abaixo" (above=${flags.above}, below=${flags.below})`)
    assert(
      await ringInside(page, '.live-column-groups .side-category-nav-item.tv-focus', '.live-column-groups .live-scroll-area'),
      'anel do 1º item da trilha inteiro dentro do contêiner',
    )
    await shot(page, '01-trilha-topo')
    // Meio: ambos os lados, e o item focado fora das duas faixas de degradê.
    await press(page, 'ArrowDown', 12) // do topo: o foco desce e a trilha rola, sobrando itens dos dois lados
    await page.waitForTimeout(200)
    flags = await frameFlags(page, '.live-column-groups')
    assert(flags.above && flags.below, `trilha no meio: ambos os lados (above=${flags.above}, below=${flags.below})`)
    {
      const frame = await rectOf(page, '.live-column-groups .live-scroll-frame')
      const row = await rectOf(page, '.live-column-groups .side-category-nav-item.tv-focus')
      assert(
        row.top >= frame.top + 48 - 0.5 && row.bottom <= frame.bottom - 48 + 0.5,
        'item focado da trilha fora das faixas de degradê (SC-006)',
      )
    }

    // Desce até o fim da trilha: só "continua acima".
    await press(page, 'ArrowDown', FILLERS + 6)
    await page.waitForTimeout(200)
    flags = await frameFlags(page, '.live-column-groups')
    assert(flags.above && !flags.below, `trilha no fim: só "continua acima" (above=${flags.above}, below=${flags.below})`)
    assert(
      await ringInside(page, '.live-column-groups .side-category-nav-item.tv-focus', '.live-column-groups .live-scroll-area'),
      'anel do último item da trilha inteiro dentro do contêiner',
    )
    console.log('=== Categoria curta: nenhum indicador (SC-006) ===')
    await gotoTrail(page, 'Canais Curto')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    flags = await frameFlags(page, '.live-column-channels')
    assert(!flags.above && !flags.below, `lista que cabe inteira: nenhum indicador (above=${flags.above}, below=${flags.below})`)

    console.log('=== Destaque: largura e conteúdo (SC-001, FR-001) ===')
    const body = await rectOf(page, '.live-body')
    const hero = await rectOf(page, '.live-preview-panel .live-hero')
    assert(hero.width / body.width >= 0.55, `destaque ocupa ≥ 55% da largura útil (${((hero.width / body.width) * 100).toFixed(1)}%)`)
    assert(
      ((await page.locator('.live-hero-name').textContent()) ?? '').trim() === 'Curto 1',
      'destaque mostra o nome do canal focado',
    )
    assert(
      ((await page.locator('.live-hero-live').textContent()) ?? '').includes('Ao vivo'),
      'sem EPG, a linha do destaque é só "Ao vivo"',
    )
    assert((await page.locator('.live-schedule-card').count()) === 0, 'sem EPG, nenhum cartão de programação')
    await shot(page, '02-destaque-sem-logo')

    console.log('=== Destaque informativo (feature 049): sem ações; ícone de Guia ao lado da lupa ===')
    assert((await page.locator('.live-preview-panel button').count()) === 0, 'o destaque não tem botões nem ação focável')
    await page.keyboard.press('ArrowUp') // 1º canal -> lupa
    await page.keyboard.press('ArrowRight') // lupa -> ícone de Guia completo
    assert((await page.locator('.live-guide-button.tv-focus').count()) === 1, '↑ e → chegam ao ícone de Guia completo')
    await shot(page, '03-icone-guia')
    await page.keyboard.press('ArrowDown') // volta ao canal
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 4000 })
    console.log('=== Lista longa: indicadores e anel (SC-002, SC-006) ===')
    await page.keyboard.press('Escape')
    await gotoTrail(page, 'Canais Longo')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    flags = await frameFlags(page, '.live-column-channels')
    assert(!flags.above && flags.below, `lista no topo: só "continua abaixo" (above=${flags.above}, below=${flags.below})`)
    assert(
      await ringInside(page, '.live-channel-row.tv-focus', '.live-channel-list'),
      'anel do 1º canal inteiro dentro do contêiner',
    )
    await shot(page, '04-canais-topo')
    await press(page, 'ArrowDown', 12)
    await page.waitForTimeout(250)
    flags = await frameFlags(page, '.live-column-channels')
    assert(flags.above && flags.below, `lista no meio: ambos os lados (above=${flags.above}, below=${flags.below})`)
    {
      const frame = await rectOf(page, '.live-column-channels .live-scroll-frame')
      const row = await rectOf(page, '.live-channel-row.tv-focus')
      assert(
        row.top >= frame.top + 48 - 0.5 && row.bottom <= frame.bottom - 48 + 0.5,
        'canal focado fora das faixas de degradê (FR-021)',
      )
    }
    await press(page, 'ArrowDown', 40)
    await page.waitForTimeout(250)
    flags = await frameFlags(page, '.live-column-channels')
    assert(flags.above && !flags.below, `lista no fim: só "continua acima" (above=${flags.above}, below=${flags.below})`)
    assert(
      ((await page.locator('.live-channel-row.tv-focus .live-item-name').textContent()) ?? '').includes('Longo 30'),
      'o foco chegou ao último canal',
    )
    assert(
      await ringInside(page, '.live-channel-row.tv-focus', '.live-channel-list'),
      'anel do último canal inteiro dentro do contêiner',
    )
    await shot(page, '05-canais-fim')

    console.log('=== "Todos": o rótulo do grupo não esconde o nome do canal ===')
    await page.keyboard.press('Escape')
    await gotoTrail(page, 'Todos')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-channels .live-item-group', { timeout: 8000 })
    {
      const name = await rectOf(page, '.live-column-channels .live-channel-row .live-item-name')
      assert(name.width >= 60, `em "Todos" o nome do canal tem largura útil (${name.width.toFixed(0)}px)`)
    }
    await shot(page, '06-todos')
    // Volta a "Canais Longo" no último canal, para o zapping abaixo.
    await page.keyboard.press('Escape')
    await gotoTrail(page, 'Canais Longo')
    await page.keyboard.press('Enter')
    await press(page, 'ArrowDown', 40)
    console.log('=== Zapping: mesmos painéis, canal tocando marcado (FR-014) ===')
    await page.keyboard.press('Enter') // toca o canal focado (último)
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await page.waitForSelector('.player-video', { timeout: 8000 })
    await page.evaluate(() => document.querySelector('.player-video')?.dispatchEvent(new Event('playing')))
    await page.keyboard.press('Enter') // abre o zapping
    await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
    assert((await page.locator('.player-zap-columns .live-channel-row.is-playing').count()) === 1, 'uma linha marcada como "tocando"')
    assert((await page.locator('.player-zap-columns .live-hero').count()) === 0, 'o zapping não tem destaque')
    await shot(page, '07-zapping')

    assert(pageErrors.length === 0, `nenhum erro de página durante o roteiro${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
    await shot(page, 'erro').catch(() => {})
  } finally {
    await browser.close()
    server.close()
  }

  console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} falha(s).`)
  process.exit(failures === 0 ? 0 : 1)
}

run()
