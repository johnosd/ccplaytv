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
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
}

async function run() {
  const server = await startServer()
  const m3uUrl = `http://127.0.0.1:${server.address().port}/lista.m3u`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))

  try {
    await addSource(page, m3uUrl, 'Fonte E2E Live V14')
    await openLiveFromTopbar(page)
    await assertOneFocus(page, 'entrada na Live, foco na trilha')

    console.log('=== Topbar ↔ Live: subir/descer o foco, RETURN em camadas ===')
    await page.keyboard.press('ArrowUp') // 1ª categoria real -> "Todos"
    await page.keyboard.press('ArrowUp') // "Todos" -> "★ Favoritos"
    await page.keyboard.press('ArrowUp') // "★ Favoritos" -> topbar
    await page.waitForSelector('.topbar-item.tv-focus', { timeout: 4000 })
    assert(
      (await page.locator('.topbar-item.tv-focus').textContent()) === 'TV ao vivo',
      'subir a partir do topo da trilha leva o foco à topbar, no destino atual',
    )
    await assertOneFocus(page, 'foco na topbar')

    await page.keyboard.press('ArrowDown') // topbar -> conteúdo, mesmo item de onde saiu
    assert(
      (await page.locator('.side-category-nav-item.tv-focus .side-category-nav-label').textContent()) === 'Favoritos',
      'descer da topbar devolve o foco ao mesmo item da trilha, sem o mover',
    )

    await page.keyboard.press('ArrowUp') // trilha -> topbar de novo
    await page.keyboard.press('Escape') // RETURN na topbar -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert(true, 'RETURN na topbar (dentro da Live) volta ao Início')

    await openLiveFromTopbar(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp') // trilha -> topbar
    await page.keyboard.press('ArrowRight') // "TV ao vivo" -> "Filmes"
    assert((await page.locator('.topbar-item.tv-focus').textContent()) === 'Filmes', 'seta pra direita move o foco pra "Filmes" na topbar')
    await page.keyboard.press('Enter') // switch-top: troca sem empilhar a Live
    await page.waitForSelector('.vod-screen, .live-state', { timeout: 8000 })
    assert(true, '"Filmes" na topbar da Live troca de tela (switch-top)')
    // Filmes também ganhou topbar persistente (feature 025, Onda 4) — RETURN
    // na trilha (col 0) continua indo direto ao Início (D-003 da 025).
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert(true, 'RETURN a partir de Filmes volta ao Início — nunca à Live (D-004)')

    console.log('=== Preview: Assistir, Favoritar, Guia completo, ← volta ao canal ===')
    await openLiveFromTopbar(page)
    await page.keyboard.press('ArrowRight') // entra em "Canais | Esportes"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await assertOneFocus(page, 'canal focado na lista')

    await page.keyboard.press('ArrowRight') // canal -> preview
    await page.waitForSelector('.live-preview-action.tv-focus', { timeout: 4000 })
    assert((await page.locator('.live-preview-action.tv-focus').textContent()) === 'Assistir', '→ no canal foca "Assistir" no preview')
    await assertOneFocus(page, 'preview, "Assistir" focado')

    await page.keyboard.press('ArrowDown') // "Assistir" -> "Favoritar"
    assert((await page.locator('.live-preview-action.tv-focus').textContent()) === 'Favoritar', '↓ move o foco pra "Favoritar"')
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=Adicionado aos favoritos', { timeout: 4000 })
    assert((await page.locator('.live-preview-action.tv-focus').textContent()) === 'Favorito', 'depois de favoritar, o rótulo vira "Favorito"')

    await page.keyboard.press('ArrowDown') // "Favorito" -> "Guia completo"
    assert((await page.locator('.live-preview-action.tv-focus').textContent()) === 'Guia completo', '↓ move o foco pra "Guia completo"')
    await page.keyboard.press('Enter')
    // Feature 031: "Guia completo" deixou de ser mock — abre o guia em tela cheia.
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

    await page.keyboard.press('ArrowRight') // canal -> preview
    await page.waitForSelector('.live-preview-action.tv-focus', { timeout: 4000 })
    await page.keyboard.press('ArrowLeft') // preview -> o MESMO canal
    await page.waitForSelector('.live-channel-row.tv-focus', { timeout: 4000 })
    assert(
      (await page.locator('.live-channel-row.tv-focus').textContent())?.includes('Globo Esportes'),
      '← a partir do preview volta ao mesmo canal de onde saiu',
    )
    await assertOneFocus(page, 'de volta ao canal, depois do preview')

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

    await page.keyboard.press('ArrowLeft') // canal -> trilha
    await page.keyboard.press('ArrowUp') // Esportes -> Todos
    await page.keyboard.press('ArrowRight') // entra em "Todos"
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    const numberInAll = await page
      .locator('.live-channel-row', { hasText: 'Globo Esportes' })
      .locator('.channel-row-number')
      .textContent()
    assert(numberInAll === numberInCategory, '"Todos" mostra o mesmo número 001 pro mesmo canal')

    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowUp') // Todos -> ★ Favoritos
    await page.keyboard.press('ArrowRight') // entra em "★ Favoritos" (Globo Esportes foi favoritado acima)
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    const numberInFavorites = await page
      .locator('.live-channel-row', { hasText: 'Globo Esportes' })
      .locator('.channel-row-number')
      .textContent()
    assert(numberInFavorites === numberInCategory, '"★ Favoritos" também mostra o mesmo número 001')

    console.log('=== 500 canais: só a janela visível (+ overscan) é montada (SC-004) ===')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowDown') // ★ Favoritos -> Todos
    await page.keyboard.press('ArrowDown') // Todos -> Esportes
    await page.keyboard.press('ArrowDown') // Esportes -> Notícias
    await page.keyboard.press('ArrowDown') // Notícias -> Muitos
    await page.waitForSelector('.side-category-nav-item.tv-focus:has-text("Muitos")', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra em "Muitos" (500 canais)
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
