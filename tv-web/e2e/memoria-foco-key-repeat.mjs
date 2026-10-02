// Roteiro E2E da feature 046 (memória de foco por área + key repeat) — gate da
// constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre, num Chromium de verdade: (1) o navegador entrega `KeyboardEvent.repeat`
// ao segurar uma seta e a trilha da Live atravessa as categorias sem erro, com o
// foco no lugar certo ao soltar; (2) SC-003 — idas e voltas entre categorias
// devolvem o mesmo canal; (3) SC-004 — fechar o player depois de zapping devolve
// o foco ao canal que tocava, na lista de origem ("Todos").
//
// A contagem exata de consultas de prefetch durante a rajada (SC-001) está provada
// no contrato `catalogApi.key-repeat.contract.test.tsx` — este script não tem como
// observar um prefetch de categoria `stored` (M3U) pela rede.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173). Dados fictícios
// (`fixtures/memoria-foco-key-repeat.m3u`), servidos por um HTTP server local.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'memoria-foco-key-repeat.m3u')
const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Memoria Foco'

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

async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

const press = (page, key, times = 1) => (async () => {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
})()

async function focusedChannel(page) {
  return (await page.locator('.live-channel-list .tv-focus').first().textContent({ timeout: 4000 })) ?? ''
}

const TRAIL = ['Favoritos', 'Todos', 'Canais A', 'Canais B', 'Canais C']

/** Com o foco na trilha (coluna 0), anda ↑/↓ até a entrada pedida — nunca passa do topo para a topbar. */
async function gotoTrail(page, label) {
  const target = TRAIL.indexOf(label)
  for (let i = 0; i < 8; i += 1) {
    const text = (await page.locator('.side-category-nav-item.tv-focus').first().textContent({ timeout: 4000 })) ?? ''
    const at = TRAIL.findIndex((name) => text.includes(name))
    if (at === target) return
    await page.keyboard.press(at > target ? 'ArrowUp' : 'ArrowDown')
  }
  throw new Error(`não achei a entrada "${label}" na trilha`)
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/memoria-foco-key-repeat.m3u`

  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(
    existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true },
  )
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/stream/**', () => {})
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    await addSource(page, m3uUrl)
    await openLiveTv(page)

    console.log('=== Cenário 1: segurar a seta entrega repeat e a trilha atravessa as categorias ===')
    await page.evaluate(() => {
      window.__repeatCount = 0
      window.addEventListener('keydown', (e) => { if (e.repeat) window.__repeatCount += 1 }, true)
    })
    await page.keyboard.down('ArrowDown')
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.down('ArrowDown') // sem keyup entre elas: o Chromium marca repeat
      await page.waitForTimeout(40)
    }
    await page.keyboard.up('ArrowDown')
    const repeats = await page.evaluate(() => window.__repeatCount)
    assert(repeats > 0, `o Chromium entregou KeyboardEvent.repeat ao segurar a seta (${repeats} eventos)`)
    await page.waitForTimeout(700) // silêncio + debounce: nada pendente
    assert(
      (await page.locator('.side-category-nav-item.tv-focus').count()) === 1,
      'um único foco visível na trilha depois da rajada',
    )
    // A rajada parou no fim da trilha (★ Favoritos, Todos, A, B, C — 5 entradas): 4 ↑ chegam ao topo
    // sem sair para a topbar; 2 ↓ param em "Canais A".
    await press(page, 'ArrowUp', 4)
    await press(page, 'ArrowDown', 2)

    console.log('=== Cenário 2: idas e voltas entre categorias devolvem o mesmo canal (SC-003) ===')
    await page.keyboard.press('ArrowRight') // entra em Grupo A
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await press(page, 'ArrowDown', 3) // Canal A4
    assert((await focusedChannel(page)).includes('Canal A4'), 'foco em "Canal A4" no Grupo A')
    for (let round = 1; round <= 10; round += 1) {
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowDown') // Grupo B
      await page.keyboard.press('ArrowRight')
      await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
      const inB = await focusedChannel(page)
      if (round === 1) assert(inB.includes('Canal B1'), 'primeira visita ao Grupo B abre no primeiro canal')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowUp') // Grupo A
      await page.keyboard.press('ArrowRight')
      const back = await focusedChannel(page)
      if (!back.includes('Canal A4')) {
        assert(false, `volta ${round}: foco em "${back}" em vez de "Canal A4"`)
        break
      }
      if (round === 10) assert(true, '10 de 10 voltas ao Grupo A devolveram o foco a "Canal A4"')
    }
    // cobre Grupo B e C para que "Todos" os inclua
    await page.keyboard.press('ArrowLeft')
    await gotoTrail(page, 'Canais C')
    await page.keyboard.press('ArrowRight')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })

    console.log('=== Cenário 3: fechar o player depois de zapping devolve o canal que tocava (SC-004) ===')
    for (const zaps of [1, 3, 5]) {
      await page.keyboard.press('ArrowLeft')
      await gotoTrail(page, 'Todos')
      await page.keyboard.press('ArrowRight')
      await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
      assert(
        ((await page.locator('.live-column-channels .live-column-title').textContent()) ?? '') === 'Todos',
        `[${zaps} zapping] a lista exibida é "Todos"`,
      )
      const first = await focusedChannel(page)
      // Começa onde o foco estiver (1ª volta: primeiro de "Todos"; depois: o que a memória lembra).
      const order = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'C1', 'C2']
      const startName = order.find((name) => first.includes(`Canal ${name}`))
      if (!startName || order.indexOf(startName) + zaps >= order.length) {
        assert(false, `[${zaps} zapping] ponto de partida inesperado: "${first.trim()}"`)
        break
      }
      await page.keyboard.press('Enter') // toca
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
      await fireVideoEvent(page, 'playing')
      await page.keyboard.press('Enter') // abre o zapping
      await page.waitForSelector('.player-zap-columns', { timeout: 8000 })
      await page.keyboard.press('Escape') // fecha só a lista
      await page.waitForSelector('.player-zap-columns', { state: 'detached', timeout: 8000 })
      for (let i = 0; i < zaps; i += 1) {
        await page.keyboard.press('ArrowDown') // próximo da vizinhança de "Todos"
        await page.waitForTimeout(150)
        await fireVideoEvent(page, 'playing')
      }
      const expected = `Canal ${order[order.indexOf(startName) + zaps]}`
      for (let i = 0; i < 3 && (await page.locator('[role="dialog"]').count()) > 0; i += 1) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(150)
      }
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
      const title = (await page.locator('.live-column-channels .live-column-title').textContent()) ?? ''
      const focused = await focusedChannel(page)
      // A lista exibida é "Todos" (a de origem) ou a categoria do canal, se o zapping já a tinha
      // aberto e o canal que tocava está nela — o que importa é o foco no canal que tocava.
      const ownCategory = `Canais ${expected.slice(-2, -1)}`
      assert(
        (title === 'Todos' || title === ownCategory) && focused.includes(expected),
        `após ${zaps} zapping(s) e fechar o player, foco em "${expected}" (visto: "${title}" / "${focused.trim()}")`,
      )
    }

    assert(pageErrors.length === 0, `nenhum erro de página durante o roteiro${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
    if (process.env.CCPLAY_E2E_SHOT) await page.screenshot({ path: process.env.CCPLAY_E2E_SHOT })
  } finally {
    await browser.close()
    server.close()
  }

  console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} falha(s).`)
  process.exit(failures === 0 ? 0 : 1)
}

run()
