// Roteiro E2E da feature 026 (Home definitiva, Busca global e Configurações
// no Design System V14, Onda 5) — gate da constitution v1.5.0 ("Testes E2E
// (Playwright) antes de validação em TV física").
//
// Cobre o que as três user stories entregam, de ponta a ponta:
//   US1 (Home): o hero retoma um filme com progresso parcial direto (sem
//     passar pelo detalhe) e volta; a rail "Continuar assistindo" mostra o
//     mesmo item; "Minha Lista" mostra o card do filme favoritado e o
//     agregado "Filmes (N)", que abre Filmes já em "★ Favoritos"; "Canais
//     favoritos" abre a Live TV tocando o canal favoritado direto.
//   US3 (Busca): a lupa da topbar abre a busca de verdade — com resultado
//     (abre o filme e volta) e sem resultado (estado vazio).
//   US2 (Configurações): Fontes IPTV mostra "Modo limitado" numa fonte cujo
//     painel não confirma o protocolo; excluir exige confirmação;
//     "Reduzir movimento" liga de verdade (classe no `<html>`).
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios (`fixtures/home-busca-configuracoes.m3u` + um painel
// Xtream fictício montado neste próprio script, mesmo padrão de
// `m3u-sob-demanda.mjs`) — nunca uma fonte real.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'home-busca-configuracoes.m3u')
const APP_URL = 'http://localhost:5173'
const LONG_HOLD_MS = 950 // acima do LONG_SELECT_MS (800) de useRemoteNav.ts, com folga

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
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/**
 * Painel Xtream fictício que autentica mas não responde ao protocolo de
 * catálogo (mesmo padrão de `m3u-sob-demanda.mjs`'s `startLimitedPanelServer`)
 * — é o jeito mais simples de conseguir uma fonte "Modo limitado" de
 * verdade, sem depender de nenhum estado interno inventado.
 */
function startLimitedPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname === '/get.php') {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' })
      res.end('#EXTM3U\n#EXTINF:-1 group-title="X",Item\nhttp://exemplo.test/x/1.ts\n')
      return
    }
    if (url.pathname === '/player_api.php') {
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function addSourceAndOpen(page, m3uUrl, displayName) {
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
  // "Abrir lista" (FR-038) já entra direto no Início da fonte recém-criada.
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 8000 })
}

/** Segura Enter além do limiar do gesto (tempo real — mesmo motivo dos testes unitários de feature 013). */
async function holdEnter(page, ms = LONG_HOLD_MS) {
  await page.keyboard.down('Enter')
  await page.waitForTimeout(ms)
  await page.keyboard.up('Enter')
}

/** Dispara um evento do <video> ATUAL (o adaptador de dev não decodifica conteúdo fictício). */
async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

async function setPartialProgress(page, currentTimeSec, durationSec) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate(
    ({ currentTimeSec, durationSec }) => {
      const video = document.querySelector('.player-video')
      if (!video) return
      Object.defineProperty(video, 'duration', { value: durationSec, configurable: true })
      video.currentTime = currentTimeSec
      video.dispatchEvent(new Event('timeupdate'))
    },
    { currentTimeSec, durationSec },
  )
}

/**
 * Do Início (hero, rails ou topbar — qualquer foco restaurado), abre TV ao
 * vivo/Filmes/Séries pela topbar (mesmo helper usado nos demais scripts
 * atualizados na Fase 6/T036 desta feature — `logic/foco-home.md`).
 */
async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function run() {
  const fixtureServer = await startFixtureServer()
  const limitedPanel = await startLimitedPanelServer()
  const m3uUrl = `http://127.0.0.1:${fixtureServer.address().port}/home-busca-configuracoes.m3u`
  const limitedM3uUrl = `http://127.0.0.1:${limitedPanel.address().port}/get.php?username=usuario&password=senha`

  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log('=== Preparação: fonte com um canal e um filme, ambos favoritados ===')
    await page.goto(APP_URL)
    await addSourceAndOpen(page, m3uUrl, 'Fonte E2E Home')

    // As URLs de vídeo/live da fixture não são servidas de verdade — sem
    // interceptar, o <video> dispara seu próprio evento `error` em corrida
    // com os eventos sintéticos deste script (mesmo padrão documentado em
    // `busca-por-categoria.mjs`/`zapping-live-tv.mjs`).
    await page.route('**/live/**', () => {})
    await page.route('**/vod/**', () => {})

    console.log('--- Favorita o canal ---')
    await openViaTopbar(page, 'live')
    await page.waitForSelector('.live-column-groups', { timeout: 8000 })
    // Espera a categoria REAL (não só "★ Favoritos"/"Todos") estar em foco antes do ArrowRight que
    // entra — enquanto as categorias carregam, o padrão cai em "Todos" (mesma corrida documentada em
    // `favoritos.mjs`/`busca-por-categoria.mjs`).
    await page.locator('.side-category-nav-item.tv-focus:not(:has-text("Favoritos")):not(:has-text("Todos"))').waitFor({
      timeout: 8000,
    })
    await page.keyboard.press('ArrowRight') // trilha -> entra na categoria real de canais
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    assert(
      (await page.locator('.live-column-channels .live-item-name').first().textContent()) === 'Canal Favorito',
      'categoria de canais mostra "Canal Favorito"',
    )
    await holdEnter(page)
    await page.waitForSelector('.fav-star', { timeout: 4000 })
    assert(true, 'canal favoritado sem abrir o player')
    await page.keyboard.press('ArrowLeft') // canal -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('--- Favorita o filme e deixa progresso parcial (retomável) ---')
    await openViaTopbar(page, 'movies')
    await page.locator('.side-category-nav-item.tv-focus:not(:has-text("Favoritos")):not(:has-text("Todos"))').waitFor({
      timeout: 8000,
    })
    await page.keyboard.press('ArrowRight') // trilha -> entra na categoria real de filmes
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.content-card-title').first().textContent()) === 'Filme Hero',
      'categoria de filmes mostra "Filme Hero"',
    )
    await holdEnter(page)
    await page.waitForSelector('.fav-star', { timeout: 4000 })
    assert(true, 'filme favoritado sem abrir o detalhe')

    await page.keyboard.press('Enter') // abre o detalhe
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    await page.keyboard.press('Enter') // ação primária "Assistir" (sem retomada ainda)
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    await fireVideoEvent(page, 'playing')
    await setPartialProgress(page, 60, 600) // 10% — acima do limiar de retomada, longe do de conclusão
    await page.keyboard.press('Escape') // RETURN/pause fecha sem concluir
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    // Espera (não lê na hora): ao fechar o player o detalhe mostra por ~60 ms o estado em cache
    // ("Assistir") até a releitura invalidada terminar. O progresso já está gravado nesse ponto —
    // medido em sdd/bugs/flake-e2e-home-busca-configuracoes-passo-continuar-progresso/.
    const resumeLabelShown = await page
      .locator('.vod-detail-action', { hasText: 'Continuar' })
      .first()
      .waitFor({ timeout: 3000 })
      .then(
        () => true,
        () => false,
      )
    assert(resumeLabelShown, 'com progresso salvo, a ação primária do detalhe vira "Continuar"')

    await page.keyboard.press('Escape') // detalhe -> grade
    await page.waitForSelector('.vod-grid', { timeout: 8000 })
    await page.keyboard.press('Escape') // grade -> trilha
    await page.waitForSelector('.vod-side-nav', { timeout: 8000 })
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== US1 (Home): o hero retoma o filme direto, sem passar pelo detalhe ===')
    assert(
      (await page.locator('.home-hero-title').textContent()) === 'Filme Hero',
      'o hero do Início mostra "Filme Hero" (progresso parcial tem prioridade sobre boas-vindas/favoritos)',
    )
    // Entramos em Filmes pela topbar (`openViaTopbar`), então voltar restaura o foco lá (FR-017/FR-029)
    // — DOWN entra no conteúdo, sempre no hero (montagem nova, sem favorito/rail restaurável aqui).
    await page.keyboard.press('ArrowDown')
    assert(
      (await page.locator('.home-hero-action.tv-focus').textContent())?.includes('Continuar') ?? false,
      'a ação primária do hero, já focada, é "▶ Continuar"',
    )
    await page.keyboard.press('Enter') // SELECT no hero: retoma direto
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    assert((await page.locator('.vod-detail').count()) === 0, 'retomar pelo hero abre o player direto — nunca passa pelo detalhe')
    await fireVideoEvent(page, 'playing')
    await page.keyboard.press('Escape') // volta ao Início
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert(true, 'RETURN fechou o player e voltou ao Início — "e volta"')

    console.log('=== US1 (Home): rail "Continuar assistindo" mostra o mesmo filme ===')
    await page.keyboard.press('ArrowDown') // hero -> "Continuar assistindo"
    assert(
      (await page
        .locator('section.home-row[aria-label="Continuar assistindo"] .content-card-title')
        .first()
        .textContent()) === 'Filme Hero',
      '"Continuar assistindo" mostra "Filme Hero"',
    )

    console.log('=== US1 (Home): "Minha Lista" mostra o filme e o agregado "Filmes (N)" ===')
    await page.keyboard.press('ArrowDown') // continuar -> "Minha Lista"
    assert(
      (await page
        .locator('section.home-row[aria-label="Minha Lista"] .content-card-title')
        .first()
        .textContent()) === 'Filme Hero',
      '"Minha Lista" mostra o card do próprio "Filme Hero"',
    )
    await page.keyboard.press('ArrowRight') // "Filme Hero" -> "Filmes (1)"
    assert(
      (await page.locator('section.home-row[aria-label="Minha Lista"] .home-see-all.tv-focus').textContent()) ===
        'Filmes (1)',
      '"Minha Lista" também tem o agregado "Filmes (1)"',
    )
    await page.keyboard.press('Enter') // abre Filmes já em "★ Favoritos"
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.side-category-nav-item.is-selected').textContent())?.includes('Favoritos') ?? false,
      '"Filmes (1)" abre Filmes já em "★ Favoritos"',
    )
    assert(
      (await page.locator('.content-card-title').first().textContent()) === 'Filme Hero',
      '"★ Favoritos" de Filmes mostra "Filme Hero"',
    )
    await page.keyboard.press('Escape') // grade -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== US1 (Home): rail de canal abre a Live TV já tocando ===')
    // Voltamos de "Filmes (1)" (navegação de tela — FR-029 restaura o foco na rail "Minha Lista", não
    // no hero) — reseta pro hero antes de contar as descidas: sobe até a topbar (não importa de que
    // linha, sempre acaba lá) e desce 1, que sempre pousa no hero (mesmo truque de `openViaTopbar`).
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown') // hero -> "Continuar assistindo"
    await page.keyboard.press('ArrowDown') // -> "Minha Lista"
    await page.keyboard.press('ArrowDown') // -> "Canais favoritos"
    assert(
      (await page
        .locator('section.home-row[aria-label="Canais favoritos"] .tv-focus')
        .locator('..')
        .textContent())?.includes('Canal Favorito') ?? false,
      '"Canais favoritos" mostra "Canal Favorito" em foco',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
    assert(true, 'card de canal favorito abriu a Live TV já tocando, sem navegação extra')
    await fireVideoEvent(page, 'playing')
    await page.keyboard.press('Escape') // fecha o player
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
    await page.waitForSelector('.live-column-channels .live-item-name', { timeout: 8000 })
    await page.keyboard.press('ArrowLeft') // canal -> trilha
    await page.keyboard.press('Escape') // trilha -> Início
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== US3 (Busca): com resultado — abre o filme e volta ===')
    await openViaTopbar(page, 'home') // garante posição conhecida antes de ir pra Buscar (índice 0 na topbar)
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight') // Início → … → Buscar
    await page.keyboard.press('Enter')
    await page.waitForSelector('.search-screen', { timeout: 8000 })
    const searchField = page.locator('input#search-field')
    await searchField.waitFor({ timeout: 8000 })
    await page.keyboard.press('Enter') // OK no campo abre o teclado (foco DOM real)
    await page.waitForFunction(() => document.activeElement === document.querySelector('#search-field'), null, {
      timeout: 4000,
    })
    await searchField.fill('hero')
    await page.waitForSelector('.search-row', { timeout: 8000 })
    assert(await page.getByText('Filmes (1)').isVisible(), 'busca por "hero" acha "Filmes (1)"')
    assert(await page.locator('.content-card-title', { hasText: 'Filme Hero' }).isVisible(), 'o resultado mostra "Filme Hero"')
    await page.keyboard.press('ArrowDown') // com o teclado aberto, DOWN fecha e já move pro 1º resultado
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail', { timeout: 8000 })
    assert(true, 'SELECT no resultado abriu o detalhe do filme')
    await page.keyboard.press('Escape') // volta pra Busca (teclado já estava fechado — sai da tela? não: RETURN aqui só volta um nível)
    await page.waitForSelector('.search-screen', { timeout: 8000 })
    assert((await searchField.inputValue()) === 'hero', 'voltar da busca restaura o termo "hero"')
    await page.keyboard.press('Escape') // Busca -> Início (teclado fechado — RETURN sai direto)
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== US3 (Busca): sem resultado — estado vazio ===')
    await openViaTopbar(page, 'home')
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.search-screen', { timeout: 8000 })
    await page.keyboard.press('Enter') // abre o teclado
    await page.waitForFunction(() => document.activeElement === document.querySelector('#search-field'), null, {
      timeout: 4000,
    })
    await searchField.fill('zzz')
    await page.waitForSelector('text=/Nada encontrado/', { timeout: 8000 })
    assert(true, 'termo sem correspondência mostra o estado vazio "Nada encontrado"')
    await page.keyboard.press('Escape') // 1º RETURN só fecha o teclado
    await page.waitForFunction(() => document.activeElement !== document.querySelector('#search-field'), null, {
      timeout: 4000,
    })
    await page.keyboard.press('Escape') // 2º RETURN sai da tela
    await page.waitForSelector('.home-content', { timeout: 8000 })

    console.log('=== US2 (Configurações): Fontes IPTV mostra "Modo limitado" numa fonte nova ===')
    await openViaTopbar(page, 'home')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight') // Início → … → Configurações
    await page.keyboard.press('Enter')
    await page.waitForSelector('.settings-screen', { timeout: 8000 })
    assert(
      (await page.locator('.sources-panel-row', { hasText: 'Fonte E2E Home' }).count()) === 1,
      'Fontes IPTV já mostra a fonte ativa, sem entrar em nenhuma linha',
    )
    await page.keyboard.press('ArrowRight') // tabs -> panel (entra em Fontes IPTV)
    await page.waitForSelector('.sources-panel-add.tv-focus, .sources-panel-row .tv-focus', { timeout: 4000 })
    // "Adicionar lista" é sempre a última linha — desce até chegar nela.
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await page.getByLabel('Nome de exibição').fill('Fonte E2E Home Limitada')
    await page.getByLabel('URL da lista M3U').fill(limitedM3uUrl)
    await page.getByRole('button', { name: 'Adicionar lista' }).click()
    await page.waitForSelector('text=/Concluída/', { timeout: 15000 })
    // "Voltar" da tela de progresso sempre vai pros perfis, como base (FR-039) — nunca de volta a
    // Configurações. Importante escolher aqui a fonte PRINCIPAL (nunca a recém-criada, "Modo
    // limitado"): abrir a lista errada trocaria a fonte ativa, e excluir a fonte ATIVA mais adiante
    // desmontaria Configurações inteira (o app cai direto nos perfis, `source-removed` do reducer).
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.locator('.source-card-wrap', { hasText: 'Fonte E2E Home Limitada' }).waitFor({ timeout: 8000 })
    await page.keyboard.press('ArrowLeft') // fonte recém-criada (foco padrão, FR-039) -> "Fonte E2E Home"
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'home')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight') // Início → … → Configurações
    await page.keyboard.press('Enter')
    await page.waitForSelector('.settings-screen', { timeout: 8000 })
    const limitedRow = page.locator('.sources-panel-row', { hasText: 'Fonte E2E Home Limitada' })
    await limitedRow.locator('.limited-mode-notice-title', { hasText: 'Modo limitado' }).waitFor({ timeout: 8000 })
    assert(true, 'a fonte recém-adicionada, sem protocolo confirmado, mostra "Modo limitado" em Fontes IPTV')

    console.log('=== US2 (Configurações): excluir exige confirmação ===')
    await page.keyboard.press('ArrowRight') // tabs -> panel (entra em Fontes IPTV, padrão: 1ª linha, col "Editar")
    await page.waitForSelector('.sources-panel-row .tv-focus', { timeout: 4000 })
    await page.keyboard.press('ArrowDown') // "Fonte E2E Home" -> "Fonte E2E Home Limitada" (2ª linha)
    await page.keyboard.press('ArrowRight') // Editar -> Ressincronizar
    await page.keyboard.press('ArrowRight') // Ressincronizar -> Excluir
    await page.keyboard.press('Enter')
    const deleteDialog = page.getByRole('dialog', { name: 'Excluir a lista Fonte E2E Home Limitada?' })
    await deleteDialog.waitFor({ timeout: 5000 })
    assert(
      (await deleteDialog.locator('.tv-focus').allTextContents()).join('|').trim() === 'Cancelar',
      'o modal de exclusão abre com "Cancelar" em foco',
    )
    await page.keyboard.press('Enter') // Cancelar
    await deleteDialog.waitFor({ state: 'detached', timeout: 5000 })
    assert((await page.locator('.sources-panel-row').count()) === 2, 'OK em "Cancelar" não apaga nada')
    await page.keyboard.press('Enter') // reabre (mesma linha/coluna)
    await deleteDialog.waitFor({ timeout: 5000 })
    await page.keyboard.press('ArrowRight') // Excluir
    await page.keyboard.press('Enter')
    await deleteDialog.waitFor({ state: 'detached', timeout: 5000 })
    await page.waitForFunction(() => document.querySelectorAll('.sources-panel-row').length === 1, null, { timeout: 8000 })
    assert(true, 'confirmar "Excluir" apaga só a fonte escolhida')
    assert(
      (await page.locator('.sources-panel-row', { hasText: 'Fonte E2E Home' }).count()) === 1,
      'a fonte principal continua cadastrada',
    )

    console.log('=== US2 (Configurações): "Reduzir movimento" liga de verdade ===')
    // Depois de excluir, o foco fica na linha vizinha ("Fonte E2E Home") mas na MESMA coluna de onde
    // se excluiu ("Excluir", col 2, `confirmSourceDeletion` só troca a linha) — 2 ArrowLeft pra col 0,
    // um 3º pra sair do painel.
    await page.keyboard.press('ArrowLeft') // Excluir -> Ressincronizar
    await page.keyboard.press('ArrowLeft') // Ressincronizar -> Editar (col 0)
    await page.keyboard.press('ArrowLeft') // panel -> tabs
    await page.keyboard.press('ArrowDown') // Fontes IPTV -> Player & reprodução
    await page.keyboard.press('ArrowDown') // -> Acessibilidade & sistema
    assert(
      (await page.locator('.side-category-nav-item.tv-focus').textContent())?.includes('Acessibilidade') ?? false,
      'trilha de abas focada em "Acessibilidade & sistema"',
    )
    await page.keyboard.press('ArrowRight') // entra no painel
    await page.waitForSelector('.accessibility-panel-toggle.tv-focus', { timeout: 4000 })
    assert(
      (await page.locator('.accessibility-panel-toggle.tv-focus').textContent())?.includes('Desligado') ?? false,
      '"Reduzir movimento" começa desligado',
    )
    assert(
      !(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion'))),
      'sem a classe "reduce-motion" no <html> antes de ligar',
    )
    await page.keyboard.press('Enter')
    assert(
      (await page.locator('.accessibility-panel-toggle.tv-focus').textContent())?.includes('Ligado') ?? false,
      '"Reduzir movimento" mostra "Ligado" depois do SELECT',
    )
    assert(
      await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')),
      'a classe "reduce-motion" foi aplicada no <html> de verdade',
    )
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NÃO TRATADO:', error)
  } finally {
    await browser.close()
    fixtureServer.close()
    limitedPanel.close()
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
