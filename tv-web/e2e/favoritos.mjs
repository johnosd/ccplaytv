// Roteiro E2E da feature 013 (favoritos) — gate da constitution v1.4.0
// ("Testes E2E (Playwright) antes de validação em TV física").
//
// Cobre os fluxos principais: segurar OK favorita sem tocar o player, OK
// curto continua tocando/abrindo, a categoria "★ Favoritos" resolve e
// toca o item, o favorito sobrevive a recarregar a página, e desfavoritar
// tudo devolve um estado vazio navegável pelo controle.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção de `e2e.mjs`.
//
// Dados: só fictícios (`fixtures/favoritos.m3u`), servidos por um HTTP
// server local criado por este próprio script — nunca uma fonte real.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'favoritos.m3u')
const APP_URL = 'http://localhost:5173'
const LONG_HOLD_MS = 950 // acima do LONG_SELECT_MS (800) de useRemoteNav.ts, com folga
// Mesmo valor de FAVORITE_COLOR_KEY em tv-web/src/lib/tizenColorKey.ts — não é
// uma tecla real de teclado, então não há `page.keyboard.press` equivalente;
// só um evento sintético (ver `pressFavoriteColorKey`) exercita esse caminho.
const FAVORITE_COLOR_KEY = 'ColorF2Yellow'

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

/** Segura Enter além do limiar do gesto (tempo real — mesmo motivo dos testes unitários). */
async function holdEnter(page, ms = LONG_HOLD_MS) {
  await page.keyboard.down('Enter')
  await page.waitForTimeout(ms)
  await page.keyboard.up('Enter')
}

/** Dispara a tecla amarela (toque único, sem segurar) — segundo caminho de favoritar. */
async function pressFavoriteColorKey(page) {
  await page.evaluate((key) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  }, FAVORITE_COLOR_KEY)
}

async function addSource(page, m3uUrl) {
  console.log('=== Adicionar fonte M3U fictícia ===')
  await page.goto(APP_URL)
  await page.waitForSelector('#add-source-title', { timeout: 8000 })

  await page.getByLabel('Nome de exibição').fill('Fonte E2E Favoritos')
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()

  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  console.log('  ✓ importação concluída')
  await page.getByRole('button', { name: 'Voltar' }).click()
}

async function openLiveTv(page) {
  // Home: fonte única, card focado por padrão (col 0, linha 0) — Enter abre.
  await page.waitForSelector('.source-card', { timeout: 8000 })
  await page.keyboard.press('Enter')

  // Hub da lista: "Live TV" é o primeiro tile, focado por padrão.
  await page.waitForSelector('.tiles-row', { timeout: 8000 })
  await page.keyboard.press('Enter')

  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  const m3uUrl = `http://127.0.0.1:${port}/favoritos.m3u`

  // O binário `chrome-headless-shell` que o Playwright pediria por padrão
  // em `headless: true` não está pré-instalado neste ambiente (só a
  // versão não-headless, em `/opt/pw-browsers/chromium`) — apontar
  // direto pro binário evita a tentativa de baixar um novo.
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
  })
  const context = await browser.newContext() // storage isolado — sem limpeza manual de IndexedDB
  const page = await context.newPage()

  try {
    await addSource(page, m3uUrl)
    await openLiveTv(page)

    console.log('=== Live TV: segurar OK favorita, sem abrir o player ===')
    // Padrão: trilha focada na primeira categoria real ("Canais Teste").
    await page.keyboard.press('ArrowRight') // entra na categoria
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'Canal Alfa',
      'primeiro canal da categoria é "Canal Alfa"',
    )

    await holdEnter(page)
    assert(await page.getByText('Adicionado aos favoritos').isVisible(), 'aviso "Adicionado aos favoritos" apareceu')
    await page.waitForSelector('.fav-star', { timeout: 4000 })
    assert(await page.locator('[role="dialog"]').count() === 0, 'segurar OK não abriu o player')

    console.log('=== OK curto continua tocando o canal ===')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    assert(true, 'OK curto abriu o player (dialog)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    assert(true, 'RETURN fechou o player')

    console.log('=== "★ Favoritos" no topo da trilha resolve o canal favoritado ===')
    await page.keyboard.press('ArrowLeft') // volta pra trilha (col 0)
    await page.keyboard.press('ArrowUp') // sobe da categoria real pra "★ Favoritos"
    const favoritesLabel = await page.locator('.live-column-groups .tv-focus').textContent()
    assert(favoritesLabel === '★Favoritos', 'trilha focada em "★ Favoritos"')
    await page.keyboard.press('ArrowRight') // entra
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').allTextContents()).join(',') === 'Canal Alfa',
      '"Favoritos" mostra só o canal favoritado',
    )

    console.log('=== Persistência: recarregar a página mantém o favorito ===')
    await page.reload()
    await page.waitForSelector('.source-card', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    await page.keyboard.press('ArrowUp') // padrão cai na 1ª categoria real; sobe pra Favoritos
    await page.keyboard.press('ArrowRight')
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'Canal Alfa',
      'depois de recarregar, "Favoritos" ainda mostra o canal',
    )
    await page.waitForSelector('.fav-star', { timeout: 4000 })
    assert(true, 'estrela sobrevive ao reload')

    console.log('=== Desfavoritar tudo: estado vazio navegável pelo controle ===')
    await holdEnter(page) // desfavorita o único item — dentro de Favoritos, move o foco (sem vizinho, fica null)
    await page.waitForSelector('text=Nenhum favorito ainda', { timeout: 8000 })
    const backButtonFocused = await page
      .getByRole('button', { name: 'Voltar' })
      .evaluate((el) => el.classList.contains('tv-focus'))
    assert(backButtonFocused, 'botão "Voltar" do estado vazio está com foco')

    await page.keyboard.press('Enter') // ativação por tecla, não clique
    await page.waitForSelector('text=Nenhum favorito ainda', { state: 'detached', timeout: 8000 })
    const trailFocus = await page.locator('.live-column-groups .tv-focus').textContent()
    assert(trailFocus === '★Favoritos', 'OK no vazio devolveu o foco à trilha, em "★ Favoritos"')

    console.log('=== Filmes: mesmo gesto funciona na grade de pôsteres ===')
    await page.keyboard.press('Escape') // volta ao hub da lista
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na 1ª categoria real de Filmes
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })
    await holdEnter(page)
    await page.waitForSelector('.fav-star', { timeout: 4000 })
    assert(true, 'segurar OK favorita um filme na grade')

    console.log('=== Séries: tecla amarela favorita no toque único — segundo caminho, mesma ação ===')
    await page.keyboard.press('Escape') // sai da categoria (col 1 -> col 0, trilha)
    await page.keyboard.press('Escape') // sai da trilha -> hub da lista
    await page.waitForSelector('.tiles-row', { timeout: 8000 })
    // ListHomeScreen remonta ao voltar do hub — foco reinicia em "Live TV" (índice 0).
    await page.keyboard.press('ArrowRight') // Live TV -> Filmes
    await page.keyboard.press('ArrowRight') // Filmes -> Séries
    await page.keyboard.press('Enter')
    await page.waitForSelector('.poster-grid, .live-state', { timeout: 8000 })
    await page.keyboard.press('ArrowRight') // entra na 1ª categoria real de Séries
    await page.waitForSelector('.poster-card-title', { timeout: 8000 })

    await pressFavoriteColorKey(page)
    // Ao contrário de `holdEnter`, a tecla de cor dispara num só toque —
    // sem os ~950ms de espera real embutidos no gesto de segurar — então a
    // mutação assíncrona (`favoriteToggle.toggle`) ainda pode não ter
    // resolvido no instante seguinte; `waitForSelector` espera, `isVisible`
    // sozinho checaria só o instante atual.
    await page.waitForSelector('text=Adicionado aos favoritos', { timeout: 4000 })
    assert(true, 'tecla amarela também mostra "Adicionado aos favoritos"')
    await page.waitForSelector('.fav-star', { timeout: 4000 })
    assert((await page.locator('[role="dialog"]').count()) === 0, 'tecla amarela não abriu o player')
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
