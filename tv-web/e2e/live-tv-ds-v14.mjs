// Roteiro E2E da feature 024 (Live TV no Design System V14, Onda 3) — gate
// da constitution v1.5.0 ("Testes E2E (Playwright) antes de validação em TV
// física").
//
// Cobre o que só um Chromium real prova (jsdom não faz layout nem CSS):
// topbar ↔ Live TV (subir/descer o foco, RETURN em camadas, trocar pra
// Filmes sem passar pelo Início); preview do canal (Assistir/Favoritar/Guia
// completo, ← volta ao canal); logo quebrado nunca vira o ícone nativo de
// imagem quebrada; o mesmo canal mostra o mesmo número em categoria/Todos/
// Favoritos (SC-005); virtualização com 500 canais (SC-004); e, depois de
// cada passo do roteiro, exatamente um elemento com foco visível (SC-002).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios, montados neste próprio script (não um arquivo
// estático — a URL do logo quebrado precisa apontar pro servidor fictício
// deste script, cuja porta só existe em tempo de execução; mesmo padrão de
// `capa-real.mjs`, feature 015).
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

/** SC-002: depois de cada passo do roteiro, exatamente um elemento com foco visível. */
async function assertOneFocus(page, step) {
  const count = await page.locator('.tv-focus').count()
  assert(count === 1, `SC-002 (${step}): exatamente um .tv-focus na tela (achou ${count})`)
}

// Categoria "Muitos" grande o bastante pra nunca caber inteira numa janela
// real de navegador (mesmo limiar que `capa-real.mjs`, feature 015, achou:
// 60 coube inteiro; 500 dá margem confortável mesmo se o viewport crescer).
const MANY_COUNT = 500

function buildM3u(baseUrl) {
  const lines = [
    '#EXTM3U',
    `#EXTINF:-1 tvg-logo="${baseUrl}/logo-ok.png" group-title="Canais | Esportes",Globo Esportes`,
    'http://exemplo.test/live/1.ts',
    // Logo quebrado (404 no servidor fictício) — precisa cair no fallback
    // de iniciais, nunca no ícone nativo de imagem quebrada do navegador.
    `#EXTINF:-1 tvg-logo="${baseUrl}/logo-quebrado.png" group-title="Canais | Esportes",ESPN Quebrado`,
    'http://exemplo.test/live/2.ts',
    '#EXTINF:-1 group-title="Canais | Notícias",Globo Notícias',
    'http://exemplo.test/live/3.ts',
  ]
  for (let i = 0; i < MANY_COUNT; i += 1) {
    lines.push(`#EXTINF:-1 group-title="Canais | Muitos",Canal ${String(i).padStart(3, '0')}`)
    lines.push(`http://exemplo.test/live/muitos-${i}.ts`)
  }
  return lines.join('\n')
}

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/lista.m3u') {
      const base = `http://127.0.0.1:${server.address().port}`
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end(buildM3u(base))
      return
    }
    if (url.pathname === '/logo-ok.png') {
      // PNG 1×1 transparente — só precisa carregar de verdade, não ser bonito.
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      )
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(pixel)
      return
    }
    // /logo-quebrado.png (404 de propósito) e qualquer outro caminho.
    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function addSource(page, m3uUrl, displayName) {
  await page.goto(APP_URL)
  // Feature 023: sem lista, a tela de perfis só tem "Adicionar lista", já em foco.
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: displayName, url: m3uUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  // "Abrir lista" (FR-038) já entra direto no Início da fonte recém-criada.
  await page.waitForSelector('.topbar', { timeout: 8000 })
}

async function openLiveFromTopbar(page) {
  await page.waitForSelector('.topbar-item', { timeout: 8000 })
  await page.getByRole('button', { name: 'TV ao vivo', exact: true }).click()
  await page.waitForSelector('.live-column-groups', { state: 'attached', timeout: 8000 })
}

async function run() {
  const server = await startServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/lista.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    await addSource(page, m3uUrl, 'Fonte E2E Live V14')
    await openLiveFromTopbar(page)
    await assertOneFocus(page, 'entrada na Live, foco na trilha')

    // Feature 068 (US2): a Live não tem mais topbar nem título — a saída é RETURN, que volta ao Início.
    console.log('=== Sem topbar na Live: ↑ no topo fica na trilha, RETURN volta ao Início (feature 068) ===')
    assert((await page.locator('.topbar').count()) === 0, 'a Live não desenha a topbar')
    assert((await page.getByRole('heading', { name: 'TV ao vivo' }).count()) === 0, 'nem o título "TV ao vivo"')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp') // até o topo da trilha, e uma a mais
    assert(
      (await page.locator('.side-category-nav-item.tv-focus .side-category-nav-label').textContent()) === 'Favoritos',
      '↑ no topo da trilha não sai dela (não há topbar para onde subir)',
    )
    await assertOneFocus(page, 'topo da trilha')
    await page.keyboard.press('Escape') // RETURN na trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert(true, 'RETURN na trilha volta ao Início')

    console.log('=== Destaque informativo: Segurar OK favorita, ícone de Guia ao lado da lupa, RETURN (feature 049) ===')
    await openLiveFromTopbar(page)
    await page.keyboard.press('Enter') // entra em "Canais | Esportes"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await assertOneFocus(page, 'canal focado na lista')
    assert((await page.locator('.live-preview-panel button').count()) === 0, 'o destaque não tem botões nem ação focável')

    await page.keyboard.down('Enter') // Segurar OK: favorita o canal focado
    await page.waitForTimeout(1100)
    await page.keyboard.up('Enter')
    await page.waitForSelector('text=Adicionado aos favoritos', { timeout: 4000 })
    assert(true, 'Segurar OK no canal focado o favorita')

    await page.keyboard.press('ArrowUp') // 1º canal -> lupa
    await page.waitForSelector('.search-icon-button.tv-focus', { timeout: 4000 })
    await page.keyboard.press('ArrowRight') // lupa -> ícone de Guia completo
    await page.waitForSelector('.live-guide-button.tv-focus', { timeout: 4000 })
    assert((await page.locator('.live-guide-button.tv-focus').getAttribute('aria-label')) === 'Guia completo', '→ na lupa foca o ícone de Guia completo')
    await assertOneFocus(page, 'ícone de Guia focado')
    await page.keyboard.press('Enter')
    // Feature 031: o guia abre em tela cheia.
    await page.waitForSelector('.epg-guide', { timeout: 4000 })
    assert((await page.locator('text=/Em breve/').count()) === 0, '"Guia completo" não mostra mais aviso "Em breve"')
    assert((await page.locator('[role="dialog"]').count()) === 0, '"Guia completo" nunca abre o player')
    await page.keyboard.press('Escape') // RETURN fecha o guia e devolve o foco ao canal de origem
    await page.waitForSelector('.epg-guide', { state: 'detached', timeout: 4000 })
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 4000 })
    assert(
      (await page.locator('.live-channel-row.tv-focus').textContent())?.includes('Globo Esportes'),
      'RETURN do guia volta ao mesmo canal de origem',
    )
    await assertOneFocus(page, 'de volta ao canal, depois do guia')
    console.log('=== Logo quebrado: fallback de iniciais, nunca o ícone nativo de imagem quebrada ===')
    await page.keyboard.press('ArrowDown') // "Globo Esportes" -> "ESPN Quebrado"
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 4000 })
    const quebradoRow = page.locator('.live-channel-row', { hasText: 'ESPN Quebrado' })
    const semImagemQuebrada = await (async () => {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        if ((await quebradoRow.locator('img').count()) === 0) return true
        await page.waitForTimeout(100)
      }
      return false
    })()
    assert(semImagemQuebrada, 'depois da falha de carregamento, nenhum <img> resta na linha (nunca o ícone nativo de imagem quebrada)')
    assert(await quebradoRow.locator('.poster-box-initials').isVisible(), 'as iniciais aparecem no lugar do logo')

    console.log('=== Número do canal: o mesmo em categoria, "Todos" e "★ Favoritos" (SC-005) ===')
    const numberInCategory = await page
      .locator('.live-channel-row', { hasText: 'Globo Esportes' })
      .locator('.channel-row-number')
      .textContent()
    assert(numberInCategory === '001', '"Globo Esportes" é o canal 001 (1ª categoria, 1º da ordem)')

    await page.keyboard.press('Escape') // canal -> trilha
    await page.keyboard.press('ArrowUp') // Esportes -> Todos
    await page.keyboard.press('Enter') // entra em "Todos"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    const numberInAll = await page
      .locator('.live-channel-row', { hasText: 'Globo Esportes' })
      .locator('.channel-row-number')
      .textContent()
    assert(numberInAll === numberInCategory, '"Todos" mostra o mesmo número 001 pro mesmo canal')

    await page.keyboard.press('Escape') // lista -> trilha
    await page.keyboard.press('ArrowUp') // Todos -> ★ Favoritos
    await page.keyboard.press('Enter') // entra em "★ Favoritos" (Globo Esportes foi favoritado acima)
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    const numberInFavorites = await page
      .locator('.live-channel-row', { hasText: 'Globo Esportes' })
      .locator('.channel-row-number')
      .textContent()
    assert(numberInFavorites === numberInCategory, '"★ Favoritos" também mostra o mesmo número 001')

    console.log('=== 500 canais: só a janela visível (+ overscan) é montada (SC-004) ===')
    await page.keyboard.press('Escape') // lista -> trilha
    await page.keyboard.press('ArrowDown') // ★ Favoritos -> Todos
    await page.keyboard.press('ArrowDown') // Todos -> Esportes
    await page.keyboard.press('ArrowDown') // Esportes -> Notícias
    await page.keyboard.press('ArrowDown') // Notícias -> Muitos
    await page.waitForSelector('.side-category-nav-item.tv-focus:has-text("Muitos")', { timeout: 8000 })
    await page.keyboard.press('Enter') // entra em "Muitos" (500 canais)
    await page.waitForSelector('.live-channel-list .live-channel-row', { timeout: 8000 })

    const mountedBefore = await page.locator('.live-channel-list .live-channel-row').count()
    assert(mountedBefore > 0, 'a categoria "Muitos" mostra pelo menos um canal')
    assert(mountedBefore < MANY_COUNT, `só uma fração dos ${MANY_COUNT} canais está no DOM (${mountedBefore} montados)`)

    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown')
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 4000 })
    const mountedAfter = await page.locator('.live-channel-list .live-channel-row').count()
    assert(mountedAfter < MANY_COUNT, `depois de rolar, ainda só uma fração está no DOM (${mountedAfter} montados)`)
    assert(
      (await page.locator('.live-channel-row.tv-focus').textContent())?.includes('Canal 040'),
      'rolar 40 vezes move o foco até "Canal 040", trazendo-o pra dentro da janela renderizada',
    )
    await assertOneFocus(page, 'categoria grande, depois de rolar')
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
