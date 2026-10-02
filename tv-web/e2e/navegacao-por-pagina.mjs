// Roteiro E2E da feature 049 (navegação por página nas listas) — gate da
// constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Num Chromium de verdade, a 1920×1080, mede o que o jsdom não vê: a lista rola
// uma página e o foco cai na MESMA linha da tela; → e ← nunca entram nem tocam
// (só OK); RETURN volta à trilha; o ícone de Guia ao lado da lupa; o zapping com
// RETURN em camadas; a trilha de Filmes pagina e a grade segue cartão a cartão;
// a seta segurada atravessa páginas sem erro de página.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173) — confira quem
// escuta a porta. A lista M3U é fictícia, gerada aqui e servida por um HTTP local.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Navegacao Pagina'
const SHOTS = path.join(process.cwd(), 'test-results', 'navegacao-por-pagina')
const LONGO = 60
const FILLERS = 18
const FILMES = 16

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** M3U fictícia: grupos de canais (precisam conter "canais") e de filmes (conter "filmes"). */
function buildM3u() {
  const lines = ['#EXTM3U']
  let n = 0
  const add = (group, name, ext) =>
    lines.push(`#EXTINF:-1 group-title="${group}",${name}`, `http://127.0.0.1:59998/stream/p${(n += 1)}.${ext}`)
  for (let i = 1; i <= LONGO; i += 1) add('Canais Longo', `Longo ${String(i).padStart(2, '0')}`, 'mp4')
  for (let i = 1; i <= FILLERS; i += 1) add(`Canais Filler ${String(i).padStart(2, '0')}`, `Fill ${i}`, 'mp4')
  for (let c = 1; c <= FILMES; c += 1) {
    const cat = `Filmes ${String(c).padStart(2, '0')}`
    add(cat, `Filme ${String(c).padStart(2, '0')}A`, 'mp4')
    add(cat, `Filme ${String(c).padStart(2, '0')}B`, 'mp4')
  }
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
  // Da lista de canais da Live (049: ←/→ paginam), RETURN leva à trilha; dali ↑ sobe até a topbar.
  if ((await page.locator('.live-channel-row.tv-focus').count()) > 0) await page.keyboard.press('Escape')
  for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function press(page, key, times = 1) {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

const trailLabels = (page, scope) => page.locator(`${scope} .side-category-nav-label`).allTextContents()
const focusedTrail = async (page, scope) =>
  ((await page.locator(`${scope} .side-category-nav-item.tv-focus .side-category-nav-label`).first().textContent({ timeout: 4000 })) ?? '').trim()
const focusedChannel = async (page) =>
  ((await page.locator('.live-channel-row.tv-focus .live-item-name').first().textContent({ timeout: 4000 })) ?? '').trim()

/** Distância (px) do topo do item focado ao topo do contêiner rolável. */
const relativeTop = (page, itemSelector, containerSelector) =>
  page.evaluate(
    ([item, container]) => {
      const i = document.querySelector(item)
      const c = document.querySelector(container)
      return i && c ? i.getBoundingClientRect().top - c.getBoundingClientRect().top : null
    },
    [itemSelector, containerSelector],
  )

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
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups .side-category-nav-item', { timeout: 8000 })

    console.log('=== Trilha: → pagina uma tela e NÃO entra; ← volta (US1, FR-001/FR-004) ===')
    const labels = await trailLabels(page, '.live-column-groups')
    const startLabel = await focusedTrail(page, '.live-column-groups')
    const start = labels.indexOf(startLabel)
    await page.keyboard.press('ArrowRight')
    const afterLabel = await focusedTrail(page, '.live-column-groups')
    const moved = labels.indexOf(afterLabel) - start
    assert(moved >= 2, `→ avançou uma página da trilha (${moved} entradas)`)
    assert(
      (await page.locator('.live-column-channels .live-item-name').count()) === 0,
      '→ na trilha não abriu nenhuma lista de canais',
    )
    await page.keyboard.press('ArrowLeft')
    assert((await focusedTrail(page, '.live-column-groups')) === startLabel, '← voltou à entrada de partida (uma página atrás)')
    await shot(page, '01-trilha')

    console.log('=== OK entra; → pagina canais na MESMA linha; para no último; ← volta (US1/US2) ===')
    // Entra em "Canais Longo" pela trilha (↓ até ela e OK).
    const target = labels.indexOf('Canais Longo')
    const here = labels.indexOf(await focusedTrail(page, '.live-column-groups'))
    await press(page, target > here ? 'ArrowDown' : 'ArrowUp', Math.abs(target - here))
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 8000 })
    assert((await focusedChannel(page)) === 'Longo 01', 'OK entrou em "Canais Longo", foco no 1º canal')
    await press(page, 'ArrowDown', 2) // 3ª linha da tela (índice 2)
    const row = '.live-channel-row.tv-focus'
    const list = '.live-channel-list'
    const before = await relativeTop(page, row, list)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(250)
    const after = await relativeTop(page, row, list)
    const nameAfter = await focusedChannel(page)
    const jump = Number(nameAfter.replace('Longo ', '')) - 3
    assert(jump >= 3, `→ avançou uma página de canais (${jump} canais)`)
    assert(before !== null && after !== null && Math.abs(after - before) <= 2, `o foco ficou na mesma linha da tela (${before?.toFixed(0)}px → ${after?.toFixed(0)}px)`)
    assert((await page.locator('[role="dialog"]').count()) === 0, '→ nunca tocou nada')
    await shot(page, '02-canais-pagina')

    await press(page, 'ArrowRight', 20) // além do fim
    await page.waitForTimeout(250) // o foco da página é aplicado no quadro seguinte
    assert((await focusedChannel(page)) === `Longo ${LONGO}`, `→ para no último canal (Longo ${LONGO})`)
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(250)
    const back = Number((await focusedChannel(page)).replace('Longo ', ''))
    assert(back < LONGO - 2, `← volta uma página (Longo ${back})`)
    await press(page, 'ArrowLeft', 20)
    await page.waitForTimeout(250)
    assert((await focusedChannel(page)) === 'Longo 01', '← para no primeiro canal')

    console.log('=== OK toca, RETURN volta à trilha, OK reentra no mesmo canal (US2, SC-003) ===')
    await press(page, 'ArrowRight', 2)
    await page.waitForTimeout(250)
    const remembered = await focusedChannel(page)
    await page.keyboard.press('Enter') // toca
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert((await focusedChannel(page)) === remembered, `fechar o player devolveu o foco a "${remembered}"`)
    await page.keyboard.press('Escape') // RETURN: lista -> trilha
    assert((await focusedTrail(page, '.live-column-groups')) === 'Canais Longo', 'RETURN voltou à trilha, na categoria aberta')
    await page.keyboard.press('Enter')
    assert((await focusedChannel(page)) === remembered, 'OK reentrou e devolveu o canal lembrado')

    console.log('=== Ícone de Guia ao lado da lupa (US3, FR-007/FR-008) ===')
    assert((await page.locator('.live-preview-panel button').count()) === 0, 'o destaque não tem botões')
    await press(page, 'ArrowLeft', 20)
    await page.waitForTimeout(250)
    await page.keyboard.press('ArrowUp') // lupa
    assert((await page.locator('.search-icon-button.tv-focus').count()) === 1, '↑ do 1º canal foca a lupa')
    await page.keyboard.press('ArrowRight')
    assert(
      (await page.locator('.live-guide-button.tv-focus').getAttribute('aria-label')) === 'Guia completo',
      '→ na lupa foca o ícone de Guia completo',
    )
    await shot(page, '03-icone-guia')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.epg-guide', { timeout: 8000 })
    assert(true, 'OK no ícone abriu o Guia completo')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.epg-guide', { state: 'detached', timeout: 8000 })
    assert((await focusedChannel(page)) === 'Longo 01', 'RETURN do guia devolveu o foco ao canal de origem')

    console.log('=== Zapping: → pagina, RETURN em camadas (FR-001/FR-006) ===')
    await page.keyboard.press('Enter') // toca Longo 01
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await page.waitForSelector('.player-video', { timeout: 8000 })
    await page.evaluate(() => document.querySelector('.player-video')?.dispatchEvent(new Event('playing')))
    await page.keyboard.press('Enter') // abre o zapping
    await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
    await page.waitForSelector('.player-zap-columns .live-channel-row.tv-focus', { timeout: 8000 })
    const zapStart = await page.locator('.player-zap-columns .live-channel-row.tv-focus .live-item-name').first().textContent()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    const zapAfter = await page.locator('.player-zap-columns .live-channel-row.tv-focus .live-item-name').first().textContent()
    assert(zapAfter !== zapStart, `→ no zapping paginou ("${zapStart?.trim()}" → "${zapAfter?.trim()}")`)
    assert((await page.locator('.player-zap-columns .live-guide-button').count()) === 0, 'o zapping não tem ícone de Guia')
    await page.keyboard.press('Escape') // lista de canais -> trilha
    assert((await page.locator('.player-zap-columns').count()) === 1, 'RETURN no zapping foi à trilha, sem fechar a lista')
    await page.keyboard.press('Escape') // trilha -> fecha só a lista
    await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: 8000 })
    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })

    console.log('=== Seta segurada atravessa páginas, para no fim, sem erro (SC-006) ===')
    // O zapping foi fechado pela trilha: o foco da tela voltou à trilha, na entrada de origem.
    await page.waitForSelector('.live-column-groups .side-category-nav-item.tv-focus', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 8000 })
    await page.keyboard.down('ArrowRight')
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.down('ArrowRight') // sem keyup: o Chromium marca repeat
      await page.waitForTimeout(40)
    }
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(300)
    assert((await focusedChannel(page)).length > 0, 'um único foco na lista depois da rajada')
    assert((await page.locator('.tv-focus').count()) >= 1, 'o foco continua visível')

    console.log('=== Filmes: a trilha pagina; OK entra; a grade anda cartão a cartão; ← na 1ª coluna volta (US4) ===')
    await openViaTopbar(page, 'movies')
    await page.waitForSelector('.vod-side-nav .side-category-nav-item', { timeout: 8000 })
    const mLabels = await trailLabels(page, '.vod-side-nav')
    const mStart = mLabels.indexOf(await focusedTrail(page, '.vod-side-nav'))
    await page.keyboard.press('ArrowRight')
    const mAfter = mLabels.indexOf(await focusedTrail(page, '.vod-side-nav'))
    assert(mAfter - mStart >= 2, `→ pagina a trilha de Filmes (${mAfter - mStart} entradas)`)
    assert((await page.locator('.vod-grid .content-card').count()) === 0, '→ não abriu categoria nenhuma')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-hero-title', { timeout: 8000 })
    const first = (await page.locator('.vod-hero-title').textContent())?.trim()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
    const second = (await page.locator('.vod-hero-title').textContent())?.trim()
    assert(first !== second, `na grade, → anda cartão a cartão ("${first}" → "${second}")`)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft') // 1ª coluna: volta à trilha
    await page.waitForSelector('.vod-side-nav .side-category-nav-item.tv-focus', { timeout: 4000 })
    assert(true, '← na 1ª coluna da grade voltou à trilha')
    await shot(page, '04-filmes')

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
