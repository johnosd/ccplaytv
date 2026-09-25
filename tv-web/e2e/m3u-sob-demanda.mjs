// Roteiro E2E da feature 014 (fonte M3U estrutura-primeiro) — gate da
// constitution v1.5.0 ("Testes E2E (Playwright) antes de validação em TV
// física").
//
// Cenário A (US1, T018): URL M3U de um painel Xtream fictício que responde
// ao protocolo — a importação conclui contando categorias, nunca pede
// `get.php`, a fonte não ganha o selo "Modo limitado", e entrar numa
// categoria traz os itens dela.
//
// Cenário B (US2, T026): URL M3U de painel fictício cujo `player_api.php`
// responde 404 — a importação cai no caminho integral (Modo limitado),
// a Home mostra o selo, e o hub da lista explica o motivo real
// (protocol_unavailable), sem usuário, senha ou URL na página.
//
// Cenário C (US3, T040): URL M3U avulsa (sem painel por trás) — a
// importação baixa o arquivo uma única vez, conclui sem gravar item
// nenhum, e cada categoria (duas de Live TV, uma de Filmes, a de Séries)
// só aparece quando a pessoa entra nela, sem nenhuma requisição nova.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção de `e2e.mjs`/`e2e/favoritos.mjs`.
//
// Dados: só fictícios, servidos por um HTTP server local criado por este
// próprio script — nunca uma fonte real. Credenciais (`usuario`/`senha`)
// são fixas e óbvias de propósito, para não parecerem reais se vazarem por
// engano num log de teste.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'm3u-sob-demanda')
const PAINEL_M3U = readFileSync(path.join(FIXTURES_DIR, 'painel.m3u'))
const AVULSA_M3U = readFileSync(path.join(FIXTURES_DIR, 'avulsa.m3u'))
const APP_URL = 'http://localhost:5173'
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/**
 * Painel Xtream fictício. Conta requisições por caminho (`counts`) — é
 * como os cenários provam "nenhum pedido a get.php" sem depender de rede
 * real. Responde ao protocolo JSON inteiro: conta, categorias e streams de
 * canal ao vivo; filmes/séries voltam vazios (categoria legítima vazia,
 * não seção indisponível).
 */
function startPanelServer() {
  const counts = { getPhp: 0, playerApi: 0 }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/get.php') {
      counts.getPhp += 1
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(PAINEL_M3U)
      return
    }

    if (url.pathname === '/player_api.php') {
      counts.playerApi += 1
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })

      if (action === 'get_live_categories') {
        res.end(JSON.stringify([{ category_id: '1', category_name: 'Esportes' }]))
        return
      }
      if (action === 'get_live_streams') {
        res.end(JSON.stringify([{ name: 'ESPN', stream_id: 9, category_id: '1' }]))
        return
      }
      if (action === 'get_vod_categories' || action === 'get_series_categories') {
        res.end(JSON.stringify([]))
        return
      }
      // Sem ação (ou get_account_info/get_profile): status da conta.
      res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
      return
    }

    res.writeHead(404)
    res.end('não encontrado')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, counts }))
  })
}

/**
 * Painel fictício que autentica mas não responde ao protocolo de catálogo
 * — o `player_api.php` de consulta de conta funciona (senão a importação
 * falharia com `invalid_credentials`, nunca chegando ao Modo limitado);
 * qualquer chamada com `action=get_*` (categorias) volta 404.
 */
function startLimitedPanelServer() {
  const counts = { getPhp: 0, playerApi: 0 }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/get.php') {
      counts.getPhp += 1
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(PAINEL_M3U)
      return
    }

    if (url.pathname === '/player_api.php') {
      counts.playerApi += 1
      const action = url.searchParams.get('action')
      if (action) {
        res.writeHead(404)
        res.end('não encontrado')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
      return
    }

    res.writeHead(404)
    res.end('não encontrado')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, counts }))
  })
}

/**
 * Servidor fictício de uma lista M3U avulsa — sem painel Xtream por trás,
 * só o arquivo estático. Conta requisições: depois da importação, entrar
 * numa categoria não pode gerar nenhuma a mais (o conteúdo já está
 * guardado no aparelho, D-004).
 */
function startAvulsaServer() {
  const counts = { requests: 0 }

  const server = createServer((req, res) => {
    counts.requests += 1
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
    res.end(AVULSA_M3U)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, counts }))
  })
}

async function addSource(page, m3uUrl, displayName = 'Fonte E2E M3U Painel') {
  console.log(`=== Adicionar fonte por URL M3U (${displayName}) ===`)
  await page.waitForSelector('#add-source-title', { timeout: 8000 })

  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()

  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
}

/**
 * Abre "Adicionar lista" a partir da Home, navegando pelo controle (sem
 * clique — o card "+" só responde a SELECT, como o resto da tela).
 * `existingSourceCount` é quantos cards de fonte já existem antes deste:
 * é a distância, em `ArrowRight`, do primeiro card até o card "+".
 */
async function openAddSourceFromHome(page, existingSourceCount) {
  await page.waitForSelector('.source-card', { timeout: 8000 })
  for (let i = 0; i < existingSourceCount; i += 1) {
    await page.keyboard.press('ArrowRight')
  }
  await page.keyboard.press('Enter')
}

/**
 * Mesmo binário fixo de `e2e/favoritos.mjs` quando ele existe (sandbox
 * onde o `chrome-headless-shell` padrão não vem pré-instalado); caindo
 * para a resolução normal do Playwright nos demais ambientes (ex.:
 * máquina de desenvolvimento Windows), sem exigir o mesmo caminho fixo.
 */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) {
    return chromium.launch({ headless: true, executablePath: fixedPath })
  }
  return chromium.launch({ headless: true })
}

async function run() {
  const panel = await startPanelServer()
  const limitedPanel = await startLimitedPanelServer()
  const avulsa = await startAvulsaServer()
  const m3uUrl = `http://127.0.0.1:${panel.server.address().port}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`
  const limitedM3uUrl = `http://127.0.0.1:${limitedPanel.server.address().port}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`
  const avulsaUrl = `http://127.0.0.1:${avulsa.server.address().port}/lista.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log('=== Cenário A (US1): painel confirmado importa só categorias ===')
    await page.goto(APP_URL)
    await addSource(page, m3uUrl)

    assert(panel.counts.getPhp === 0, 'nenhuma requisição a get.php durante a importação')
    assert(panel.counts.playerApi > 0, 'a importação de fato consultou o protocolo JSON')

    await page.waitForSelector('.source-card', { timeout: 8000 })
    assert(
      (await page.locator('text=Modo limitado').count()) === 0,
      'a fonte não ganhou o selo "Modo limitado" (painel confirmado)',
    )

    console.log('=== Live TV: categoria única mostra o canal do painel ===')
    await page.keyboard.press('Enter') // abre a fonte
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('Enter') // Live TV é o primeiro tile

    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria "Esportes"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'ESPN',
      'canal "ESPN" aparece na categoria',
    )
    assert(panel.counts.getPhp === 0, 'entrar na categoria também não pediu get.php')

    console.log('=== Cenário B (US2): painel que não responde ao protocolo entra em Modo limitado ===')
    await page.goto(APP_URL) // volta pra Home com a fonte do cenário A já cadastrada
    await openAddSourceFromHome(page, 1)
    // Nome sem a palavra "limitado" de propósito — não pode colidir com o
    // texto do selo/explicação que os asserts abaixo procuram.
    await addSource(page, limitedM3uUrl, 'Fonte E2E Sem Protocolo')

    assert(limitedPanel.counts.getPhp > 0, 'sem confirmar o protocolo, o caminho integral baixou o get.php')

    await page.waitForSelector('.source-card', { timeout: 8000 })
    const limitedCard = page.locator('.source-card-wrap', { hasText: 'Fonte E2E Sem Protocolo' })
    assert(
      (await limitedCard.locator('.source-card-badge', { hasText: 'Modo limitado' }).count()) === 1,
      'a segunda fonte ganhou o selo "Modo limitado" na Home',
    )
    assert(
      (await page
        .locator('.source-card-wrap', { hasText: 'Fonte E2E M3U Painel' })
        .locator('.source-card-badge', { hasText: 'Modo limitado' })
        .count()) === 0,
      'a primeira fonte (painel confirmado) continua sem o selo',
    )

    console.log('=== Hub da lista explica o motivo, sem vazar usuário/senha ===')
    await page.keyboard.press('ArrowRight') // 1º card (painel) -> 2º card (Modo limitado)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    assert(
      await page.locator('.limited-mode-notice-title', { hasText: 'Modo limitado' }).isVisible(),
      'hub mostra o título "Modo limitado"',
    )
    assert(
      await page.getByText(/não respondeu ao protocolo completo/).isVisible(),
      'hub explica o motivo protocol_unavailable',
    )

    const pageText = (await page.locator('body').textContent()) ?? ''
    assert(!pageText.includes(PANEL_USER), 'a página não contém o usuário fictício')
    assert(!pageText.includes(PANEL_PASS), 'a página não contém a senha fictícia')
    assert(!pageText.includes('get.php'), 'a página não contém o caminho get.php')

    console.log('=== Cenário C (US3): lista avulsa — nada gravado na importação, tudo sob demanda ===')
    await page.goto(APP_URL)
    await openAddSourceFromHome(page, 2) // painel + Modo limitado já cadastrados
    await addSource(page, avulsaUrl, 'Fonte E2E Avulsa')

    assert(avulsa.counts.requests === 1, 'a importação baixou o arquivo uma única vez')

    await page.waitForSelector('.source-card', { timeout: 8000 })
    const avulsaCard = page.locator('.source-card-wrap', { hasText: 'Fonte E2E Avulsa' })
    assert(
      (await avulsaCard.locator('.source-card-badge', { hasText: 'Modo limitado' }).count()) === 0,
      'lista avulsa não ganha o selo "Modo limitado" (nunca houve painel)',
    )

    console.log('--- Live TV: duas categorias, sem nenhuma requisição nova ---')
    await page.keyboard.press('ArrowRight') // painel -> Modo limitado
    await page.keyboard.press('ArrowRight') // Modo limitado -> Avulsa
    await page.keyboard.press('Enter')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('Enter') // Live TV

    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Canais | Esportes" (1ª categoria)
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').allTextContents()).join(',') ===
        'ESPN Fictício,Fox Sports Fictício',
      'categoria "Canais | Esportes" mostra os dois canais fictícios',
    )
    assert(avulsa.counts.requests === 1, 'entrar na 1ª categoria não pediu o arquivo de novo')

    await page.keyboard.press('ArrowLeft') // volta pra trilha
    await page.keyboard.press('ArrowDown') // "Canais | Esportes" -> "Canais | Variedades"
    await page.keyboard.press('ArrowRight') // entra
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) ===
        'Canal Variedades Fictício',
      'categoria "Canais | Variedades" mostra o canal fictício',
    )
    assert(avulsa.counts.requests === 1, 'entrar na 2ª categoria também não pediu o arquivo de novo')

    console.log('--- Voltar à 1ª categoria: itens na hora, sem releitura ---')
    // Sai até a Home e reentra em Live TV — mais robusto que navegar a
    // trilha por índice relativo, e o padrão continua o mesmo: o foco
    // volta à 1ª categoria real (favoritos.mjs já assume isso).
    await page.keyboard.press('ArrowLeft') // sai da categoria -> trilha
    await page.keyboard.press('Escape') // sai da trilha -> hub da lista
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('Enter') // Live TV de novo
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // 1ª categoria real: "Canais | Esportes"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'ESPN Fictício',
      'voltar à 1ª categoria mostra os itens sem esperar',
    )
    assert(avulsa.counts.requests === 1, 'voltar a uma categoria já lida não relê o arquivo')

    console.log('--- Filmes: categoria própria, mesma garantia ---')
    await page.keyboard.press('Escape') // sai da categoria -> trilha
    await page.keyboard.press('Escape') // sai da trilha -> hub da lista
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria "Filmes"
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.poster-card-title').first().textContent()) === 'Um Filme Fictício',
      'categoria "Filmes" mostra o filme fictício',
    )
    assert(avulsa.counts.requests === 1, 'entrar em Filmes também não pediu o arquivo de novo')

    console.log('--- Séries: série sintética (SxxEyy) na própria categoria ---')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('ArrowRight') // Filmes -> Séries
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na categoria "Series"
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.poster-card-title').first().textContent()) === 'Série Fictícia',
      'categoria "Series" mostra a série sintética (agrupada dos dois episódios)',
    )
    assert(avulsa.counts.requests === 1, 'entrar em Séries também não pediu o arquivo de novo — a série veio do mesmo bloco guardado')
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
  } finally {
    await browser.close()
    panel.server.close()
    limitedPanel.server.close()
    avulsa.server.close()
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
