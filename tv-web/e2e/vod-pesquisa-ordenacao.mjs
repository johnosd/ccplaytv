// Roteiro E2E: Pesquisar e Ordenar em Filmes/Séries (vitrine → tela de categoria "Todos" e dentro de uma categoria).
//
// A vitrine tem a barra Pesquisar/Ordenar no topo (↑ da 1ª fileira ou do 1º item da lista lateral); OK abre "Todos" já com
// a pesquisa ativa ou o modal de ordenar aberto. Dentro da categoria, a mesma barra faz o mesmo no escopo da categoria.
//
// Pré-requisito: `npm run dev` em http://localhost:5173. Dados fictícios servidos por este script.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { openShowcase, openVodCategory } from './lib/vod.mjs'

const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Pesquisa'
const SHOTS = path.join(process.cwd(), 'test-results', 'vod-pesquisa-ordenacao')

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Painel Xtream fictício: filmes fora de ordem alfabética (Zeta, Alfa, Meio, Beta) em duas categorias; 2 séries. */
function startPanel() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (url.pathname !== '/player_api.php') {
        res.writeHead(404)
        res.end('não encontrado')
        return
      }
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return res.end('[]')
      if (action === 'get_vod_categories')
        return res.end(
          JSON.stringify([
            { category_id: '10', category_name: 'Filmes | Primeira' },
            { category_id: '11', category_name: 'Filmes | Segunda' },
          ]),
        )
      if (action === 'get_vod_streams') {
        const filmes = [
          { name: 'Zeta Filme', stream_id: 1, category_id: '10' },
          { name: 'Alfa Filme', stream_id: 2, category_id: '10' },
          { name: 'Meio Filme', stream_id: 3, category_id: '11' },
          { name: 'Beta Filme', stream_id: 4, category_id: '11' },
        ]
        const wanted = url.searchParams.get('category_id')
        return res.end(JSON.stringify(wanted ? filmes.filter((f) => f.category_id === wanted) : filmes))
      }
      if (action === 'get_series_categories') return res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries | Drama' }]))
      if (action === 'get_series')
        return res.end(
          JSON.stringify([
            { name: 'Zorro Série', series_id: '500', category_id: '20' },
            { name: 'Abelha Série', series_id: '501', category_id: '20' },
          ]),
        )
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
const gridTitles = (page) => page.locator('.vod-grid-cell .content-card-title').allTextContents()
const waitTitles = async (page, predicate, label) => {
  for (let i = 0; i < 40; i += 1) {
    const titles = await gridTitles(page)
    if (predicate(titles)) return titles
    await page.waitForTimeout(150)
  }
  throw new Error(`grade não chegou em: ${label} (${(await gridTitles(page)).join(' | ')})`)
}

/** Da grade: ↑ até a barra (Pesquisar). */
async function focusGridToolbar(page) {
  for (let i = 0; i < 3 && (await page.locator('.vod-toolbar .tv-focus').count()) === 0; i += 1) await page.keyboard.press('ArrowUp')
}

/** RETURN até a vitrine. */
async function backToShowcase(page) {
  for (let i = 0; i < 4; i += 1) {
    if ((await page.locator('.vod-showcase').count()) > 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  assert(false, 'RETURN volta à vitrine')
}

/** Barra da grade → Ordenar → modal → "A–Z" (2ª opção). */
async function chooseAz(page, label) {
  await focusGridToolbar(page)
  if ((await page.locator('.vod-toolbar-sort-button.tv-focus').count()) === 0) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="dialog"][aria-label="Ordenar"]', { timeout: 5000 })
  assert(true, `${label}: modal de Ordenar aberto`)
  await press(page, 'ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="dialog"][aria-label="Ordenar"]', { state: 'detached', timeout: 5000 })
}
async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const server = await startPanel()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    console.log('=== Fonte fictícia ===')
    await addSource(page, server.address().port)
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== Filmes: a vitrine só mostra hero e fileiras — sem Pesquisar nem Ordenar ===')
    await openShowcase(page, 'movies')
    assert((await page.locator('.vod-showcase .vod-toolbar-search-button, .vod-showcase .vod-toolbar-sort-button').count()) === 0, 'a vitrine não tem Pesquisar nem Ordenar (ficam nas grades)')
    await shot(page, '01-vitrine-sem-barra')

    console.log('=== Filmes: Pesquisar e Ordenar DENTRO de uma categoria (grade) ===')
    await openVodCategory(page, 'Primeira')
    await waitTitles(page, (t) => t.length === 2, '2 filmes da categoria')
    await focusGridToolbar(page)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-toolbar-search-field input')
    await page.keyboard.type('zeta')
    const inCat = await waitTitles(page, (t) => t.length === 1, 'pesquisa dentro da categoria')
    assert(inCat[0] === 'Zeta Filme', `a pesquisa dentro da categoria só vê a própria categoria (${inCat.join(' | ')})`)
    await shot(page, '02-categoria-pesquisa')
    await press(page, 'Escape') // fecha a pesquisa
    await waitTitles(page, (t) => t.length === 2, 'lista completa da categoria após fechar a pesquisa')
    await chooseAz(page, 'categoria')
    const catSorted = await waitTitles(page, (t) => t.length === 2 && t[0] === 'Alfa Filme', 'A–Z na categoria')
    assert(catSorted.join('|') === 'Alfa Filme|Zeta Filme', `A–Z dentro da categoria (${catSorted.join(' | ')})`)
    await shot(page, '03-categoria-az')
    await backToShowcase(page)

    console.log('=== Filmes: "Todos" — pesquisa e ordenação valem para o tipo inteiro ===')
    await openVodCategory(page, 'Todos')
    const todos = await waitTitles(page, (t) => t.length === 4, '4 filmes em "Todos"')
    assert(todos.join('|') === 'Alfa Filme|Beta Filme|Meio Filme|Zeta Filme', `a ordenação A–Z da sessão vale em "Todos" (${todos.join(' | ')})`)
    await focusGridToolbar(page)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-toolbar-search-field input')
    await page.keyboard.type('alfa')
    const found = await waitTitles(page, (t) => t.length === 1, 'só o filme que casa')
    assert(found[0] === 'Alfa Filme', `a pesquisa em "Todos" filtra o tipo inteiro (${found.join(' | ')})`)
    await backToShowcase(page)

    console.log('=== Séries: mesma barra nas grades ===')
    await page.keyboard.press('Escape') // vitrine de Filmes → Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openShowcase(page, 'series')
    await openVodCategory(page, 'Todos')
    await waitTitles(page, (t) => t.length === 2, '2 séries em "Todos"')
    await focusGridToolbar(page)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-toolbar-search-field input')
    await page.keyboard.type('zorro')
    const serie = await waitTitles(page, (t) => t.length === 1, 'só a série que casa')
    assert(serie[0] === 'Zorro Série', `Séries: a pesquisa na grade filtra (${serie.join(' | ')})`)
    await press(page, 'Escape')
    await waitTitles(page, (t) => t.length === 2, 'séries de volta')
    await chooseAz(page, 'séries')
    const serieAz = await waitTitles(page, (t) => t.length === 2 && t[0] === 'Abelha Série', 'A–Z nas séries')
    assert(serieAz.join('|') === 'Abelha Série|Zorro Série', `Séries: A–Z (${serieAz.join(' | ')})`)
    assert(pageErrors.length === 0, `sem erros de página (${pageErrors.join(' || ')})`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error?.message ?? error)
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
