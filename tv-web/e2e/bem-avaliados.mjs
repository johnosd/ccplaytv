// Roteiro E2E da feature 056 (fileira "Bem avaliados" em Filmes) — gate da constitution ("Testes E2E antes da validação em TV").
//
// Painel Xtream FICTÍCIO criado por este script (nunca uma fonte real). Mede:
//  - a fileira "Bem avaliados" aparece depois que a categoria é obtida, SÓ com filmes recentes de nota 6,0–9,9 (nada de nota 10,
//    nota baixa, filme antigo ou sem ano), uma versão por título (a "[L]" não aparece), em ordem de nota, com selo "★ 9,4" e SEM o
//    antigo slot "Em breve";
//  - o destaque mostra "★ 9,4 Provedor" ao focar o card; focar não consulta o painel nem host externo;
//  - o aviso "Com base em 1 de 2 categorias" aparece enquanto uma categoria não foi obtida (a outra devolve erro);
//  - "Ver tudo" abre "Todos" ordenado por nota SEM o corte da fileira (nota 10 e filme antigo primeiro), "Nota" fora do modal de
//    Ordenar; voltar devolve o foco à fileira.
//
// Pré-requisito: `npm run dev` em http://localhost:5173. Dados só fictícios.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { enterRows, focusedRowLabel, gotoRow, openShowcase, openVodCategory } from './lib/vod.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPA = readFileSync(path.join(__dirname, 'fixtures', 'capa-real', 'capa-filme.png'))
const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Bem avaliados'
const YEAR = new Date().getFullYear()

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

/** 12 filmes recentes elegíveis (R01..R12, nota 9,4 → 7,2) + os que NÃO podem entrar na fileira, mas entram em "Ver tudo". */
const RECENTES = Array.from({ length: 12 }, (_, index) => ({
  name: `Filme R${String(index + 1).padStart(2, '0')}`,
  rating: (9.4 - index * 0.2).toFixed(1),
  year: YEAR - (index % 7),
}))

/** Painel fictício: categoria 10 com os filmes acima; a categoria 11 sempre falha (cobertura parcial). */
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
      if (action === 'get_vod_streams' && url.searchParams.get('category_id') === '11') {
        res.writeHead(500)
        res.end('falha simulada')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories' || action === 'get_live_streams') return res.end('[]')
      if (action === 'get_series_categories' || action === 'get_series') return res.end('[]')
      if (action === 'get_vod_categories') {
        return res.end(
          JSON.stringify([
            { category_id: '10', category_name: 'Filmes | Avaliados' },
            { category_id: '11', category_name: 'Filmes | Fora do ar' },
          ]),
        )
      }
      if (action === 'get_vod_streams') {
        const icon = `${base}/capa.png`
        let id = 0
        const film = (name, rating, year, added) => ({
          name,
          stream_id: (id += 1),
          category_id: '10',
          stream_icon: icon,
          ...(rating === undefined ? {} : { rating }),
          ...(year === undefined ? {} : { year: String(year) }),
          added: String(added),
        })
        return res.end(
          JSON.stringify([
            ...RECENTES.map((entry, index) => film(entry.name, entry.rating, entry.year, 1700000000 + index)),
            film('Filme Dez', '10', YEAR, 1700000100), // nota 10: fora da fileira
            film('Filme Velho', '9.9', 1980, 1700000101), // antigo: fora da fileira (há 12 recentes)
            film('Filme Baixo', '5.0', YEAR, 1700000102), // abaixo do piso de 6,0
            film('Filme R01 [L]', '9.4', RECENTES[0].year, 1700000103), // versão duplicada do R01
            film('Filme Zero', '0', YEAR, 1700000104),
            film('Filme Sem', undefined, YEAR, 1700000105),
          ]),
        )
      }
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

const text = (page, selector) => page.locator(selector).first().textContent().catch(() => null)
const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim()

async function run() {
  const server = await startPanel()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()
  const pageErrors = []
  const externalRequests = []
  const panelCalls = []
  page.on('pageerror', (error) => pageErrors.push(`[${step}] ${String(error).slice(0, 90)}`))
  page.on('request', (request) => {
    const parsed = new URL(request.url())
    if (parsed.pathname === '/player_api.php') panelCalls.push(parsed.searchParams.get('action') ?? '')
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') externalRequests.push(parsed.hostname)
  })

  try {
    console.log((step = '=== Fonte fictícia ==='))
    await addSource(page, server.address().port)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log((step = '=== Obtém a categoria com notas (entrando nela) ==='))
    await openShowcase(page, 'movies')
    await openVodCategory(page, 'Avaliados')
    await page.waitForSelector('.vod-grid .content-card', { timeout: 15000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })

    console.log((step = '=== Fileira "Bem avaliados": recente, boa nota, sem duplicata ==='))
    await enterRows(page)
    await gotoRow(page, 'Bem avaliados', ['Avaliados', 'Fora do ar'])
    const rowSelector = 'section.vod-row[aria-label="Bem avaliados"]'
    await page.waitForSelector(`${rowSelector} .content-card`, { timeout: 15000 })
    assert((await page.locator(`${rowSelector} .vod-slot-card`).count()) === 0, 'é fileira real: sem o cartão "Em breve"')
    assert(!/Títulos mais bem avaliados da sua lista/.test((await text(page, '.vod-showcase')) ?? ''), 'o texto do antigo slot "Em breve" não aparece')
    // O carrossel só renderiza as primeiras posições (virtualização horizontal): confere o prefixo; as 12 posições são do teste unitário.
    const titles = (await page.locator(`${rowSelector} .content-card-title`).allTextContents()).map(clean)
    // Versões do mesmo filme contam como um título ("Filme R01" ou "Filme R01 [L]"): fica só uma delas, na 1ª posição.
    const semMarca = titles.map((title) => title.replace(/ \[L\]$/, ''))
    const esperados = RECENTES.map((entry) => entry.name)
    assert(titles.length >= 8, `a fileira renderiza ao menos 8 cards (${titles.length})`)
    assert(JSON.stringify(semMarca) === JSON.stringify(esperados.slice(0, semMarca.length)), `recentes de 6,0–9,9 em ordem de nota: ${JSON.stringify(titles)}`)
    assert(titles.filter((title) => title.startsWith('Filme R01')).length === 1, 'o filme R01 aparece uma vez só (as duas versões não convivem)')
    for (const proibido of ['Filme Dez', 'Filme Velho', 'Filme Baixo', 'Filme Zero', 'Filme Sem']) {
      assert(!titles.includes(proibido), `"${proibido}" não está na fileira`)
    }
    const badges = (await page.locator(`${rowSelector} .rating-badge`).allTextContents()).map(clean)
    const notas = badges.map((badge) => Number(badge.replace('★', '').replace(',', '.')))
    assert(badges[0] === '★ 9,4' && notas.every((nota, index) => index === 0 || nota <= notas[index - 1]), `selo em cada card, nota não crescente (${JSON.stringify(badges)})`)
    const coverage = clean(await text(page, `${rowSelector} .vod-row-coverage`))
    assert(coverage === 'Com base em 1 de 2 categorias', `aviso de cobertura parcial: "${coverage}"`)
    assert((await page.locator('.rating-badge.tv-focus').count()) === 0, 'o selo não recebe foco')

    console.log((step = '=== Foco nos cards não consulta a rede ==='))
    const callsBefore = panelCalls.length
    const externalBefore = externalRequests.length
    for (let i = 0; i < 14 && !/^Filme R01/.test(clean(await text(page, '.vod-showcase .content-card:has(.tv-focus) .content-card-title'))); i += 1) await page.keyboard.press('ArrowLeft')
    const badge = clean(await text(page, '.vod-showcase .content-card:has(.tv-focus) .rating-badge'))
    assert(/★ 9,4/.test(badge), 'card focado mantém a nota')
    assert((await page.locator('.vod-hero-band').count()) === 0, 'vitrine sem hero')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert(panelCalls.length === callsBefore, `mover o foco não consulta o painel (${panelCalls.slice(callsBefore).join(',') || 'nenhuma'})`)
    assert(externalRequests.length === externalBefore, 'nenhuma requisição externa ao focar')

    console.log((step = '=== "Ver tudo" abre Todos por nota, sem o corte; voltar restaura o foco ==='))
    for (let i = 0; i < 20 && (await page.locator('.vod-showcase .vod-see-all-card.tv-focus').count()) === 0; i += 1) await page.keyboard.press('ArrowRight')
    assert((await page.locator('.vod-showcase .vod-see-all-card.tv-focus').count()) === 1, 'cheguei no "Ver tudo" da fileira')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.vod-grid .content-card').length >= 6, null, { timeout: 15000 })
    const grid = (await page.locator('.vod-grid .content-card-title').allTextContents()).map(clean)
    assert(grid[0] === 'Filme Dez' && grid[1] === 'Filme Velho', `a grade traz a seção inteira por nota (10 e antigo primeiro): ${JSON.stringify(grid.slice(0, 4))}`)
    assert(clean(await text(page, '.vod-toolbar-sort-button')).includes('Nota'), 'o botão de ordenar mostra "Nota"')
    // Modal de Ordenar: "Nota" não é opção (FR-008).
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-sort-modal-item', { timeout: 5000 })
    const options = (await page.locator('.vod-sort-modal-item').allTextContents()).map(clean)
    assert(!options.some((option) => option.includes('Nota')), `o modal de Ordenar não oferece "Nota": ${JSON.stringify(options)}`)
    await page.keyboard.press('Escape') // fecha o modal
    await page.keyboard.press('Escape') // volta à tela hero
    await page.waitForSelector('.vod-showcase', { timeout: 8000 })
    await page.waitForFunction(() => document.querySelector('.vod-showcase .tv-focus') !== null, null, { timeout: 8000 })
    assert((await focusedRowLabel(page)) === 'Bem avaliados', `voltar devolve o foco à fileira (${await focusedRowLabel(page)})`)

    assert(externalRequests.length === 0, `nenhuma requisição externa em todo o roteiro (${[...new Set(externalRequests)].join(', ') || 'ok'})`)
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
