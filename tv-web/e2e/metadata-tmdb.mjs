// Roteiro E2E da feature 032 (metadata do provedor + TMDB BYOK + Integrações)
// — gate da constitution v1.6.0 ("Testes E2E (Playwright) antes de validação
// em TV física").
//
// Cobre o que só um Chromium real prova (jsdom não carrega imagem nem aplica
// CSS): painel Xtream fictício com `get_vod_info`/`get_series_info` completos →
// detalhe de filme com backdrop CARREGADO, sinopse, "Ver mais" + modal,
// fatos; cache sem nova requisição; NENHUMA requisição de metadata ao mover o
// foco na grade (D-002); aba Integrações & BYOK (chave inválida/recusada/
// aceita, mascarada, dock da Home); TMDB preenchendo só a lacuna, com o selo
// "Dados: TMDB"; série com a sinopse do episódio focado numa requisição só;
// remover a chave apaga só a parte TMDB; a chave nunca em tela, console nem
// em requisição ao painel.
//
// Pré-requisito: `npm run dev` já rodando em outro terminal
// (http://localhost:5173) — mesma convenção dos demais scripts em `e2e/`.
//
// Dados: só fictícios, montados neste próprio script; o TMDB é interceptado
// com `page.route` (nenhuma chamada real, nenhuma chave real). Para o roteiro
// contra a lista real do `.env`, ver `metadata-tmdb-real.mjs`.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const APP_URL = 'http://localhost:5173'
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'
const GOOD_KEY = '0123456789abcdef0123456789abcdef'
const BAD_KEY = 'ffffffffffffffffffffffffffffffff'

/** PNG 1×1 — serve de backdrop e de imagem do TMDB. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const LONG_PLOT = `Uma história longa o bastante para passar do limite do hero. ${'Mais uma frase para a sinopse não caber em três linhas. '.repeat(6)}Fim da sinopse completa.`

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

/** Exatamente um elemento com foco visível depois de cada passo (constitution: "Foco Visível"). */
async function assertOneFocus(page, step) {
  const count = await page.locator('.tv-focus').count()
  assert(count === 1, `foco (${step}): exatamente um .tv-focus na tela (achou ${count})`)
}

const hits = { vodInfo: {}, seriesInfo: 0, panelUrls: [], tmdb: [] }

/** Painel Xtream fictício: dois filmes (um completo, um só com `tmdb_id`) e uma série com sinopse de episódio. */
function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    const base = `http://127.0.0.1:${server.address().port}`

    if (url.pathname === '/img/bd.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(PNG)
      return
    }
    if (url.pathname === '/player_api.php') {
      hits.panelUrls.push(url.href)
      const action = url.searchParams.get('action')
      res.writeHead(200, { 'Content-Type': 'application/json' })

      if (action === 'get_live_categories' || action === 'get_live_streams') return void res.end('[]')
      if (action === 'get_vod_categories') return void res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes' }]))
      if (action === 'get_vod_streams') {
        return void res.end(
          JSON.stringify([
            { name: 'Filme Completo', stream_id: 1, category_id: '10', year: 2019 },
            { name: 'Filme Lacuna (2021)', stream_id: 2, category_id: '10', year: 2021 },
          ]),
        )
      }
      if (action === 'get_vod_info') {
        const id = url.searchParams.get('vod_id')
        hits.vodInfo[id] = (hits.vodInfo[id] ?? 0) + 1
        if (id === '1') {
          return void res.end(
            JSON.stringify({
              info: {
                plot: LONG_PLOT,
                genre: 'Ficção científica',
                director: 'Diretora Fictícia',
                cast: 'Atriz Um, Ator Dois',
                country: 'Brasil',
                duration_secs: 6631,
                backdrop_path: [`${base}/img/bd.png`],
              },
              movie_data: {},
            }),
          )
        }
        // "Filme Lacuna": o provedor só sabe o tmdb_id — o resto é do TMDB.
        return void res.end(JSON.stringify({ info: { tmdb_id: 555 }, movie_data: {} }))
      }
      if (action === 'get_series_categories') return void res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries' }]))
      if (action === 'get_series') return void res.end(JSON.stringify([{ name: 'Série Exemplo', series_id: '500', category_id: '20', year: 2023 }]))
      if (action === 'get_series_info') {
        hits.seriesInfo += 1
        return void res.end(
          JSON.stringify({
            info: { plot: 'SINOPSE DA SÉRIE', genre: 'Animação', cast: 'Voz A, Voz B', episode_run_time: '25' },
            episodes: {
              '1': [
                { id: '5001', episode_num: 1, title: 'Piloto', container_extension: 'mp4', info: { plot: 'Sinopse do piloto.' } },
                { id: '5002', episode_num: 2, title: 'Capítulo Dois', container_extension: 'mp4' },
              ],
            },
          }),
        )
      }
      // Sem ação: status da conta (autenticação).
      return void res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
    }

    res.writeHead(404)
    res.end('não encontrado')
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/** TMDB fictício por `page.route`: a chave boa autentica; o detalhe 555 devolve a sinopse do TMDB. */
async function installFakeTmdb(page) {
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
  await page.route('https://api.themoviedb.org/**', async (route) => {
    const url = new URL(route.request().url())
    hits.tmdb.push(url.pathname)
    const key = url.searchParams.get('api_key')
    if (key !== GOOD_KEY) return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ success: false, status_code: 7 }) })
    if (url.pathname === '/3/authentication') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ success: true }) })
    if (url.pathname === '/3/movie/555') {
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          id: 555,
          title: 'Filme Lacuna',
          original_language: 'pt',
          release_date: '2021-05-01',
          overview: 'Sinopse vinda do TMDB.',
          backdrop_path: '/tmdb-bd.png',
          genres: [{ id: 1, name: 'Drama' }],
          runtime: 100,
          production_countries: [{ iso_3166_1: 'BR' }],
          credits: { cast: [{ name: 'Atriz TMDB' }], crew: [{ job: 'Director', name: 'Diretor TMDB' }] },
        }),
      })
    }
    // A busca responde 200 com lista vazia, como o TMDB de verdade (a série fictícia não existe lá).
    if (url.pathname.startsWith('/3/search/')) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ results: [] }) })
    return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ status_code: 34 }) })
  })
  await page.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
}

async function addSource(page, m3uUrl, displayName) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.topbar', { timeout: 8000 })
}

/** Da topbar (qualquer foco restaurado): abre TV ao vivo/Filmes/Séries por teclado. */
async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Entra na 1ª categoria real da trilha (★/↺/Todos + a real) e espera a grade. */
async function enterFirstRealCategory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

const MOVIE_ORDER = ['Filme Completo', 'Filme Lacuna (2021)']

/** Título do card com foco na grade (ou `null` se o foco está fora dela, por exemplo na trilha). */
const focusedCardTitle = (page) =>
  page.evaluate(() => {
    const focused = document.querySelector('.tv-focus')
    return focused?.closest('.content-card')?.querySelector('.content-card-title')?.textContent ?? null
  })

/**
 * Foca o card `title` da grade, sem supor onde o foco começou: a grade lembra o
 * último item focado da categoria (memória de foco, feature 025), então "Enter
 * logo depois de entrar" abriria o item de antes. (Não dá para "ir ao começo"
 * com ←: na primeira coluna ela sai da grade para a trilha.)
 */
async function focusCardByTitle(page, title) {
  for (let attempt = 0; attempt < MOVIE_ORDER.length + 2; attempt += 1) {
    const current = await focusedCardTitle(page)
    if (current === title) return
    const from = MOVIE_ORDER.indexOf(current)
    const to = MOVIE_ORDER.indexOf(title)
    await page.keyboard.press(from === -1 || to > from ? 'ArrowRight' : 'ArrowLeft')
  }
  throw new Error(`não consegui focar o card "${title}"`)
}

async function openSettingsFromHome(page) {
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.waitForSelector('.settings-screen .sources-panel', { timeout: 8000 })
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

const detailTitle = (page) => page.locator('.vod-detail-title').textContent()

async function run() {
  const server = await startPanelServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const m3uUrl = `${base}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleLines.push(msg.text()))

  try {
    await installFakeTmdb(page)
    await addSource(page, m3uUrl, 'Fonte E2E Metadata')
    // As URLs de "stream" do painel fictício não são servidas. Só as DELE: um
    // `**/movie/**` genérico também casaria `api.themoviedb.org/3/movie/…` e,
    // por ser registrado depois, engoliria a rota do TMDB (a requisição ficaria pendurada).
    await page.route(`${base}/movie/**`, () => {})
    await page.route(`${base}/series/**`, () => {})

    console.log('=== D-002: mover o foco na grade não busca metadata nenhuma ===')
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(400)
    assert(Object.keys(hits.vodInfo).length === 0, 'nenhum get_vod_info só de percorrer a grade')
    assert(hits.tmdb.length === 0, 'nenhuma requisição ao TMDB só de percorrer a grade')

    console.log('=== US1: detalhe com a metadata do provedor (sem chave) ===')
    await page.keyboard.press('Enter') // "Filme Completo"
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    assert((await detailTitle(page)) === 'Filme Completo', 'abriu o detalhe de "Filme Completo"')
    await page.waitForSelector('.vod-detail-synopsis', { timeout: 8000 })
    assert(hits.vodInfo['1'] === 1, 'abrir o detalhe fez exatamente um get_vod_info')
    assert((await page.locator('.vod-detail-synopsis').textContent())?.startsWith('Uma história longa') ?? false, 'o hero mostra a sinopse do provedor')
    assert((await page.locator('.vod-detail-origin').count()) === 0, 'sem selo de origem: tudo veio do provedor')

    await page.waitForSelector('.vod-detail-backdrop img', { timeout: 8000 })
    const backdropLoaded = await page.waitForFunction(
      () => {
        const img = document.querySelector('.vod-detail-hero .vod-detail-backdrop img')
        return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
      },
      null,
      { timeout: 8000 },
    ).then(() => true, () => false)
    assert(backdropLoaded, 'o backdrop é um <img> do hero e carregou de verdade')
    const screenBg = await page.evaluate(() => getComputedStyle(document.querySelector('.screen.vod-detail')).backgroundImage)
    assert(screenBg === 'none', 'o .screen do detalhe não usa background-image (D-008: não pinta sobre o plano do AVPlay)')

    const facts = await page.locator('.vod-detail-fact dt').allTextContents()
    for (const label of ['Gênero', 'Duração', 'Direção', 'País', 'Elenco']) {
      assert(facts.includes(label), `aba Detalhes mostra "${label}"`)
    }
    const duration = await page.locator('.vod-detail-fact', { hasText: 'Duração' }).locator('dd').textContent()
    assert(duration === '1 h 50 min', `duração 6631 s aparece como "1 h 50 min" (veio "${duration}")`)
    await assertOneFocus(page, 'detalhe com metadata')

    console.log('=== FR-004: "Ver mais" abre a sinopse completa e RETURN devolve o foco a ele ===')
    await page.keyboard.press('ArrowUp')
    assert(
      (await page.locator('.vod-detail-more.tv-focus').count()) === 1,
      '↑ a partir das ações foca "Ver mais"',
    )
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Sinopse completa"]', { timeout: 5000 })
    assert(
      ((await page.locator('.synopsis-modal-text').textContent()) ?? '').includes('Fim da sinopse completa.'),
      'o modal mostra a sinopse inteira',
    )
    await page.keyboard.press('Escape')
    await page.locator('[role="dialog"][aria-label="Sinopse completa"]').waitFor({ state: 'detached', timeout: 5000 })
    assert((await page.locator('.vod-detail-more.tv-focus').count()) === 1, 'RETURN fecha só o modal e o foco continua em "Ver mais"')
    await assertOneFocus(page, 'depois do modal')

    console.log('=== Aba Elenco (ad-hoc T044): o elenco do provedor em lista, sem "Em breve" ===')
    await page.keyboard.press('ArrowDown') // more -> actions
    await page.keyboard.press('ArrowDown') // actions -> abas (foco em Detalhes)
    await page.keyboard.press('ArrowRight') // Elenco
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-cast-item', { timeout: 5000 })
    assert(
      JSON.stringify(await page.locator('.vod-cast-item').allTextContents()) === JSON.stringify(['Atriz Um', 'Ator Dois']),
      'a aba Elenco lista os nomes do provedor, na ordem',
    )
    assert(!(await page.locator('body').innerText()).includes('Em breve'), 'a aba Elenco não anuncia mais "Em breve"')
    await assertOneFocus(page, 'aba Elenco')
    await page.keyboard.press('ArrowLeft') // Detalhes
    await page.keyboard.press('Enter')
    assert((await page.locator('.vod-detail-fact dt').allTextContents()).includes('Gênero'), 'voltar a Detalhes mostra os fatos de novo')
    await page.keyboard.press('ArrowUp') // abas -> ações

    console.log('=== SC-004: reabrir o detalhe não faz nova requisição ===')
    await page.keyboard.press('Escape') // volta à grade
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-synopsis', { timeout: 8000 })
    assert(hits.vodInfo['1'] === 1, 'reabrir "Filme Completo" não repetiu o get_vod_info (cache)')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    console.log('=== US2: Integrações & BYOK — chave inválida, recusada e aceita ===')
    for (let i = 0; i < 2; i += 1) await page.keyboard.press('Escape') // grade → trilha → Início
    await openSettingsFromHome(page)
    await page.keyboard.press('ArrowUp') // aba "Integrações & BYOK"
    await page.keyboard.press('ArrowRight') // entra no painel
    const tmdbCard = page.getByRole('region', { name: 'TMDB' })
    assert(((await tmdbCard.textContent()) ?? '').includes('Não configurado'), 'card TMDB começa "Não configurado"')
    assert(((await tmdbCard.textContent()) ?? '').includes('não é endossado nem certificado pelo TMDB'), 'a atribuição ao TMDB está no card')
    for (const title of ['Assistente de IA', 'Clima', 'Teste de velocidade']) {
      assert(
        (await page.getByRole('region', { name: title }).getByRole('button').getAttribute('aria-disabled')) === 'true',
        `card "${title}" aparece soft disabled ("Em breve")`,
      )
    }
    await assertOneFocus(page, 'Integrações sem chave')

    await page.keyboard.press('Enter') // Configurar
    await page.waitForSelector('#tmdb-key-title', { timeout: 8000 })
    assert((await page.getByLabel(/Chave da API/).inputValue()) === '', 'o campo da chave abre vazio')
    await page.getByLabel(/Chave da API/).fill('isto-nao-e-uma-chave')
    await page.getByRole('button', { name: 'Salvar e testar' }).click()
    await page.waitForSelector('text=/Formato inválido/', { timeout: 5000 })
    assert(!(await page.locator('body').innerText()).includes('isto-nao-e-uma-chave'), 'o texto digitado não é ecoado na mensagem de erro')
    assert(hits.tmdb.length === 0, 'formato inválido não faz nenhuma requisição ao TMDB')

    await page.getByLabel(/Chave da API/).fill(BAD_KEY)
    await page.getByRole('button', { name: 'Salvar e testar' }).click()
    await page.waitForSelector('text=/O TMDB recusou esta chave/', { timeout: 5000 })
    assert(!(await page.locator('body').innerText()).includes(BAD_KEY), 'a chave recusada nunca aparece na tela')

    await page.getByLabel(/Chave da API/).fill(GOOD_KEY)
    await page.getByRole('button', { name: 'Salvar e testar' }).click()
    await page.waitForSelector('.settings-screen .integration-card', { timeout: 8000 })
    await page.waitForSelector('.integration-card-state:has-text("Conectado")', { timeout: 8000 })
    const cardText = (await page.getByRole('region', { name: 'TMDB' }).textContent()) ?? ''
    assert(cardText.includes(`••••${GOOD_KEY.slice(-4)}`), 'a chave aparece só mascarada (últimos 4)')
    assert(!(await page.locator('body').innerText()).includes(GOOD_KEY), 'a chave inteira nunca chega à tela')
    for (const name of ['Testar', 'Editar', 'Remover']) {
      assert((await page.getByRole('button', { name, exact: true }).count()) === 1, `com chave, o card oferece "${name}"`)
    }

    console.log('=== US2: o dock da Home reflete o estado real ===')
    await page.keyboard.press('Escape') // Configurações → Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert((await page.getByRole('button', { name: 'TMDB — conectado' }).count()) === 1, 'dock mostra "TMDB — conectado"')
    assert(
      (await page.getByRole('button', { name: 'TMDB — conectado' }).getAttribute('aria-disabled')) === null,
      'o ícone TMDB do dock deixou de ser soft disabled',
    )

    console.log('=== US3: o TMDB preenche só a lacuna, com o selo "Dados: TMDB" ===')
    const tmdbBefore = hits.tmdb.length
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    await focusCardByTitle(page, 'Filme Lacuna (2021)')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    await page.waitForFunction(
      () => document.querySelector('.vod-detail-synopsis')?.textContent === 'Sinopse vinda do TMDB.',
      null,
      { timeout: 10000 },
    )
    assert(true, 'a sinopse vem do TMDB (o provedor só informou o tmdb_id)')
    assert(
      ((await page.locator('.vod-detail-origin').first().textContent()) ?? '').includes('Dados: TMDB'),
      'o selo "Dados: TMDB" aparece junto do campo vindo de lá',
    )
    // T046 (FR-022): o backdrop do TMDB também leva o selo — e carregou de verdade (`image.tmdb.org`).
    const tmdbBackdropLoaded = await page
      .waitForFunction(
        () => {
          const img = document.querySelector('.vod-detail-hero .vod-detail-backdrop img')
          return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0 && img.src.includes('image.tmdb.org')
        },
        null,
        { timeout: 8000 },
      )
      .then(() => true, () => false)
    assert(tmdbBackdropLoaded, 'o backdrop do TMDB (image.tmdb.org) carregou no hero')
    assert(
      ((await page.locator('.vod-detail-backdrop-origin').textContent()) ?? '') === 'Dados: TMDB',
      'o backdrop vindo do TMDB leva o selo "Dados: TMDB" (FR-022)',
    )
    assert(hits.tmdb.slice(tmdbBefore).includes('/3/movie/555'), 'o detalhe foi buscado pelo tmdb_id do provedor')
    assert(
      hits.panelUrls.every((href) => !href.includes(GOOD_KEY)),
      'nenhuma requisição ao painel carregou a chave TMDB',
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    console.log('=== FR-028: série — sinopse do episódio focado, numa requisição só ===')
    for (let i = 0; i < 2; i += 1) await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'series')
    await enterFirstRealCategory(page)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    await page.waitForSelector('.vod-detail-synopsis', { timeout: 8000 })
    assert(((await page.locator('.vod-detail-synopsis').textContent()) ?? '') === 'SINOPSE DA SÉRIE', 'o hero da série mostra a sinopse do get_series_info')
    assert(hits.seriesInfo === 1, `episódios e metadata da série vieram de UMA requisição (${hits.seriesInfo})`)

    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown') // tabs → temporada → episódios
    const episodeBox = page.locator('.vod-episode-synopsis')
    await episodeBox.waitFor({ timeout: 5000 })
    assert((await episodeBox.textContent()) === 'Sinopse do piloto.', 'o episódio focado mostra a própria sinopse')
    const seriesRequestsBefore = hits.seriesInfo
    await page.keyboard.press('ArrowDown')
    assert(((await episodeBox.textContent()) ?? '') === '', 'episódio sem sinopse não mostra texto (nem a da série)')
    assert(hits.seriesInfo === seriesRequestsBefore, 'mover o foco entre episódios não fez nenhuma requisição')
    // O episódio focado tem o anel na linha E no cartão (`.vod-episode-row` + `ContentCard`) — é o desenho do detalhe.
    assert((await page.locator('.vod-episode-row.tv-focus').count()) === 1, 'foco (episódios): exatamente uma linha de episódio focada')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })

    console.log('=== FR-014: remover a chave apaga só a parte TMDB ===')
    for (let i = 0; i < 2; i += 1) await page.keyboard.press('Escape')
    await openSettingsFromHome(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // Remover
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="dialog"][aria-label="Remover a chave do TMDB?"]', { timeout: 5000 })
    assert((await page.locator('[role="dialog"] .tv-focus').textContent()) === 'Cancelar', 'a confirmação abre com "Cancelar" focado')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.integration-card-state:has-text("Não configurado")', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.home-content', { timeout: 8000 })
    assert((await page.getByRole('button', { name: 'TMDB — não configurado' }).count()) === 1, 'o dock volta a "TMDB — não configurado"')

    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    await focusCardByTitle(page, 'Filme Completo')
    await page.keyboard.press('Enter') // "Filme Completo": o provedor continua
    await page.waitForSelector('.vod-detail-synopsis', { timeout: 8000 })
    assert((await detailTitle(page)) === 'Filme Completo', 'reabriu "Filme Completo"')
    assert(
      ((await page.locator('.vod-detail-synopsis').textContent()) ?? '').startsWith('Uma história longa'),
      'depois de remover a chave, a metadata do provedor continua',
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    await focusCardByTitle(page, 'Filme Lacuna (2021)')
    await page.keyboard.press('Enter') // "Filme Lacuna": a sinopse do TMDB foi apagada
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    await page.waitForTimeout(600)
    assert((await page.locator('.vod-detail-synopsis').count()) === 0, 'a sinopse que veio do TMDB sumiu com a chave')

    console.log('=== Higiene: a chave nunca em console nem em requisição ao painel ===')
    assert(consoleLines.every((line) => !line.includes(GOOD_KEY) && !line.includes(BAD_KEY)), 'nenhuma linha de console contém a chave')
    assert(hits.panelUrls.every((href) => !href.includes(GOOD_KEY) && !href.includes(BAD_KEY)), 'nenhuma requisição ao painel contém a chave')
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NO ROTEIRO:', error)
    // Só contagens e caminhos (nunca a URL do painel, que carrega a senha fictícia, nem a chave).
    console.error('  requisições: get_vod_info', JSON.stringify(hits.vodInfo), '| série', hits.seriesInfo, '| TMDB', JSON.stringify(hits.tmdb))
    await page.screenshot({ path: 'metadata-tmdb-falha.png' }).catch(() => {})
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
