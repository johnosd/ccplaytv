// Roteiro E2E da feature 015 (capa real de filmes e séries) — gate da
// constitution v1.5.0 ("Testes E2E (Playwright) antes de validação em TV
// física").
//
// Cenário 1 (US1, T019): uma fonte M3U cujas entradas declaram `tvg-logo`
// para um filme e uma série (via os dois episódios que a formam) mostra a
// capa real nos cards de Filmes/Séries; um item sem `tvg-logo` continua no
// placeholder; Live TV nunca mostra capa, mesmo com `tvg-logo` declarado
// no canal (FR-009).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção de `e2e.mjs`/`e2e/m3u-sob-demanda.mjs`.
//
// Dados: só fictícios — duas imagens PNG 1×1 em `fixtures/capa-real/`,
// servidas por um HTTP server local criado por este próprio script. O M3U
// é montado aqui dentro (não um arquivo estático): as URLs de `tvg-logo`
// precisam ser de fato buscáveis pelo navegador, e a porta do servidor só
// existe em tempo de execução (ver `tasks.md`, Registro da Fase 1).
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'capa-real')
const CAPA_FILME = readFileSync(path.join(FIXTURES_DIR, 'capa-filme.png'))
const CAPA_SERIE = readFileSync(path.join(FIXTURES_DIR, 'capa-serie.png'))
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

// Cenário 3 (US2, D-007): categoria só pra provar que a capa segue a
// janela da virtualização — item o bastante pra nunca caber tudo na tela
// de uma vez, cada um com uma capa PRÓPRIA (nunca a mesma URL duas vezes:
// o navegador cacheia imagem repetida, e isso esconderia exatamente o que
// este cenário precisa provar — que entrar não requisita tudo). 60 não
// bastou (coube inteiro numa janela real de navegador, mesmo headless —
// achado ao rodar este script); 500 garante margem confortável mesmo se
// o viewport crescer no futuro.
const MANY_COUNT = 500

function buildM3u(baseUrl) {
  const lines = [
    '#EXTM3U',
    `#EXTINF:-1 tvg-logo="${baseUrl}/capa-filme.png" group-title="Filmes",Filme Com Capa`,
    'http://exemplo.test/vod/1.mp4',
    '#EXTINF:-1 group-title="Filmes",Filme Sem Capa',
    'http://exemplo.test/vod/2.mp4',
    // Cenário 2 (US2): tvg-logo aponta pra um caminho que o servidor não serve — 404.
    `#EXTINF:-1 tvg-logo="${baseUrl}/quebrada.png" group-title="Filmes",Filme Capa Quebrada`,
    'http://exemplo.test/vod/3.mp4',
    `#EXTINF:-1 tvg-logo="${baseUrl}/capa-serie.png" group-title="Series",Serie Com Capa S01E01`,
    'http://exemplo.test/series/1.mp4',
    `#EXTINF:-1 tvg-logo="${baseUrl}/capa-serie.png" group-title="Series",Serie Com Capa S01E02`,
    'http://exemplo.test/series/2.mp4',
    `#EXTINF:-1 tvg-logo="${baseUrl}/capa-filme.png" group-title="Canais",Canal Com Logo`,
    'http://exemplo.test/live/1.ts',
  ]
  // "Filmes Muitos" (não só "Muitos"): o classificador decide por palavra-
  // chave no grupo ("filme(s)"/"movie(s)"/"vod") — um nome sem nenhuma
  // delas viraria "unclassified", nunca uma categoria de filme (achado ao
  // rodar este script, não previsto no plano).
  for (let i = 0; i < MANY_COUNT; i += 1) {
    lines.push(`#EXTINF:-1 tvg-logo="${baseUrl}/capa-item-${i}.png" group-title="Filmes Muitos",Item ${i}`)
    lines.push(`http://exemplo.test/vod/muitos-${i}.mp4`)
  }
  return lines.join('\n')
}

/** Servidor fictício: PNGs fixos + o M3U montado com a própria base URL nas capas. Conta requisições por caminho. */
function startServer() {
  const counts = new Map()
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    counts.set(url.pathname, (counts.get(url.pathname) ?? 0) + 1)
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/capa-filme.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(CAPA_FILME)
      return
    }
    if (url.pathname === '/capa-serie.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(CAPA_SERIE)
      return
    }
    if (/^\/capa-item-\d+\.png$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(CAPA_FILME)
      return
    }
    if (url.pathname === '/lista.m3u') {
      const base = `http://127.0.0.1:${server.address().port}`
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(buildM3u(base))
      return
    }
    // /quebrada.png (cenário 2) e qualquer outro caminho caem aqui — 404 de propósito.
    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, counts })))
}

/** Quantas requisições distintas de `/capa-item-N.png` o servidor já viu. */
function itemIconRequestCount(counts) {
  let total = 0
  for (const [pathname, count] of counts) {
    if (/^\/capa-item-\d+\.png$/.test(pathname)) total += count
  }
  return total
}

/** Espera até `fn()` devolver true, ou desiste no timeout — sem re-tentativa automática de rede envolvida, só polling do próprio teste. */
async function waitUntil(fn, timeoutMs = 5000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
  return false
}

async function addSource(page, m3uUrl, displayName) {
  // Feature 023: sem lista, a tela de perfis só tem "Adicionar lista", já em
  // foco — OK abre o formulário (ele não é mais a primeira tela).
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: displayName, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  await page.getByRole('button', { name: 'Voltar' }).click()
  // Os perfis montam com o cache anterior e a consulta traz a lista nova logo
  // depois — só então o foco inicial cai nela (FR-039).
  await page.locator('.source-card-wrap', { hasText: displayName }).waitFor({ timeout: 8000 })
}

/**
 * Do Início (hero, rails ou topbar — qualquer foco restaurado), abre TV ao
 * vivo/Filmes/Séries pela topbar. Substitui o antigo hub de atalhos
 * (`.tiles-row`, removido na feature 026 — US1 troca o hub provisório pela
 * Home definitiva com hero+rails; a entrada nas 3 categorias passa a ser só
 * pela topbar). Sobe até a topbar (não importa em que linha do conteúdo o
 * foco esteja — `ArrowUp` de sobra não faz nada uma vez lá dentro), reseta
 * a posição horizontal pra "Início" (`ArrowLeft` de sobra, com clamp) e só
 * então conta as setas certas — nunca assume de onde o foco restaurado
 * (FR-017/FR-029) partiu.
 */
async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Mesmo binário fixo de `favoritos.mjs` quando existe; senão, resolução padrão do Playwright (mesmo padrão de `m3u-sob-demanda.mjs`). */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function run() {
  const { server, counts } = await startServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/lista.m3u`

  const browser = await launchBrowser()
  const page = await (await browser.newContext()).newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log('=== Cenário 1 (US1): capa real em Filmes e Séries, placeholder onde não há ===')
    await page.goto(APP_URL)
    await addSource(page, m3uUrl, 'Fonte E2E Capa Real')

    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.home-content', { timeout: 8000 })

    // Feature 024 (R-003, com aprovação explícita do usuário) INVERTE a
    // regra original desta seção: Live TV passou a capturar e mostrar o
    // logo do canal — o que a 015 proibia de propósito (FR-009 daquela
    // feature) virou o oposto. A trilha migrou pro V14 (`SideCategoryNav`),
    // por isso os seletores também mudaram (achado ao rodar este script
    // durante a Fase 7 da 024 — não previsto no plan.md, T047 ad-hoc).
    console.log('--- Live TV: canal AGORA mostra o logo declarado (tvg-logo) — feature 024 inverte a regra da 015 ---')
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.side-category-nav-item.tv-focus', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na única categoria
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'Canal Com Logo',
      'entrou na categoria real de canais (não em Favoritos vazio)',
    )
    assert(
      (await page.locator('.live-channel-row img').count()) === 1,
      '"Canal Com Logo" mostra a <img> do logo (feature 024) — antes proibido (FR-009 da 015), agora invertido',
    )

    console.log('--- Filmes: capa real onde há tvg-logo, placeholder onde não há ---')
    await page.keyboard.press('Escape') // sai da categoria -> trilha
    await page.keyboard.press('Escape') // sai da trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'movies')
    // Espera a categoria REAL aparecer na trilha (não só ".live-state"/
    // ".poster-grid" — o primeiro também casa com o carregamento de
    // *categorias*, ainda antes de entrar em qualquer uma; entrar cedo
    // demais pousa em "★ Favoritos", vazia, por ArrowRight ainda valer o
    // índice padrão sem a lista de categorias carregada — achado ao rodar
    // este script, não previsto no plano).
    await page.waitForSelector('.side-category-nav-item:not(:has-text("Favoritos")):not(:has-text("Histórico")):not(:has-text("Todos"))', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria "Filmes"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    const comCapaCard = page.locator('.vod-grid-cell', { hasText: 'Filme Com Capa' })
    const semCapaCard = page.locator('.vod-grid-cell', { hasText: 'Filme Sem Capa' })
    assert((await comCapaCard.locator('img.poster-box-art').count()) === 1, '"Filme Com Capa" tem <img> de capa')
    assert(
      (await comCapaCard.locator('img.poster-box-art').getAttribute('src'))?.endsWith('/capa-filme.png') ?? false,
      'a <img> aponta pro caminho certo do servidor fictício',
    )
    assert((await semCapaCard.locator('img.poster-box-art').count()) === 0, '"Filme Sem Capa" continua no placeholder')

    console.log('--- Cenário 2 (US2): capa quebrada (404) cai no placeholder, sem ícone de imagem quebrada ---')
    const quebradaCard = page.locator('.vod-grid-cell', { hasText: 'Filme Capa Quebrada' })
    const semImagemQuebrada = await waitUntil(async () => (await quebradaCard.locator('img').count()) === 0)
    assert(semImagemQuebrada, 'depois da falha de carregamento, nenhum elemento <img> resta no card (nunca o ícone nativo de imagem quebrada)')
    assert(
      await quebradaCard.locator('.poster-box-noise').isVisible(),
      'o placeholder (textura) cobre o fallback, exatamente como um item sem capa nenhuma',
    )
    assert((counts.get('/quebrada.png') ?? 0) === 1, 'só uma tentativa de carregar a URL quebrada — sem loop de novas tentativas')

    console.log('--- Séries: série sintética (SxxEyy) mostra a capa do primeiro episódio ---')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'series')
    await page.waitForSelector('.side-category-nav-item:not(:has-text("Favoritos")):not(:has-text("Histórico")):not(:has-text("Todos"))', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria "Series"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    const serieCard = page.locator('.vod-grid-cell', { hasText: 'Serie Com Capa' })
    assert((await serieCard.locator('img.poster-box-art').count()) === 1, '"Serie Com Capa" tem <img> de capa')
    assert(
      (await serieCard.locator('img.poster-box-art').getAttribute('src'))?.endsWith('/capa-serie.png') ?? false,
      'a <img> da série aponta pro caminho certo do servidor fictício',
    )

    console.log('--- Cenário 3 (US2, D-007): capa segue a janela da virtualização, nunca a categoria inteira de uma vez ---')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'movies')
    // Espera a categoria "Muitos" especificamente — não só "alguma categoria
    // real" (".live-item:not(.live-item-favorites)" já casa só com "Filmes",
    // a primeira a chegar; navegar antes de "Muitos" também estar na trilha
    // clampa o ArrowDown de volta pra "Filmes", já visitada — mesma classe
    // de corrida do R-004, agora contra a 2ª categoria, não a 1ª).
    await page.waitForSelector('.side-category-nav-item:has-text("Muitos")', { timeout: 8000 })
    await page.keyboard.press('ArrowDown') // "Filmes" (1ª categoria de filme) -> "Muitos" (2ª)
    await page.keyboard.press('ArrowRight') // entra na categoria "Muitos"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.waitForTimeout(500) // as imagens visíveis terminam de carregar

    const beforeScroll = itemIconRequestCount(counts)
    assert(beforeScroll > 0, 'entrar na categoria já carregou pelo menos uma capa (os itens visíveis na janela inicial)')
    assert(
      beforeScroll < MANY_COUNT,
      `a entrada não pediu as ${MANY_COUNT} capas de uma vez — só ${beforeScroll} requisição(ões) até aqui`,
    )

    // 40, não 10 (feature 021, R-011): o palco lógico fixo 1920×1080 (US2,
    // `.stage`) faz a área de LAYOUT do conteúdo deixar de acompanhar o
    // viewport real do Chromium headless (este script não fixa `viewport`,
    // então antes herdava o padrão do Playwright, ~1280×720) — a janela de
    // virtualização pré-carrega mais itens de cara (confirmado: idêntico com
    // viewport explícito 1920×1080 ou implícito), e 10 setas deixaram de
    // bastar pra sair dela. A asserção abaixo não mudou; só o parâmetro de
    // simulação, pra compensar uma mudança de geometria intencional da US2.
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('ArrowDown')
    }
    const afterScroll = itemIconRequestCount(counts)
    assert(
      afterScroll > beforeScroll,
      `rolar até o fim pediu mais capas (${beforeScroll} -> ${afterScroll}) — carrega conforme a pessoa navega, nunca tudo de uma vez`,
    )

    assert((counts.get('/lista.m3u') ?? 0) === 2, 'o M3U foi pedido só 2 vezes na navegação toda (1 da confirmação do cadastro, que lê só o começo — feature 045 —, e 1 do download)')
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
