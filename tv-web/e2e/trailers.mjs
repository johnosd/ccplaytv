// Roteiro E2E da feature 033 (trailers de filmes e séries) — gate da
// constitution ("Testes E2E (Playwright) antes de validação em TV física").
//
// Exercita a ponte REAL: `bridge/trailer/index.html` é lida do disco e servida,
// por `page.route`, no endereço de produção (`https://johnosd.github.io/...`),
// e o `iframe_api` do YouTube é trocado por um player FALSO que obedece ao
// protocolo (play/pause/stop/seekTo) e deixa o teste provocar estados. Assim o
// E2E cobre app + ponte + protocolo sem rede e sem publicar nada.
//
// Cobre: grade sem consulta (SC-004), abrir/tocar/pausar/retomar, clamp do
// `seek-by` (A-01, FR-013), fim fecha, RETURN fecha e devolve o foco, "Cancelar"
// no carregando, erro sem reserva ("Voltar" só), sem trailer + dica do TMDB, sem
// rede (TRL-REDE) e "Tentar de novo", série ("Trailer…" sem piscar
// "indisponível"), reserva automática via TMDB (150 → 2º candidato) e higiene
// de segredos (só o id vai à ponte).
//
// Pré-requisito: `npm run dev` já rodando (http://localhost:5173).
// Dados: só fictícios. Nenhuma requisição real, nenhuma chave real.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const PANEL_USER = 'usuario'
const PANEL_PASS = 'senha'
const GOOD_KEY = '0123456789abcdef0123456789abcdef'
const BRIDGE_ORIGIN = 'https://johnosd.github.io'
const BRIDGE_HTML = readFileSync(path.join(__dirname, '..', '..', 'bridge', 'trailer', 'index.html'), 'utf8')

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

const hits = { bridgeUrls: [], tmdb: [], tmdbSearch: [], stops: 0, panelUrls: [] }

/** Player do YouTube FALSO: obedece ao protocolo da ponte e reage ao id do vídeo. */
const FAKE_YT = `
(function () {
  window.YT = {
    Player: function (el, opts) {
      var st = { s: -1, t: 0, d: 100, log: [], seeks: [], videoId: opts.videoId };
      window.__yt = st;
      var ev = opts.events || {};
      var emit = function (state) { st.s = state; if (ev.onStateChange) ev.onStateChange({ data: state }); };
      st.emit = emit;
      st.error = function (code) { if (ev.onError) ev.onError({ data: code }); };
      // 'noplay00001' nunca toca; 'blocked0001' devolve erro 150; os demais tocam.
      var plays = opts.videoId !== 'noplay00001' && opts.videoId !== 'blocked0001';
      this.playVideo = function () { st.log.push('play'); if (plays) setTimeout(function () { emit(1); }, 0); };
      this.pauseVideo = function () { st.log.push('pause'); setTimeout(function () { emit(2); }, 0); };
      this.stopVideo = function () { st.log.push('stop'); fetch('https://ytfake.test/stop?v=' + opts.videoId).catch(function () {}); };
      this.seekTo = function (t) { st.log.push('seek'); st.seeks.push(t); st.t = t; };
      this.getPlayerState = function () { return st.s; };
      this.getCurrentTime = function () { return st.t; };
      this.getDuration = function () { return st.d; };
      setTimeout(function () {
        if (ev.onReady) ev.onReady({});
        if (opts.videoId === 'blocked0001') setTimeout(function () { st.error(150); }, 50);
      }, 0);
    }
  };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`

/** Painel Xtream fictício: filmes com/sem trailer do provedor e uma série com trailer. */
function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end('não encontrado')
      return
    }
    hits.panelUrls.push(url.href)
    const action = url.searchParams.get('action')
    res.writeHead(200, { 'Content-Type': 'application/json' })

    if (action === 'get_live_categories' || action === 'get_live_streams') return void res.end('[]')
    if (action === 'get_vod_categories') return void res.end(JSON.stringify([{ category_id: '10', category_name: 'Filmes' }]))
    if (action === 'get_vod_streams') {
      return void res.end(
        JSON.stringify(
          MOVIES.map((movie, index) => ({ name: movie.title, stream_id: index + 1, category_id: '10', year: 2021 })),
        ),
      )
    }
    if (action === 'get_vod_info') {
      const movie = MOVIES[Number(url.searchParams.get('vod_id')) - 1]
      return void res.end(JSON.stringify({ info: movie?.info ?? {}, movie_data: {} }))
    }
    if (action === 'get_series_categories') return void res.end(JSON.stringify([{ category_id: '20', category_name: 'Séries' }]))
    if (action === 'get_series') return void res.end(JSON.stringify([{ name: 'Série Exemplo', series_id: '500', category_id: '20', year: 2023 }]))
    if (action === 'get_series_info') {
      return void res.end(
        JSON.stringify({
          info: { plot: 'Sinopse da série.', youtube_trailer: 'serTrail001' },
          episodes: { 1: [{ id: '5001', episode_num: 1, title: 'Piloto', container_extension: 'mp4' }] },
        }),
      )
    }
    return void res.end(JSON.stringify({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const MOVIES = [
  { title: 'Filme Trailer', info: { plot: 'A', youtube_trailer: 'provTrail01' } },
  { title: 'Filme Sem Trailer', info: { plot: 'B' } },
  { title: 'Filme Bloqueado', info: { plot: 'C', youtube_trailer: 'blocked0001' } },
  { title: 'Filme Carregando', info: { plot: 'D', youtube_trailer: 'noplay00001' } },
  { title: 'Filme Reserva', info: { plot: 'E', youtube_trailer: 'blocked0001', tmdb_id: 777 } },
]
const MOVIE_ORDER = MOVIES.map((movie) => movie.title)

/** Ponte real + YouTube falso + TMDB falso, todos por `context.route`. */
async function installRoutes(context) {
  await context.route(/^https:\/\/johnosd\.github\.io\/ccplaytv\/trailer\//, (route) => {
    hits.bridgeUrls.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BRIDGE_HTML })
  })
  await context.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_YT }),
  )
  await context.route('https://ytfake.test/**', (route) => {
    hits.stops += 1
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'ok' })
  })
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
  await context.route('https://api.themoviedb.org/**', (route) => {
    const url = new URL(route.request().url())
    hits.tmdb.push(url.href.replace(GOOD_KEY, '<chave>'))
    if (url.searchParams.get('api_key') !== GOOD_KEY) {
      return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ success: false, status_code: 7 }) })
    }
    if (url.pathname === '/3/authentication') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ success: true }) })
    if (url.pathname === '/3/movie/777') {
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          id: 777,
          title: 'Filme Reserva',
          original_language: 'pt',
          release_date: '2021-05-01',
          overview: 'Sinopse do TMDB.',
          genres: [],
          credits: { cast: [], crew: [] },
          videos: {
            results: [
              { site: 'YouTube', type: 'Trailer', key: 'reserva0001', iso_639_1: 'pt', official: true },
              { site: 'YouTube', type: 'Trailer', key: 'blocked0001', iso_639_1: 'en', official: true },
            ],
          },
        }),
      })
    }
    return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ status_code: 34 }) })
  })
  await context.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 404, body: '' }))
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

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function enterFirstRealCategory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, { timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
}

const focusedCardTitle = (page) =>
  page.evaluate(() => {
    const focused = document.querySelector('.tv-focus')
    return focused?.closest('.content-card')?.querySelector('.content-card-title')?.textContent ?? null
  })

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

const trailerAction = (page) => page.locator('.vod-detail-action', { hasText: /Trailer/ })
const trailerLabel = async (page) => ((await trailerAction(page).textContent()) ?? '').trim()

/** Espera o rótulo do botão ser `label` (a metadata chega de forma assíncrona). */
async function waitTrailerLabel(page, label) {
  await page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll('.vod-detail-action')).some((el) => el.textContent?.trim() === expected),
    label,
    { timeout: 10000 },
  )
}

/** Volta ao Início com RETURN, de onde quer que a tela esteja. */
async function goHome(page) {
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.home-content').count()) > 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await page.waitForSelector('.home-content', { timeout: 8000 })
}

/**
 * Abre o detalhe do filme `title` e espera o botão sair de "Trailer…". Por padrão
 * parte de uma grade NOVA (Início → Filmes → categoria): voltar do detalhe para a
 * grade refaz o `get_vod_streams` e troca os ids dos canais (observado também SEM
 * abrir trailer — ver plan.md, R-011), então o card restaurado pode apontar para um id
 * que já não existe. Esse comportamento é anterior à 033 e não faz parte dela.
 */
async function openMovieDetail(page, title, { fresh = true } = {}) {
  if (fresh) {
    await goHome(page)
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
  }
  await focusCardByTitle(page, title)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('.vod-detail-action')).some((el) => el.textContent?.trim() === 'Trailer…'),
    null,
    { timeout: 10000 },
  )
}

/** Ações do filme sem progresso: [Assistir][Minha Lista][Trailer] — o Trailer é o índice 2. */
async function focusTrailerAction(page) {
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
}

const bridgeFrame = (page) => page.frames().find((frame) => frame.url().startsWith(BRIDGE_ORIGIN))

async function waitBridgeFrame(page, videoId) {
  await page.waitForFunction(() => document.querySelector('.trailer-frame'), null, { timeout: 8000 })
  for (let i = 0; i < 80; i += 1) {
    const frame = bridgeFrame(page)
    if (frame) {
      const ready = await frame.evaluate((id) => window.__yt?.videoId === id, videoId).catch(() => false)
      if (ready) return frame
    }
    await page.waitForTimeout(100)
  }
  throw new Error(`o player falso de "${videoId}" não subiu`)
}

const ytState = (frame) => frame.evaluate(() => ({ log: [...window.__yt.log], seeks: [...window.__yt.seeks], s: window.__yt.s }))
const pill = (page) => page.locator('.trailer-layer .trailer-pill').first()
// A pausa depois de desmontar deixa o cleanup passivo do React soltar o teclado modal da camada.
async function layerGone(page) {
  await page.locator('.trailer-layer').waitFor({ state: 'detached', timeout: 8000 })
  await page.waitForTimeout(120)
}

async function assertLayerOneFocus(page, step) {
  const count = await page.locator('.trailer-layer .tv-focus').count()
  assert(count === 1, `foco (${step}): exatamente um .tv-focus na camada do trailer (achou ${count})`)
}

async function run() {
  const server = await startPanelServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const m3uUrl = `${base}/get.php?username=${PANEL_USER}&password=${PANEL_PASS}`

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  await installRoutes(context)
  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => window.__offline !== true })
  })
  const consoleLines = []
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => consoleLines.push(msg.text()))

  try {
    await addSource(page, m3uUrl, 'Fonte E2E Trailers')

    console.log('=== SC-004: percorrer a grade não consulta nada (nem a ponte, nem o TMDB) ===')
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(400)
    assert(hits.bridgeUrls.length === 0, 'nenhuma requisição à ponte só de percorrer a grade')
    assert(hits.tmdb.length === 0, 'nenhuma requisição ao TMDB só de percorrer a grade')

    console.log('=== US1: filme com trailer do provedor — abrir, tocar, pausar, buscar, fim fecha ===')
    await openMovieDetail(page, 'Filme Trailer', { fresh: false })
    assert((await trailerLabel(page)) === '▶ Trailer', 'botão disponível: "▶ Trailer" (sem idioma, é trailer do provedor)')
    assert(hits.bridgeUrls.length === 0, 'ver o detalhe (e o botão) não abre a ponte')
    await focusTrailerAction(page)
    assert((await trailerAction(page).getAttribute('class'))?.includes('tv-focus') ?? false, 'o foco está no botão Trailer')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.trailer-layer', { timeout: 5000 })
    const src = new URL(await page.locator('.trailer-frame').getAttribute('src'))
    assert(src.origin === BRIDGE_ORIGIN, 'o iframe carrega a página-ponte, nunca o YouTube direto')
    assert(JSON.stringify([...src.searchParams.keys()]) === '["v"]' && src.searchParams.get('v') === 'provTrail01', 'só o id do vídeo vai na URL da ponte')
    let frame = await waitBridgeFrame(page, 'provTrail01')
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '⏸ Pausar', null, { timeout: 8000 })
    assert(true, 'a ponte avisou "playing": pill "⏸ Pausar"')
    await assertLayerOneFocus(page, 'tocando')

    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '▶ Continuar', null, { timeout: 5000 })
    assert((await ytState(frame)).log.includes('pause'), 'OK mandou "toggle" e a ponte pausou o player')
    await assertLayerOneFocus(page, 'pausado')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '⏸ Pausar', null, { timeout: 5000 })
    assert((await ytState(frame)).log.filter((entry) => entry === 'play').length >= 2, 'OK de novo retomou o player')

    // A-01 / FR-013: o salto nunca passa do fim nem do início (o clamp mora na ponte).
    await frame.evaluate(() => { window.__yt.t = 95 })
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => false, null, { timeout: 300 }).catch(() => {})
    let seeks = (await ytState(frame)).seeks
    assert(seeks.at(-1) === 100, `→ perto do fim fica limitado à duração (seekTo ${seeks.at(-1)}, esperado 100)`)
    await frame.evaluate(() => { window.__yt.t = 4 })
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => false, null, { timeout: 300 }).catch(() => {})
    seeks = (await ytState(frame)).seeks
    assert(seeks.at(-1) === 0, `← perto do início fica limitado a zero (seekTo ${seeks.at(-1)}, esperado 0)`)

    await frame.evaluate(() => window.__yt.emit(0)) // fim do vídeo
    await layerGone(page)
    assert(true, 'o fim do vídeo fechou a camada')
    assert(bridgeFrame(page) === undefined, 'nenhum iframe da ponte sobra (nada de áudio residual)')
    assert((await trailerLabel(page)) === '▶ Trailer', 'o detalhe segue montado por baixo')
    assert((await trailerAction(page).getAttribute('class'))?.includes('tv-focus') ?? false, 'fechar devolve o foco ao botão Trailer')

    console.log('=== RETURN fecha, para o vídeo e devolve o foco ===')
    await page.keyboard.press('Enter')
    frame = await waitBridgeFrame(page, 'provTrail01')
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '⏸ Pausar', null, { timeout: 8000 })
    await page.keyboard.press('Escape')
    await layerGone(page)
    assert(bridgeFrame(page) === undefined, 'RETURN removeu o iframe da ponte (o vídeo não sobra)')
    assert((await trailerAction(page).getAttribute('class'))?.includes('tv-focus') ?? false, 'RETURN devolveu o foco ao botão Trailer')
    assert((await page.locator('.vod-detail-hero').count()) === 1, 'RETURN fechou só a camada: o detalhe continua aberto')

    console.log('=== Sem rede: TRL-REDE, com "Tentar de novo" e "Voltar" ===')
    // Só navigator.onLine muda: a rede real (e o react-query, que também escuta o navegador) fica intacta.
    await page.evaluate(() => { window.__offline = true })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.trailer-layer .error-state', { timeout: 5000 })
    assert(((await page.getByTestId('error-state-code').textContent()) ?? '') === 'TRL-REDE', 'sem rede abre direto em TRL-REDE')
    assert((await page.getByRole('button', { name: 'Tentar de novo' }).count()) === 1, 'o erro de rede oferece "Tentar de novo"')
    await assertLayerOneFocus(page, 'erro de rede')
    await page.evaluate(() => { window.__offline = false })
    await page.keyboard.press('Enter') // "Tentar de novo"
    frame = await waitBridgeFrame(page, 'provTrail01')
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '⏸ Pausar', null, { timeout: 8000 })
    assert(true, '"Tentar de novo" com a rede de volta remonta a ponte e toca')
    await page.keyboard.press('Escape')
    await layerGone(page)

    console.log('=== FR-006/FR-008: sem trailer — soft-disabled, se declara, OK explica e sugere o TMDB ===')
    await openMovieDetail(page, 'Filme Sem Trailer')
    const semTitle = (await page.locator('.vod-detail-title').textContent()) ?? ''
    const semLabel = await trailerLabel(page)
    assert(semLabel === 'Trailer — indisponível', `rótulo "Trailer — indisponível" (detalhe de "${semTitle}", rótulo "${semLabel}")`)
    assert((await trailerAction(page).getAttribute('aria-disabled')) === 'true', 'o botão indisponível se declara aria-disabled')
    await focusTrailerAction(page)
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=/Integrações/', { timeout: 5000 })
    assert((await page.locator('.trailer-layer').count()) === 0, 'OK no indisponível não abre camada nenhuma')

    console.log('=== US3: vídeo bloqueado sem reserva — erro só com "Voltar" ===')
    await openMovieDetail(page, 'Filme Bloqueado')
    await focusTrailerAction(page)
    await page.keyboard.press('Enter')
    // O erro chega em ~50 ms e remove o iframe: não dá para "esperar o player subir" aqui.
    await page.waitForSelector('.trailer-layer .error-state', { timeout: 8000 })
    assert(new URL(hits.bridgeUrls.at(-1)).searchParams.get('v') === 'blocked0001', 'a ponte foi aberta com o id do provedor')
    assert(((await page.getByTestId('error-state-code').textContent()) ?? '') === 'YT-150', 'o erro 150 aparece como YT-150')
    assert((await page.getByRole('button', { name: 'Tentar de novo' }).count()) === 0, 'sem reserva e sem "Tentar de novo": só "Voltar"')
    await page.keyboard.press('Enter') // Voltar
    await layerGone(page)
    assert((await trailerAction(page).getAttribute('class'))?.includes('tv-focus') ?? false, '"Voltar" devolve o foco ao botão Trailer')

    console.log('=== FR-023: carregando tem "Cancelar" focado e ativável ===')
    await openMovieDetail(page, 'Filme Carregando')
    await focusTrailerAction(page)
    await page.keyboard.press('Enter')
    await waitBridgeFrame(page, 'noplay00001')
    assert(((await pill(page).textContent()) ?? '') === 'Cancelar', 'carregando: a pill é "Cancelar"')
    await assertLayerOneFocus(page, 'carregando')
    await page.keyboard.press('Enter')
    await layerGone(page)
    assert(bridgeFrame(page) === undefined, '"Cancelar" removeu o iframe da ponte')

    console.log('=== Série: "Trailer…" enquanto os episódios chegam, sem piscar "indisponível" ===')
    await goHome(page)
    await openViaTopbar(page, 'series')
    await enterFirstRealCategory(page)
    await page.evaluate(() => {
      window.__labels = new Set()
      const collect = () => document.querySelectorAll('.vod-detail-action').forEach((el) => window.__labels.add(el.textContent?.trim()))
      new MutationObserver(collect).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    await waitTrailerLabel(page, '▶ Trailer')
    const seen = await page.evaluate(() => [...window.__labels])
    assert(!seen.includes('Trailer — indisponível'), `o botão da série nunca piscou "indisponível" (rótulos vistos: ${seen.filter((l) => /Trailer/.test(l ?? '')).join(' | ')})`)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await waitBridgeFrame(page, 'serTrail001')
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '⏸ Pausar', null, { timeout: 8000 })
    assert(true, 'série: o trailer do provedor (get_series_info) toca')
    await page.keyboard.press('Escape')
    await layerGone(page)
    assert((await trailerAction(page).getAttribute('class'))?.includes('tv-focus') ?? false, 'série: fechar devolve o foco ao botão Trailer')

    console.log('=== US2: com a chave TMDB, 150 no 1º candidato toca o reserva ===')
    await goHome(page)
    await openSettingsFromHome(page)
    await page.keyboard.press('ArrowUp') // aba "Integrações & BYOK"
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter') // Configurar
    await page.waitForSelector('#tmdb-key-title', { timeout: 8000 })
    await page.getByLabel(/Chave da API/).fill(GOOD_KEY)
    await page.getByRole('button', { name: 'Salvar e testar' }).click()
    await page.waitForSelector('.integration-card-state:has-text("Conectado")', { timeout: 8000 })
    await page.keyboard.press('Escape') // Configurações → Início
    await page.waitForSelector('.home-content', { timeout: 8000 })
    await openViaTopbar(page, 'movies')
    await enterFirstRealCategory(page)
    const tmdbBefore = hits.tmdb.length
    await focusCardByTitle(page, 'Filme Reserva')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    await waitTrailerLabel(page, '▶ Trailer')
    const movieCalls = hits.tmdb.slice(tmdbBefore).map((href) => new URL(href)).filter((url) => url.pathname === '/3/movie/777')
    assert(movieCalls.length === 1, `os vídeos do TMDB vieram na MESMA chamada do detalhe (${movieCalls.length} chamada a /3/movie/777)`)
    assert(
      (movieCalls[0]?.searchParams.get('append_to_response') ?? '').split(',').includes('videos') &&
        (movieCalls[0]?.searchParams.get('include_video_language') ?? '').split(',').includes('pt'),
      'a chamada pede videos com include_video_language incluindo pt',
    )
    await focusTrailerAction(page)
    await page.keyboard.press('Enter')
    await waitBridgeFrame(page, 'reserva0001') // provedor (blocked0001) deu 150 → reserva do TMDB
    await page.waitForFunction(() => document.querySelector('.trailer-layer .trailer-pill')?.textContent === '⏸ Pausar', null, { timeout: 8000 })
    assert((await page.locator('.trailer-layer .error-state').count()) === 0, 'o reserva tocou e nenhum erro apareceu')
    assert(
      new URL(await page.locator('.trailer-frame').getAttribute('src')).searchParams.get('v') === 'reserva0001',
      'a troca remontou a ponte com o 2º candidato',
    )
    await page.keyboard.press('Escape')
    await layerGone(page)

    console.log('=== Higiene: só o id vai à ponte; segredo nunca em console nem na URL ===')
    assert(
      hits.bridgeUrls.every((href) => JSON.stringify([...new URL(href).searchParams.keys()]) === '["v"]'),
      'toda requisição à ponte tem só o parâmetro "v"',
    )
    assert(
      hits.bridgeUrls.every((href) => !href.includes(PANEL_PASS) && !href.includes(PANEL_USER) && !href.includes(GOOD_KEY) && !href.includes('Filme')),
      'nenhuma URL da ponte carrega credencial do painel, chave TMDB ou título',
    )
    assert(consoleLines.every((line) => !line.includes(GOOD_KEY) && !line.includes(PANEL_PASS)), 'nenhuma linha de console contém segredo')
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NO ROTEIRO:', error)
    console.error('  ações ao painel:', hits.panelUrls.map((href) => new URL(href).searchParams.get('action')).join(','))
    console.error('  requisições à ponte:', hits.bridgeUrls.length, '| TMDB:', hits.tmdb.length, '| stops:', hits.stops)
    await page.screenshot({ path: 'trailers-falha.png' }).catch(() => {})
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
