// Roteiro E2E da feature 052 (vitrine de Filmes e Séries + tela de categoria em grade cheia).
//
// Mede, a 1920×1080 (e 2200×1000 com E2E_W/E2E_H): fileiras da vitrine com dado real (Continue assistindo, ★ Favoritos,
// Adicionados recentemente, Categorias), hero que segue o foco, "Ver tudo", tela de categoria (2 linhas × 6 colunas
// inteiras, capa sem recorte, anel de foco inteiro), voltar restaurando o foco por id. Capturas em
// `test-results/vitrine-filmes-series/`.
//
// Pré-requisito: `npm run dev` em http://localhost:5173 (confira que ninguém mais escuta a 5173). Dados fictícios,
// servidos por este script (painel Xtream com `added`, capas PNG).
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { focusSideList, focusedCardText, focusedRowLabel, gotoRow, openShowcase, openVodCategory } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Vitrine'
const SHOTS = path.join(process.cwd(), 'test-results', 'vitrine-filmes-series')
const RING = 15
const LONGO = 40

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Painel Xtream fictício: "Curto" (3 filmes), "Longo" (40, com capa e data de inclusão) e 1 série. */
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
      if (action === 'get_vod_categories')
        return res.end(
          JSON.stringify([
            { category_id: '10', category_name: 'Filmes | Curto' },
            { category_id: '11', category_name: 'Filmes | Longo' },
          ]),
        )
      if (action === 'get_vod_streams') {
        const filmes = [1, 2, 3].map((n) => ({ name: `Curto ${n}`, stream_id: n, category_id: '10', stream_icon: `${base}/capa.png`, added: String(1700000000 + n) }))
        for (let i = 1; i <= LONGO; i += 1)
          filmes.push({
            name: `Longo ${String(i).padStart(2, '0')}`,
            stream_id: 100 + i,
            category_id: '11',
            stream_icon: i % 2 === 1 ? `${base}/capa.png` : undefined,
            added: String(1600000000 + i * 1000),
          })
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
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
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

/** O anel (RING px em volta) do elemento focado cabe dentro de TODOS os contêineres que o recortam. */
async function ringInside(page, focusSelector, ...containerSelectors) {
  const el = await rectOf(page, focusSelector)
  for (const selector of containerSelectors) {
    const box = await rectOf(page, selector)
    const fits =
      el.top - RING >= box.top - 0.5 &&
      el.bottom + RING <= box.bottom + 0.5 &&
      el.left - RING >= box.left - 0.5 &&
      el.right + RING <= box.right + 0.5
    if (!fits) return false
  }
  return true
}

async function favoriteFocused(page) {
  // OK longo favorita (a vitrine não favorita; isso é na grade).
  await page.keyboard.down('Enter')
  await page.waitForTimeout(900)
  await page.keyboard.up('Enter')
  await page.waitForTimeout(300)
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
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    console.log('=== Fonte fictícia ===')
    await addSource(page, server.address().port)
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== Vitrine de Filmes (sem histórico nem favoritos) ===')
    await openShowcase(page, 'movies')
    const rows0 = await page.locator('.vod-showcase section.vod-row').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
    console.log(`  · fileiras: ${rows0.join(' | ')}`)
    assert((await page.locator('.vod-showcase .vod-side-panel').count()) === 1, 'a lista lateral de categorias sempre existe')
    assert(!rows0.includes('Continue assistindo') && !rows0.includes('★ Favoritos'), 'sem histórico nem favoritos, essas fileiras não aparecem')
    const cats = await page.locator('.vod-showcase .side-category-nav-item').allTextContents()
    assert(cats[0]?.includes('Favoritos') && cats[1]?.includes('Histórico') && cats[2]?.includes('Todos'), `★/↺/Todos primeiro (${cats.slice(0, 5).join(' | ')})`)
    assert(cats.some((text) => text.startsWith('Longo')) && !cats.some((text) => /^filmes\s*\|/i.test(text)), 'categorias sem o prefixo "Filmes |"')
    assert((await page.locator('.topbar').count()) === 1 && (await page.locator('.hint-bar').count()) === 0, 'topbar presente e sem rodapé de dicas (feature 052)')
    assert((await page.locator('.vod-hero-band').count()) === 0, 'vitrine sem hero')
    await shot(page, '01-vitrine-so-categorias')

    console.log('=== Categoria "Longo": grade em tela cheia ===')
    await openVodCategory(page, 'Longo')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 8000 })
    await page.waitForTimeout(500)
    assert((await page.locator('.vod-side-panel, .side-category-nav-item, .vod-hero-band').count()) === 0, 'sem sidebar nem hero na tela de categoria')
    const grid = await rectOf(page, '.vod-grid')
    const cells = await page.locator('.vod-grid-cell').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width) }
      }),
    )
    const rowTops = [...new Set(cells.map((c) => c.top))].sort((a, b) => a - b)
    const cols = new Set(cells.filter((c) => c.top === rowTops[0]).map((c) => c.left)).size
    console.log(`  · grade ${(grid.bottom - grid.top).toFixed(0)}px; linhas em ${rowTops.join(', ')}; ${cols} colunas; card ${cells[0]?.width}px`)
    assert(cols === 6, `6 colunas por linha (${cols})`)
    assert(cells[0].width >= 205, `card ≥ 205px (${cells[0].width}px)`)
    const secondRow = cells.filter((c) => c.top === rowTops[1])
    assert(rowTops.length >= 2 && secondRow.length > 0 && secondRow.every((c) => c.bottom <= grid.bottom + 0.5), '2 linhas de cards inteiras visíveis (a 2ª inclui o título)')
    assert(await page.locator('.vod-grid').evaluate((el) => el.scrollWidth - el.clientWidth <= 1), 'grade sem scroll horizontal')
    assert(await ringInside(page, '.vod-grid .poster-box.tv-focus', '.vod-grid', '.vod-content-column'), 'anel de foco inteiro no 1º card')
    await shot(page, '02-categoria-grade')

    console.log('=== Favoritar e voltar à vitrine ===')
    await favoriteFocused(page) // Longo 01
    await press(page, 'ArrowRight') // Longo 02
    await page.keyboard.press('Escape') // RETURN → vitrine
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await page.waitForSelector('section.vod-row[aria-label="★ Favoritos"]', { timeout: 8000 })
    assert(((await focusedCardText(page)) ?? '').includes('Longo') && (await focusedRowLabel(page)) === null, 'voltou à vitrine no item da lista lateral de onde saiu')
    const rows1 = await page.locator('.vod-showcase section.vod-row').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
    console.log(`  · fileiras: ${rows1.join(' | ')}`)
    assert(rows1.includes('★ Favoritos'), 'o favorito criado aparece na fileira ★ Favoritos')
    assert(rows1.includes('Adicionados recentemente'), 'itens com data de inclusão formam "Adicionados recentemente"')
    await shot(page, '03-vitrine-com-fileiras')

    console.log('=== Fileira ★ Favoritos: foco, "Ver tudo" e voltar ===')
    await gotoRow(page, '★ Favoritos')
    console.log('  · favoritos:', (await page.locator('section.vod-row[aria-label="★ Favoritos"] .content-card-title').allTextContents()).join(', '))
    assert(((await focusedCardText(page)) ?? '').includes('Longo'), 'card favorito mantém o foco sem hero')
    assert((await page.locator('.vod-hero-band').count()) === 0, 'favoritos sem faixa de hero')
    await shot(page, '04-vitrine-favoritos')
    await page.keyboard.press('ArrowRight') // Ver tudo
    assert(((await focusedCardText(page)) ?? '').includes('Ver tudo'), 'o cartão final da fileira é "Ver tudo"')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-toolbar', { timeout: 8000 })
    assert(((await page.locator('.vod-toolbar-title').textContent()) ?? '').includes('Favoritos'), '"Ver tudo" de ★ Favoritos abre a grade de ★ Favoritos')
    assert((await page.locator('.vod-toolbar-sort-button').count()) === 0, '★ Favoritos sem botão Ordenar')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    assert((await focusedRowLabel(page)) === '★ Favoritos' && ((await focusedCardText(page)) ?? '').includes('Ver tudo'), 'RETURN volta ao "Ver tudo" de origem')

    console.log('=== "Ver tudo" de Adicionados recentemente → Todos por Recém-adicionados ===')
    await gotoRow(page, 'Adicionados recentemente')
    await press(page, 'ArrowRight', 13)
    assert(((await focusedCardText(page)) ?? '').includes('Ver tudo'), '12 itens + "Ver tudo" na fileira de Adicionados')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-toolbar-sort-button', { timeout: 10000 })
    assert(((await page.locator('.vod-toolbar-sort-value').textContent()) ?? '').includes('Recém-adicionados'), 'abre Todos já ordenado por Recém-adicionados')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 8000 })
    assert(((await page.locator('.vod-grid .content-card-title').first().textContent()) ?? '').trim() === 'Longo 40', 'o mais recente entre os já obtidos (Longo 40) vem primeiro')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })

    console.log('=== Detalhe e volta ===')
    await focusSideList(page)
    await openVodCategory(page, 'Curto')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 8000 })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-grid .poster-box.tv-focus', { timeout: 8000 })
    assert(((await page.locator('.vod-grid .poster-box.tv-focus').evaluate((el) => el.closest('.content-card')?.textContent ?? '')) ?? '').includes('Curto 2'), 'voltar do detalhe restaura o mesmo card (Curto 2)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })

    console.log('=== Séries ===')
    // Topbar na vitrine: ↑ sobe até ela (passando pela barra Pesquisar/Ordenar) e → Séries + OK troca de destino.
    for (let i = 0; i < 12 && (await page.locator('.topbar .tv-focus').count()) === 0; i += 1) await page.keyboard.press('ArrowUp')
    assert((await page.locator('.topbar .tv-focus').count()) === 1, '↑ da vitrine chega à topbar')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.topbar-item[aria-current="page"]')?.textContent === 'Séries', null, { timeout: 8000 })
    assert(true, 'a topbar troca Filmes → Séries direto da vitrine')
    await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
    assert((await page.locator('.vod-showcase .side-category-nav-item', { hasText: 'Drama' }).count()) === 1, 'Séries: categoria "Drama" sem o prefixo "Séries |"')
    await shot(page, '05-vitrine-series')

    assert(pageErrors.length === 0, `sem erro de página (${pageErrors.join(' | ')})`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
    await shot(page, 'erro').catch(() => {})
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram.')
}

run()




