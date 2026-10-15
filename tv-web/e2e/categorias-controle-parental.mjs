// Roteiro E2E da feature 066 (gestão de categorias e controle parental).
//
// Lista Xtream fictícia servida por este script: Filmes "Ação" (2), "Terror" (1) e "XXX Adultos" (1). Percorre, só
// pelo teclado: esconder "Terror" em Configurações › Configurar › Categorias & controle parental (contando as teclas
// desde o Início, SC-004)
// e não achá-la na vitrine nem em "Todos"; ligar o controle parental (sugestão adulta pré-marcada → PIN 2×); cadeado e
// "XXX Adultos" no fim da trilha (D-013); entrar pede o PIN (errado avisa, certo abre); segundo plano rebloqueia;
// "Esqueci o PIN" com usuário/senha da lista cria um PIN novo sem nenhuma requisição ao painel; "Adicionar lista" não
// pede PIN e "Editar" a lista protegida pede o dela (feature 067: o PIN é por lista). Capturas em `test-results/categorias-controle-parental/`.
//
// Pré-requisito: `npm run dev` em http://localhost:5173.
import { createServer } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { cadastrarListaXtream } from './lib/entrada.mjs'
import { focusSideItem, openShowcase, openViaTopbar, openVodCategory } from './lib/vod.mjs'

const APP_URL = 'http://localhost:5173'
const LISTA = 'Fonte E2E Parental'
const SHOTS = path.join(process.cwd(), 'test-results', 'categorias-controle-parental')

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else console.log(`  ✓ ${message}`)
}

/** Painel Xtream fictício; conta as requisições (a recuperação do PIN não pode fazer nenhuma). */
function startPanel() {
  const panel = { requests: 0, log: [] }
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      panel.requests += 1
      const url = new URL(req.url, 'http://127.0.0.1')
      panel.log.push(`${url.searchParams.get('action') ?? url.pathname}${url.searchParams.get('category_id') ? `:${url.searchParams.get('category_id')}` : ''}`)
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (url.pathname !== '/player_api.php') {
        res.writeHead(404)
        res.end('não encontrado')
        return
      }
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (action === 'get_live_categories')
        return res.end(JSON.stringify([{ category_id: '10', category_name: 'Notícias' }, { category_id: '11', category_name: 'Esportes' }]))
      if (action === 'get_live_streams') {
        const canais = [
          { name: 'Canal N1', stream_id: 1001, category_id: '10' },
          { name: 'Canal N2', stream_id: 1002, category_id: '10' },
          { name: 'Canal E1', stream_id: 1101, category_id: '11' },
          { name: 'Canal E2', stream_id: 1102, category_id: '11' },
        ]
        const wanted = url.searchParams.get('category_id')
        return res.end(JSON.stringify(wanted ? canais.filter((c) => c.category_id === wanted) : canais))
      }
      if (action === 'get_series_categories' || action === 'get_series') return res.end('[]')
      if (action === 'get_vod_categories')
        return res.end(
          JSON.stringify([
            { category_id: '1', category_name: 'Ação' },
            { category_id: '2', category_name: 'Terror' },
            { category_id: '3', category_name: 'XXX Adultos' },
          ]),
        )
      if (action === 'get_vod_streams') {
        const filmes = [
          { name: 'Ação Um', stream_id: 11, category_id: '1' },
          { name: 'Ação Dois', stream_id: 12, category_id: '1' },
          { name: 'Medo Total', stream_id: 21, category_id: '2' },
          { name: 'Noite Proibida', stream_id: 31, category_id: '3' },
        ].map((filme) => ({ ...filme, added: '1700000000' }))
        const wanted = url.searchParams.get('category_id')
        return res.end(JSON.stringify(wanted ? filmes.filter((f) => f.category_id === wanted) : filmes))
      }
      return res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, panel }))
  })
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const typePin = async (page, pin) => {
  for (const digit of pin) await page.keyboard.press(digit)
}
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true }).waitFor({ timeout: 8000 })

/** Teclas pressionadas desde um ponto (SC-004). */
let keyCount = 0
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i += 1) {
    keyCount += 1
    await page.keyboard.press(key)
  }
}

/** Do Início, abre Configurações pela engrenagem da topbar (procura pelo nome — a ordem dos itens mudou com o tempo). */
async function openSettings(page) {
  // Sobe só até a topbar ganhar o foco (cada tecla conta para o SC-004).
  for (let i = 0; i < 6 && (await page.locator('.topbar .tv-focus').count()) === 0; i += 1) await press(page, 'ArrowUp')
  for (let i = 0; i < 12; i += 1) {
    const name = await page.locator('.topbar .tv-focus').first().getAttribute('aria-label').catch(() => null)
    const text = await page.locator('.topbar .tv-focus').first().textContent().catch(() => '')
    if (/Configurações/.test(`${name ?? ''} ${text ?? ''}`)) break
    await press(page, 'ArrowRight')
  }
  await press(page, 'Enter')
  await page.waitForSelector('.settings-screen', { timeout: 8000 })
}

/**
 * Feature 067: a gestão mora em Configurações da lista. Na coluna de abas de Configurações (começa em Fontes IPTV):
 * → entra na linha da lista, OK em "Configurar" abre a tela da lista, ↓↓ vai a "Categorias & controle parental" e →
 * entra no painel. Cada tecla conta para o SC-004.
 */
async function enterParentalTab(page) {
  await press(page, 'ArrowRight')
  await press(page, 'Enter')
  await page.getByRole('heading', { name: /Configurações da lista/ }).waitFor({ timeout: 8000 })
  await press(page, 'ArrowDown', 2)
  await press(page, 'ArrowRight')
}

async function backHome(page) {
  for (let i = 0; i < 6 && (await page.locator('.home-content').count()) === 0; i += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await page.waitForSelector('.home-content', { timeout: 8000 })
}

/** Na Live, foca a entrada da trilha cujo texto contém `name` (sobe até o topo e desce). */
async function focusLiveTrail(page, name) {
  await page.waitForSelector('.live-column-groups .side-category-nav-item', { timeout: 10000 })
  const focused = async () => (await page.locator('.live-column-groups .side-category-nav-item.tv-focus').first().textContent().catch(() => '')) ?? ''
  for (let i = 0; i < 8 && !(await focused()).includes('Favoritos'); i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 12; i += 1) {
    if ((await focused()).includes(name)) return true
    await page.keyboard.press('ArrowDown')
  }
  return false
}

const liveTrailNames = (page) => page.locator('.live-column-groups .side-category-nav-item').allTextContents()
const liveRows = (page) => page.locator('.live-channel-row').allTextContents()
const channelNumber = (page, name) => page.locator('.live-channel-row', { hasText: name }).locator('.channel-row-number').first().textContent({ timeout: 8000 })

/** Busca global, pelo mesmo índice que a tela usa (a lupa saiu da topbar; isto cobre o caminho de dados no navegador). */
const globalSearchText = (page, term) =>
  page.evaluate(async (wanted) => {
    const { db } = await import('/src/lib/catalog/db.ts')
    const search = await import('/src/lib/catalog/globalSearch.ts')
    const sourceId = (await db.sources.toArray())[0].id
    return JSON.stringify(search.searchGlobal(await search.loadGlobalSearchIndex(sourceId), wanted))
  }, term)

async function sideNames(page) {
  return page.locator('.vod-showcase .side-category-nav-item').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''))
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const { server, panel } = await startPanel()
  const fixedPath = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(fixedPath) ? { headless: true, executablePath: fixedPath } : { headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1920, height: 1080 } })).newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  const consoleLines = []
  page.on('console', (message) => consoleLines.push(message.text()))
  const port = server.address().port

  try {
    console.log('=== Lista fictícia ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card.tv-focus', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaXtream(page, { nome: LISTA, servidor: `http://127.0.0.1:${port}`, usuario: 'usuario-e2e', senha: 'senha-e2e' })
    await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: LISTA }).waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })

    console.log('=== Antes de esconder: canais lidos e um favorito de Terror ===')
    await openViaTopbar(page, 'live')
    assert(await focusLiveTrail(page, 'Notícias'), 'trilha da Live com "Notícias"')
    await page.keyboard.press('Enter')
    await page.locator('.live-channel-row', { hasText: 'Canal N1' }).waitFor({ timeout: 10000 })
    await page.keyboard.press('Escape') // volta à trilha
    assert(await focusLiveTrail(page, 'Esportes'), 'trilha da Live com "Esportes"')
    await page.keyboard.press('Enter')
    const numberBefore = await channelNumber(page, 'Canal E1')
    console.log(`  · número do "Canal E1" antes: ${numberBefore}`)
    await backHome(page)
    await openShowcase(page, 'movies')
    await openVodCategory(page, 'Terror')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 10000 })
    await page.keyboard.down('Enter') // OK longo favorita
    await page.waitForTimeout(900)
    await page.keyboard.up('Enter')
    await page.waitForTimeout(300)
    await backHome(page)

    console.log('=== US1: esconder "Terror" a partir do Início ===')
    keyCount = 0
    await openSettings(page)
    await enterParentalTab(page)
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).waitFor({ timeout: 8000 })
    await press(page, 'ArrowDown') // seções (Canais)
    await press(page, 'ArrowRight') // Filmes
    await page.getByRole('button', { name: 'Terror: Visível' }).waitFor({ timeout: 8000 })
    for (let i = 0; i < 4 && (await page.getByRole('button', { name: 'Terror: Visível' }).getAttribute('class'))?.includes('tv-focus') !== true; i += 1) await press(page, 'ArrowDown')
    await press(page, 'Enter')
    await page.getByRole('button', { name: 'Terror: Escondida' }).waitFor({ timeout: 8000 })
    console.log(`  · teclas do Início até esconder: ${keyCount}`)
    // SC-004 emendado em 2026-10-09 (decisão do usuário): o caminho é por Configurações, medido em 16 teclas (14 desde a 067, pela tela da lista).
    assert(keyCount <= 16, `SC-004: esconder uma categoria a partir do Início em ≤ 16 teclas (${keyCount})`)
    await shot(page, '01-gestao-terror-escondida')

    await backHome(page)
    await openShowcase(page, 'movies')
    const afterHide = await sideNames(page)
    assert(!afterHide.some((name) => name.includes('Terror')), `"Terror" some da lista lateral (${afterHide.join(' | ')})`)
    await openVodCategory(page, 'Todos')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 10000 })
    const all = await page.locator('.vod-grid .content-card-title').allTextContents()
    assert(!all.includes('Medo Total'), `"Todos" sem o filme de Terror (${all.join(' | ')})`)
    await shot(page, '02-todos-sem-terror')
    await backHome(page)
    await openShowcase(page, 'movies')
    await openVodCategory(page, 'Favoritos')
    await page.waitForTimeout(800)
    assert(!(await page.locator('.vod-grid .content-card-title').allTextContents()).includes('Medo Total'), '★ Favoritos sem o filme de Terror escondido')
    assert(!(await globalSearchText(page, 'medo')).includes('Medo Total'), 'busca global sem o filme de Terror')

    console.log('=== US1: esconder a categoria de canais "Notícias" ===')
    await backHome(page)
    await openSettings(page)
    await enterParentalTab(page)
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('ArrowDown') // seções (Canais)
    await page.keyboard.press('ArrowDown') // 1ª categoria de canais
    await page.getByRole('button', { name: 'Notícias: Visível' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Notícias: Escondida' }).waitFor({ timeout: 8000 })
    await backHome(page)
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups .side-category-nav-item', { timeout: 10000 })
    const trailAfter = await liveTrailNames(page)
    assert(!trailAfter.some((name) => name.includes('Notícias')), `trilha da Live sem "Notícias" (${trailAfter.join(' | ')})`)
    assert(await focusLiveTrail(page, 'Todos'), 'trilha da Live com "Todos"')
    await page.keyboard.press('Enter')
    await page.locator('.live-channel-row', { hasText: 'Canal E1' }).waitFor({ timeout: 10000 })
    const allChannels = await liveRows(page)
    assert(!allChannels.some((row) => row.includes('Canal N')), '"Todos" (a sequência do zapping) sem os canais escondidos')
    const numberAfter = await channelNumber(page, 'Canal E1')
    assert(numberBefore === numberAfter, `número do "Canal E1" não muda ao esconder a categoria anterior (${numberBefore} → ${numberAfter})`)
    assert(!(await globalSearchText(page, 'canal n')).includes('Canal N1'), 'busca global sem os canais escondidos')
    await backHome(page)

    console.log('=== US2/US3: ligar o controle parental (sugestão adulta) ===')
    await backHome(page)
    await openSettings(page)
    await enterParentalTab(page)
    await page.getByRole('button', { name: 'Controle parental: Desligado' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter')
    await dialog(page, 'Categorias que parecem adultas')
    assert((await page.getByRole('button', { name: /XXX Adultos/ }).getAttribute('aria-pressed')) === 'true', '"XXX Adultos" vem pré-marcada')
    assert((await page.getByRole('button', { name: /Ação/ }).count()) === 0, 'categoria comum não é sugerida')
    await shot(page, '03-sugestao-adulta')
    for (let i = 0; i < 4 && !(await page.getByRole('button', { name: 'Confirmar' }).getAttribute('class'))?.includes('tv-focus'); i += 1) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await dialog(page, 'Crie um PIN de 4 dígitos')
    await typePin(page, '1357')
    await dialog(page, 'Digite o PIN de novo')
    await typePin(page, '1357')
    await page.getByRole('button', { name: 'Controle parental: Ligado' }).waitFor({ timeout: 8000 })
    assert((await page.getByRole('button', { name: 'Trocar PIN' }).count()) === 1, 'interruptor mostra "Ligado" e "Trocar PIN" aparece')
    assert((await page.getByText('Controle parental ligado. As categorias bloqueadas pedem o PIN.').count()) === 1, 'aviso de que ligou')

    console.log('=== Trilha: cadeado no fim; entrar pede o PIN ===')
    await backHome(page)
    await openShowcase(page, 'movies')
    const locked = await sideNames(page)
    assert(locked.at(-1) === 'XXX Adultos, bloqueada', `bloqueada com cadeado e no fim da trilha (${locked.join(' | ')})`)
    await shot(page, '04-trilha-cadeado')
    // A categoria bloqueada não tem barra Pesquisar/Ordenar: foca o item e dá OK (o PIN abre junto).
    await focusSideItem(page, 'XXX Adultos')
    await page.keyboard.press('Enter')
    await dialog(page, 'Digite o PIN')
    await typePin(page, '0000')
    await page.getByText('PIN incorreto').waitFor({ timeout: 8000 })
    assert(true, 'PIN errado avisa')
    await typePin(page, '1357')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 10000 })
    assert((await page.locator('.vod-grid .content-card-title').allTextContents()).includes('Noite Proibida'), 'PIN certo abre a categoria')
    await shot(page, '05-desbloqueada')

    console.log('=== Segundo plano rebloqueia ===')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.getByRole('dialog', { name: 'Digite o PIN', exact: true }).waitFor({ timeout: 8000 })
    assert((await page.locator('.vod-grid .content-card-title').count()) === 0, 'voltar do segundo plano esconde o conteúdo e pede o PIN de novo')

    console.log('=== US4: "Esqueci o PIN" só no aparelho ===')
    const before = panel.requests
    await page.getByRole('button', { name: 'Esqueci o PIN' }).click()
    await dialog(page, 'Recuperar o PIN')
    await page.getByRole('button', { name: 'Lista Xtream (usuário e senha)' }).click()
    await page.getByLabel('Usuário', { exact: true }).fill('usuario-e2e')
    await page.getByLabel('Senha', { exact: true }).fill('errada')
    await page.getByRole('button', { name: 'Conferir' }).click()
    await page.getByText('Os dados não conferem com os desta lista.').waitFor({ timeout: 8000 })
    assert(!(await page.content()).includes('errada'), 'erro genérico, sem repetir o digitado')
    await page.getByLabel('Usuário', { exact: true }).fill('usuario-e2e')
    await page.getByLabel('Senha', { exact: true }).fill('senha-e2e')
    await page.getByRole('button', { name: 'Conferir' }).click()
    await dialog(page, 'Crie um PIN de 4 dígitos')
    await typePin(page, '2468')
    await dialog(page, 'Digite o PIN de novo')
    await typePin(page, '2468')
    await dialog(page, 'Digite o PIN')
    // A conta fecha aqui: depois do PIN novo, abrir a categoria desbloqueada pode buscar os itens dela (isso é outra coisa).
    // O guia (`xmltv.php`) baixa em segundo plano depois do cadastro e pode cair nesta janela; conferir usuário/senha
    // pela rede bateria no `player_api.php` — esse tem de ficar em zero (o teste unitário prova que não há `fetch`).
    const during = panel.log.slice(before)
    console.log(`  · requisições de fundo na janela: ${during.join(', ') || 'nenhuma'}`)
    assert(during.every((entry) => entry === '/xmltv.php'), `recuperação sem requisição de conta ao painel (${during.join(', ') || 0})`)
    await typePin(page, '2468')
    await page.waitForSelector('.vod-grid .content-card-title', { timeout: 10000 })
    assert(true, 'PIN novo vale')

    console.log('=== FR-008: mostrar "Terror" de novo devolve o favorito ===')
    await backHome(page)
    await openSettings(page)
    await enterParentalTab(page)
    // Com PIN, a aba mostra "Digite o PIN para gerenciar"; se o pedido não abriu ao entrar (o PIN ainda era lido), OK no botão.
    await page.getByRole('button', { name: 'Digite o PIN' }).waitFor({ timeout: 8000 })
    if ((await page.getByRole('dialog', { name: 'Digite o PIN', exact: true }).count()) === 0) await page.keyboard.press('Enter')
    await dialog(page, 'Digite o PIN')
    await typePin(page, '2468')
    await page.getByRole('button', { name: 'Controle parental: Ligado' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('ArrowDown') // seções
    await page.keyboard.press('ArrowRight') // Filmes
    await page.getByRole('button', { name: 'Terror: Escondida' }).waitFor({ timeout: 8000 })
    for (let i = 0; i < 4 && !(await page.getByRole('button', { name: 'Terror: Escondida' }).getAttribute('class'))?.includes('tv-focus'); i += 1) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Terror: Visível' }).waitFor({ timeout: 8000 })
    await backHome(page)
    await openShowcase(page, 'movies')
    await openVodCategory(page, 'Favoritos')
    await page.locator('.vod-grid .content-card-title', { hasText: 'Medo Total' }).waitFor({ timeout: 10000 })
    assert(true, 'o favorito de Terror volta ao mostrar a categoria (nada foi apagado)')

    console.log('=== 067 FR-021/FR-020: adicionar lista não pede PIN; editar a lista protegida pede o PIN dela ===')
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.locator('.add-card').click()
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    assert((await page.getByRole('dialog', { name: 'Digite o PIN', exact: true }).count()) === 0, 'adicionar lista abre direto, sem pedir PIN (PIN agora é por lista)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.add-card', { timeout: 8000 })
    await page.keyboard.press('ArrowLeft') // cartão da lista protegida
    await page.keyboard.press('ArrowDown') // ações: Ressincronizar
    await page.keyboard.press('ArrowRight') // Editar
    await page.keyboard.press('Enter')
    await dialog(page, 'Digite o PIN')
    assert((await page.locator('#add-source-title').count()) === 0, 'editar a lista só abre depois do PIN dela')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.add-card', { timeout: 8000 })
    assert(true, 'RETURN no PIN volta aos perfis sem abrir a edição')

    const leaked = consoleLines.filter((line) => /1357|2468|senha-e2e/.test(line))
    assert(leaked.length === 0, 'PIN e senha nunca aparecem no console')
    assert(pageErrors.length === 0, `sem erro de página (${pageErrors.join(' | ')})`)
  } catch (error) {
    failures += 1
    console.error(`  ✗ ERRO: ${error?.stack ?? error}`)
    await shot(page, 'erro').catch(() => {})
  } finally {
    await browser.close()
    server.close()
  }
  if (failures > 0) {
    console.error(`\n${failures} falha(s).`)
    process.exit(1)
  }
  console.log('\nTudo certo.')
}

run()
