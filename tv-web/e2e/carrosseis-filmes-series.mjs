// Roteiro E2E da feature 053 (tela hero de Filmes e Séries com carrosséis por categoria, lista lateral paginada/recolhível e slots
// reservados "Em breve").
//
// Mede, a 1920×1080 (e 2200×1000 com E2E_W/E2E_H): ordem das fileiras pelo foco, "Ver tudo" abrindo a grade e voltando ao
// mesmo carrossel, slots sem rede externa, lista recolhida só nos cards (largura) e paginação com ← →, ↑ da 1ª fileira saindo da área de
// conteúdo (topbar), pilha virtualizada com ~300 categorias e altura disponível sob o hero. Capturas em
// `test-results/carrosseis-filmes-series/`.
//
// Pré-requisito: `npm run dev` em http://localhost:5173 (confira que ninguém mais escuta a 5173). Dados fictícios,
// servidos por este script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { enterRows, ensureSideFocus, focusedRowLabel, openShowcase, openViaTopbar } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Carrosséis'
const SHOTS = path.join(process.cwd(), 'test-results', 'carrosseis-filmes-series')
const EXTRA_CATEGORIES = 300
const RING = 15

let failures = 0
let step = ''

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Painel Xtream fictício: "Curto" (3 filmes), "Longo" (40), 300 categorias de 2 filmes e 1 série. */
function startPanel() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (url.pathname === '/capa.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(CAPA)
        return
      }
      if (url.pathname !== '/player_api.php') {
        res.writeHead(404)
        res.end('não encontrado')
        return
      }
      const base = `http://127.0.0.1:${server.address().port}`
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return res.end('[]')
      if (action === 'get_vod_categories') {
        const categorias = [
          { category_id: '10', category_name: 'Filmes | Curto' },
          { category_id: '11', category_name: 'Filmes | Longo' },
        ]
        for (let n = 1; n <= EXTRA_CATEGORIES; n += 1) categorias.push({ category_id: String(1000 + n), category_name: `Filmes | Cat ${String(n).padStart(3, '0')}` })
        return res.end(JSON.stringify(categorias))
      }
      if (action === 'get_vod_streams') {
        const filmes = [1, 2, 3].map((n) => ({ name: `Curto ${n}`, stream_id: n, category_id: '10', stream_icon: `${base}/capa.png`, added: String(1700000000 + n) }))
        for (let i = 1; i <= 40; i += 1)
          filmes.push({ name: `Longo ${String(i).padStart(2, '0')}`, stream_id: 100 + i, category_id: '11', stream_icon: `${base}/capa.png`, added: String(1600000000 + i * 1000) })
        for (let n = 1; n <= EXTRA_CATEGORIES; n += 1)
          for (let k = 1; k <= 2; k += 1)
            filmes.push({ name: `Cat${n} Filme ${k}`, stream_id: 10000 + n * 10 + k, category_id: String(1000 + n), stream_icon: `${base}/capa.png`, added: String(1500000000 + n) })
        const wanted = url.searchParams.get('category_id')
        return res.end(JSON.stringify(wanted ? filmes.filter((f) => f.category_id === wanted) : filmes))
      }
      if (action === 'get_series_categories') return res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries | Drama' }]))
      if (action === 'get_series') return res.end(JSON.stringify([{ name: 'Série Exemplo', series_id: '500', category_id: '20' }]))
      return res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function addSource(page, port) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaXtream(page, { nome: LISTA, servidor: `http://127.0.0.1:${port}`, usuario: 'usuario', senha: 'senha' })
  await page.waitForSelector('text=/Concluída/', { timeout: 30000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 8000 })
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}
const rectOf = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
  })

/** Depois de abrir a tela pela topbar o foco pode estar nela: ↓ entra no conteúdo (a lista lateral ou a 1ª fileira). */
async function enterContent(page) {
  if ((await page.locator('.vod-showcase .tv-focus').count()) === 0) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
}

/** Percorre as fileiras com ↓ a partir do foco atual e devolve os rótulos na ordem. */
async function walkRows(page, max = 14) {
  const labels = []
  for (let i = 0; i < max; i += 1) {
    const label = await focusedRowLabel(page)
    if (label === null || labels.at(-1) === label) break
    labels.push(label)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(40)
  }
  return labels
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const server = await startPanel()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const page = await (
    await browser.newContext({ locale: 'pt-BR', viewport: { width: Number(process.env.E2E_W ?? 1920), height: Number(process.env.E2E_H ?? 1080) } })
  ).newPage()
  const pageErrors = []
  const externalRequests = []
  page.on('pageerror', (error) => { pageErrors.push(`[${step}] ${String(error).slice(0, 90)}`); if (pageErrors.length === 1) console.error(String(error.stack).split('\n').slice(0, 14).join('\n')) })
  const panelCalls = []
  page.on('request', (request) => {
    const parsed = new URL(request.url())
    if (parsed.pathname === '/player_api.php') panelCalls.push(`${parsed.searchParams.get('action')}:${parsed.searchParams.get('category_id') ?? '*'}`)
    const host = parsed.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') externalRequests.push(request.url())
  })

  try {
    console.log(step = '=== Fonte fictícia ===')
    await addSource(page, server.address().port)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log(step = '=== Tela hero de Filmes ===')
    await openShowcase(page, 'movies')
    await page.waitForTimeout(800)
    await shot(page, '01-hero-filmes')
    const panelWidthOpen = (await rectOf(page, '.vod-side-panel')).width
    const hero = await rectOf(page, '.vod-hero-band').catch(() => null)
    const frame = await rectOf(page, '.vod-showcase-rows')
    console.log(`  · hero ${hero ? Math.round(hero.height) : 0}px; área das fileiras ${Math.round(frame.height)}px de altura`)
    const firstRow = await rectOf(page, '.vod-showcase section.vod-row')
    assert(firstRow.bottom <= frame.bottom + 1 && firstRow.top >= frame.top - 1, 'a 1ª fileira aparece inteira sob o hero (altura disponível)')

    console.log(step = '=== Ordem das fileiras pelo foco ===')
    await enterRows(page) // lista lateral → cards (→ pagina a lista até o fim)
    const labels = await walkRows(page, 8)
    console.log(`  · ${labels.join(' | ')}`)
    const expectedStart = ['Top 10 filmes da semana', 'Bem avaliados', 'Porque você assistiu']
    assert(expectedStart.every((label, i) => labels[i] === label), 'sem histórico/favoritos/recentes: Top 10 → Bem avaliados → Porque você assistiu → categorias')
    assert(labels.includes('Curto') && labels.includes('Longo'), 'um carrossel por categoria da fonte (Curto, Longo)')
    assert(labels.indexOf('Curto') < labels.indexOf('Longo'), 'categorias na ordem da fonte')

    console.log(step = '=== Slot "Em breve": focável, sem navegar e sem rede externa ===')
    await press(page, 'ArrowUp', 8)
    for (let i = 0; i < 10 && (await focusedRowLabel(page)) !== 'Top 10 filmes da semana'; i += 1) await press(page, 'ArrowDown')
    assert((await focusedRowLabel(page)) === 'Top 10 filmes da semana', 'foco no slot Top 10')
    const slotText = await page.locator('.vod-showcase .vod-slot-card.tv-focus').first().textContent()
    assert(/Em breve/.test(slotText ?? ''), 'o slot mostra "Em breve"')
    await shot(page, '02-slot-top10')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    assert((await page.locator('.vod-showcase').count()) === 1 && (await focusedRowLabel(page)) === 'Top 10 filmes da semana', 'OK no slot não navega nem tira o foco')
    const ringBox = await rectOf(page, '.vod-showcase-rows')
    const slotBox = await rectOf(page, '.vod-showcase .vod-slot-card.tv-focus')
    assert(slotBox.left - RING >= ringBox.left - 0.5 && slotBox.right + RING <= ringBox.right + 0.5, 'anel de foco do slot cabe na área das fileiras')

    console.log(step = '=== ↑ da 1ª fileira sai da área de conteúdo (topbar) ===')
    await press(page, 'ArrowUp')
    await page.waitForTimeout(200)
    assert((await page.locator('.vod-showcase .tv-focus').count()) === 0, 'o foco foi para a topbar')
    await press(page, 'ArrowDown')
    assert((await page.locator('.vod-showcase .tv-focus').count()) === 1, 'e volta ao conteúdo com ↓ (um só foco)')

    console.log(step = '=== "Ver tudo" abre a grade e RETURN volta ao mesmo carrossel ===')
    for (let i = 0; i < 12 && (await focusedRowLabel(page)) !== 'Longo'; i += 1) await press(page, 'ArrowDown')
    assert((await focusedRowLabel(page)) === 'Longo', 'foco no carrossel "Longo"')
    await page
      .waitForSelector('section.vod-row[aria-label="Longo"] .content-card', { timeout: 20000 })
      .catch(async (error) => {
        const html = await page.locator('section.vod-row[aria-label="Longo"]').first().evaluate((el) => el.outerHTML.slice(0, 600))
        console.error(`  · DIAGNÓSTICO (carrossel sem itens): ${html}`)
        console.error(`  · chamadas ao painel: ${panelCalls.join(' ')}`)
        throw error
      })
    await page.waitForTimeout(500)
    await shot(page, '03-carrossel-longo')
    {
      const area = await rectOf(page, '.vod-showcase-rows')
      const card = await rectOf(page, '.vod-showcase .tv-focus')
      console.log(
        '  · rolagem:',
        JSON.stringify(
          await page.evaluate(() => {
            const el = document.querySelector('.vod-showcase-rows')
            const inner = document.querySelector('.vod-showcase-rows-inner')
            const row = document.querySelector('section.vod-row[aria-label="Longo"]')
            return { top: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight, inner: inner.getBoundingClientRect().height, rowTransform: row.style.transform }
          }),
        ),
      )
      console.log(`  · card focado ${Math.round(card.top)}–${Math.round(card.bottom)}px; área ${Math.round(area.top)}–${Math.round(area.bottom)}px`)
      assert(card.top - RING >= area.top - 0.5 && card.bottom + RING <= area.bottom + 0.5, 'o card focado do carrossel (anel incluído) cabe inteiro na área das fileiras')
    }
    for (let i = 0; i < 16; i += 1) {
      if ((await page.locator('.vod-showcase .vod-see-all-card.tv-focus').count()) > 0) break
      await press(page, 'ArrowRight')
    }
    assert((await page.locator('.vod-showcase .vod-see-all-card.tv-focus').count()) === 1, 'cheguei no cartão "Ver tudo" do carrossel')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 10000 })
    assert((await page.locator('.vod-side-panel, .vod-hero-band').count()) === 0, 'abriu a grade (sem sidebar nem hero)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await page.waitForTimeout(400)
    assert((await focusedRowLabel(page)) === 'Longo', 'RETURN volta ao carrossel "Longo"')
    assert((await page.locator('.vod-showcase .vod-see-all-card.tv-focus').count()) === 1, 'no mesmo cartão "Ver tudo" (por id)')

    console.log(step = '=== Lista lateral: ←/→ paginam; só recolhe ao entrar nos cards ===')
    {
      const panelNow = () => page.locator('.vod-side-panel').first().evaluate((el) => ({ shut: el.classList.contains('is-collapsed'), width: el.getBoundingClientRect().width }))
      const sideIndex = () => page.locator('.vod-showcase .side-category-nav-item').evaluateAll((els) => els.findIndex((el) => el.classList.contains('tv-focus')))
      const inCards = await panelNow()
      await page.waitForTimeout(300)
      const shutInCards = await panelNow()
      console.log(`  · painel ${Math.round(panelWidthOpen)}px na lista → ${Math.round(shutInCards.width)}px com o foco nos cards`)
      assert(inCards.shut && shutInCards.width < panelWidthOpen / 2, 'com o foco nos cards a lista fica recolhida (menos da metade da largura)')
      await shot(page, '04-lista-recolhida')
      await ensureSideFocus(page) // ← a partir dos cards volta à lista
      await page.waitForTimeout(400)
      const back = await panelNow()
      assert(!back.shut && Math.abs(back.width - panelWidthOpen) < 2, '← para a lista expande de volta à largura original')
      await shot(page, '04b-lista-expandida')

      // ← → paginam: a página cabe várias entradas e nada recolhe enquanto o foco está na lista.
      for (let i = 0; i < 80 && (await sideIndex()) > 0; i += 1) await press(page, 'ArrowUp')
      const start = await sideIndex()
      await press(page, 'ArrowRight')
      const afterPage = await sideIndex()
      console.log(`  · página: entrada ${start} → ${afterPage}`)
      assert(afterPage - start >= 4, '→ na lista salta uma página inteira (não um item)')
      assert(!(await panelNow()).shut && (await focusedRowLabel(page)) === null, 'e nem recolhe nem entra nos cards')
      await press(page, 'ArrowLeft')
      assert((await sideIndex()) === start, '← volta uma página')
      let presses = 0
      while ((await focusedRowLabel(page)) === null && presses < 120) {
        await press(page, 'ArrowRight')
        presses += 1
      }
      console.log(`  · ${presses} toques em → até entrar nos cards`)
      assert((await focusedRowLabel(page)) !== null && presses > 2, '→ até o fim da lista entra nos cards')
      await page.waitForTimeout(400)
      assert((await panelNow()).shut, 'e só então a lista recolhe')
    }
    console.log(step = '=== Séries: Top 10 de séries ===')
    await openViaTopbar(page, 'series')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await enterContent(page)
    await enterRows(page)
    const seriesLabels = await walkRows(page, 6)
    assert(seriesLabels[0] === 'Top 10 séries da semana', `Séries abre com o Top 10 de séries (${seriesLabels.join(' | ')})`)
    await shot(page, '05-hero-series')

    console.log(step = `=== Pilha virtualizada com ${EXTRA_CATEGORIES + 2} categorias ===`)
    await openViaTopbar(page, 'movies')
    await page.waitForSelector('.vod-showcase .vod-side-panel', { timeout: 8000 })
    await enterContent(page)
    await enterRows(page)
    const started = Date.now()
    await press(page, 'ArrowDown', EXTRA_CATEGORIES + 8)
    await page.waitForTimeout(500)
    const mounted = await page.locator('.vod-showcase section.vod-row').count()
    console.log(`  · ${mounted} fileiras montadas após descer ${EXTRA_CATEGORIES + 8} vezes (${Date.now() - started} ms)`)
    assert(mounted <= 24, 'só uma janela de fileiras fica montada (virtualizada)')
    const last = await focusedRowLabel(page)
    assert(last !== null && /^Cat \d{3}$/.test(last), `o foco chegou ao fim da pilha sem se perder (${last})`)
    await shot(page, '06-fim-da-pilha')

    assert(externalRequests.length === 0, `nenhuma requisição externa (TMDB etc.): ${externalRequests.slice(0, 3).join(', ') || 'ok'}`)
    assert(pageErrors.length === 0, `sem erros de página: ${pageErrors.slice(0, 2).join(' | ') || 'ok'}`)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTudo certo.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
