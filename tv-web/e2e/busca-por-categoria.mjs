// Roteiro E2E da feature 018 (busca por categoria, ícone de entrada e
// categoria virtual "Todos") — gate da constitution v1.5.0 ("Testes E2E
// (Playwright) antes de validação em TV física"). Substitui
// `busca-local.mjs` (feature 017, design anterior).
//
// Cobre: buscar dentro de uma categoria acha só itens dela (nunca de outra
// categoria); "Todos" reúne itens de mais de uma categoria já coberta, com
// aviso de cobertura parcial; abrir um filme por busca e voltar restaura
// termo e foco (D-006 herdado da 017); RETURN em camadas (resultado →
// campo → ícone → trilha → hub da lista).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/busca-por-categoria.m3u`), servidos por um
// HTTP server local criado por este próprio script — nunca uma fonte real.
// O conteúdo servido não é um vídeo decodificável de verdade (mesma
// limitação documentada em `htmlVideoAdapter.ts`) — por isso, tal como
// `zapping-live-tv.mjs`, este script dispara os eventos do <video>
// manualmente para avançar a máquina de estados do `PlayerLayer`.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'busca-por-categoria.m3u')
const APP_URL = 'http://localhost:5173'

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
      res.writeHead(200, {
        'Content-Type': 'audio/x-mpegurl',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('#add-source-title', { timeout: 8000 })

  await page.getByLabel('Nome de exibição').fill('Fonte E2E Busca por Categoria')
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()

  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
}

/** Dispara um evento do <video> ATUAL (o adaptador de dev não decodifica conteúdo fictício). */
async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

/** Mesmo binário fixo de `m3u-sob-demanda.mjs` quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) {
    return chromium.launch({ headless: true, executablePath: fixedPath })
  }
  return chromium.launch({ headless: true })
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/busca-por-categoria.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    await addSource(page, m3uUrl)

    // As URLs de "stream"/"vod" da fixture não são servidas de verdade —
    // sem interceptar, o <video> dispara seu próprio evento `error` em
    // corrida com os eventos sintéticos deste script (mesmo comentário de
    // `zapping-live-tv.mjs`). Registradas só depois da primeira navegação:
    // `page.route()` antes do primeiro `goto` prende a navegação
    // indefinidamente neste ambiente (achado da feature 017, sem relação
    // com o app).
    await page.route('**/live/**', () => {})
    await page.route('**/vod/**', () => {})

    console.log('=== Live TV: entra em "Canais | Esportes" (cobre essa categoria) ===')
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('Enter') // Live TV é o primeiro tile

    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Canais | Esportes" (padrão: 1ª categoria real)
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').allTextContents()).join(',') ===
        'Globo Esportes Fictício,ESPN Fictício',
      'categoria "Canais | Esportes" mostra os dois canais fictícios',
    )

    console.log('=== Busca DENTRO de "Esportes": acha só itens desta categoria ===')
    await page.keyboard.press('ArrowUp') // do 1º canal para o ícone de busca
    assert(
      await page.locator('.search-icon-button').isVisible(),
      'ícone de busca aparece no topo da categoria (com itens carregados)',
    )
    await page.keyboard.press('Enter') // ativa o ícone: abre o campo

    const liveField = page.locator('input.search-field')
    await liveField.waitFor({ timeout: 8000 })
    await liveField.fill('glo')

    await page.waitForSelector('.live-channel-list .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-channel-list .live-item-name').allTextContents()).join(',') ===
        'Globo Esportes Fictício',
      '"glo" dentro de "Esportes" acha só "Globo Esportes Fictício" — nunca cruza para "Notícias"',
    )
    assert(
      !(await page.getByText(/Busca em \d+ de \d+ categorias/).isVisible()),
      'categoria específica nunca mostra aviso de cobertura (só "Todos" mostra)',
    )

    console.log('=== SELECT no resultado toca o canal ===')
    await page.keyboard.press('ArrowDown') // do campo para o resultado
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    assert(true, 'SELECT no resultado da busca abriu o player')
    await fireVideoEvent(page, 'playing')
    await page.keyboard.press('Escape') // RETURN fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(true, 'RETURN fechou o player sem travar o app')

    console.log('=== "Todos": reúne canais de "Esportes" (coberta), com aviso de cobertura parcial ===')
    // Fechar o player reancora a trilha na categoria do canal (016 D-006) —
    // sai até a trilha e sobe até "Todos" (logo após "★ Favoritos", ou
    // seja, 1 ArrowUp a partir de "Esportes" já chega em "Todos").
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowLeft') // categoria -> trilha (se ainda não estiver lá)
    await page.keyboard.press('ArrowUp') // "Todos"
    await page.keyboard.press('ArrowRight') // entra em "Todos"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').allTextContents()).join(',') ===
        'Globo Esportes Fictício,ESPN Fictício',
      '"Todos" mostra os canais de "Esportes" (única categoria já coberta) sem precisar buscar',
    )
    assert(
      await page.getByText('Busca em 1 de 2 categorias').isVisible(),
      '"Todos" avisa cobertura parcial (1 de 2 categorias de canal) mesmo sem buscar',
    )

    console.log('=== Filmes: entra em "Filmes A" (cobre essa categoria) ===')
    // Uma rota registrada trava uma navegação de página inteira (`goto`)
    // neste ambiente — sem interceptar mais nenhum player pelo resto do
    // script, é seguro remover antes de voltar à Home.
    await page.unroute('**/live/**')
    await page.unroute('**/vod/**')
    await page.goto(APP_URL)
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Filmes A" (padrão: 1ª categoria real)
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.poster-card-title').first().textContent()) === 'Duna Fictício',
      'categoria "Filmes A" mostra "Duna Fictício"',
    )

    console.log('=== Busca DENTRO de "Filmes A": acha só o filme desta categoria ===')
    await page.keyboard.press('ArrowUp') // do 1º filme para o ícone
    await page.keyboard.press('Enter') // abre o campo

    const movieField = page.locator('input.search-field')
    await movieField.waitFor({ timeout: 8000 })
    await movieField.fill('duna')

    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.poster-card-title').allTextContents()).join(',') === 'Duna Fictício',
      '"duna" dentro de "Filmes A" acha só "Duna Fictício" — nunca cruza para "Filmes B"',
    )

    console.log('=== Abrir o resultado e voltar restaura termo e foco (D-006 herdado da 017) ===')
    await page.keyboard.press('ArrowDown') // do campo para o resultado
    await page.keyboard.press('Enter') // abre o detalhe
    await page.waitForSelector('.movie-detail-layout', { timeout: 8000 })
    assert(true, 'SELECT no resultado da busca abriu o detalhe do filme')

    await page.keyboard.press('Escape') // RETURN volta pra Filmes
    await page.waitForSelector('input.search-field', { timeout: 8000 })
    assert((await page.locator('input.search-field').inputValue()) === 'duna', 'o termo "duna" foi restaurado')
    assert(
      (await page.locator('.poster-cell .tv-focus').locator('..').locator('.poster-card-title').textContent()) ===
        'Duna Fictício',
      'o foco voltou pro item que estava aberto',
    )

    console.log('=== RETURN em camadas: resultado → campo → ícone → trilha → hub ===')
    await page.keyboard.press('Escape') // resultado -> campo
    assert(
      await page.evaluate(() => document.activeElement === document.querySelector('input.search-field')),
      'RETURN a partir do resultado devolveu o foco DOM ao campo',
    )
    await page.keyboard.press('Escape') // campo -> fecha a busca, volta ao ícone (sem sair da categoria)
    assert(
      await page.locator('.search-icon-button.tv-focus').isVisible(),
      'RETURN a partir do campo fechou a busca e devolveu o foco ao ícone, sem sair da categoria',
    )
    await page.keyboard.press('Escape') // ícone -> trilha
    await page.waitForSelector('.live-column-groups .tv-focus', { timeout: 8000 })
    assert(true, 'RETURN a partir do ícone saiu da categoria para a trilha')
    await page.keyboard.press('Escape') // trilha -> hub da lista
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert(true, 'RETURN a partir da trilha saiu da tela de Filmes sem travar')
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
  } finally {
    await browser.close()
    server.close()
  }

  console.log('')
  if (failures > 0) {
    console.error(`${failures} verificação(ões) falharam.`)
    process.exitCode = 1
  } else {
    console.log('Todas as verificações passaram.')
  }
}

await run()
