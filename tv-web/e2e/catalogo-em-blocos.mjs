// Roteiro E2E da feature 039 (catálogo em blocos por categoria) — gate da
// constitution ("Testes E2E antes da TV física").
//
// Painel Xtream FICTÍCIO criado por este script (nunca uma fonte real).
// Pré-requisito: `npm run dev` rodando (http://localhost:5173).
//
// Cenários (quickstart.md):
//   1 — lista nova: todas as categorias viram blocos (`channels` só com
//       episódios) e abrir categoria, busca, "Todos", ★ Favoritos,
//       ↺ Histórico, detalhe e tocar funcionam sobre eles.
//   2 — migração: uma lista guardada no formato ANTIGO (uma linha por item em
//       `channels`) vira blocos sozinha, em segundo plano, sem perder itens,
//       ordem, favorito nem progresso. Não há build anterior no E2E (A2 do
//       Analyze): o formato antigo é semeado pelo próprio script no IndexedDB
//       do app, a partir do que o app gravou.
//   3 — estresse (SC-004): painel falso com ~300 mil filmes numa seção. A
//       carga termina, a página não quebra e o pico de heap (página e Worker,
//       por CDP) é medido e impresso. Demora minutos: só roda com
//       `CCPLAY_E2E_ESTRESSE=1` (os três) ou `CCPLAY_E2E_ESTRESSE=so` (só ele),
//       fora da rodada padrão do `test:e2e`.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { cadastrarListaM3u } from './lib/entrada.mjs'

const APP_URL = process.env.CCPLAY_APP_URL ?? 'http://localhost:5173'
const STRESS = process.env.CCPLAY_E2E_ESTRESSE
const STRESS_CATEGORIES = 30
const STRESS_PER_CATEGORY = Number(process.env.CCPLAY_E2E_ESTRESSE_POR_CATEGORIA ?? 10_000)

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

const LIVE = [1, 2].map((n) => ({ category_id: String(n), category_name: `Canais ${n}` }))
const VOD = [100, 101].map((id, i) => ({ category_id: String(id), category_name: `Filmes ${i + 1}` }))
const SERIES = [{ category_id: '200', category_name: 'Séries 1' }]
const TOTAL_CATEGORIES = LIVE.length + VOD.length + SERIES.length

function itemsFor(action, categoryId) {
  const base = Number(categoryId) * 100
  if (action === 'get_live_streams') {
    return Array.from({ length: 3 }, (_, i) => ({ stream_id: base + i, name: `Canal ${base + i}`, category_id: categoryId }))
  }
  if (action === 'get_vod_streams') {
    return Array.from({ length: 3 }, (_, i) => ({
      stream_id: base + i,
      name: `Filme ${base + i}`,
      category_id: categoryId,
      stream_type: 'movie',
    }))
  }
  return Array.from({ length: 2 }, (_, i) => ({ series_id: String(base + i), name: `Série ${base + i}`, category_id: categoryId }))
}

function startPanelServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname === '/xmltv.php') {
      res.writeHead(500)
      res.end()
      return
    }
    if (url.pathname !== '/player_api.php') {
      res.writeHead(404)
      res.end()
      return
    }
    const action = url.searchParams.get('action')
    const categoryId = url.searchParams.get('category_id')
    const send = (body) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (action === 'get_live_categories') return send(LIVE)
    if (action === 'get_vod_categories') return send(VOD)
    if (action === 'get_series_categories') return send(SERIES)
    if (action === 'get_series_info') {
      const seriesId = url.searchParams.get('series_id')
      return send({
        episodes: {
          1: [1, 2].map((n) => ({ id: `${seriesId}${n}`, episode_num: n, title: `Episódio ${n}`, container_extension: 'mp4' })),
        },
      })
    }
    const declared = { get_live_streams: LIVE, get_vod_streams: VOD, get_series: SERIES }[action]
    if (declared) {
      if (categoryId) return send(itemsFor(action, categoryId))
      return send(declared.flatMap((c) => itemsFor(action, c.category_id)))
    }
    if (action) return send([])
    return send({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

/**
 * O que está gravado, lido do IndexedDB do app: por categoria, os nomes dos
 * itens na ordem da fonte e onde estão (bloco ou linhas). Só nomes e contagens.
 */
async function snapshot(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('ccplaytv')
    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = (store) =>
      new Promise((resolve) => {
        const query = handle.transaction(store).objectStore(store).getAll()
        query.onsuccess = () => resolve(query.result)
      })
    const [categories, blocks, rows] = await Promise.all([all('categories'), all('categoryBlocks'), all('channels')])
    handle.close()
    const byCategory = {}
    for (const category of categories) {
      const block = blocks.find((candidate) => candidate.categoryId === category.id)
      const legacy = rows
        .filter((row) => row.kind === category.kind && row.groupOrder === category.order && row.generation === category.generation)
        .sort((a, b) => (a.categoryPosition ?? 1e15) - (b.categoryPosition ?? 1e15) || a.id - b.id)
      byCategory[category.name] = {
        format: block ? 'block' : legacy.length > 0 ? 'rows' : 'empty',
        names: block ? block.items.map((item) => item.name) : legacy.map((row) => row.name),
        itemsFetchedAt: category.itemsFetchedAt,
      }
    }
    return {
      byCategory,
      blocks: blocks.length,
      nonEpisodeRows: rows.filter((row) => row.kind !== 'episode').length,
      episodeRows: rows.filter((row) => row.kind === 'episode').length,
    }
  })
}

/** Cadastra a lista do painel falso e espera a pré-carga gravar todas as categorias. */
async function registerAndPrefetch(page, panelUrl) {
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await cadastrarListaM3u(page, { nome: 'Lista E2E 039', url: panelUrl })
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 10000 })
  // Pré-carga do catálogo inteiro (portão abre ~2 s sem tecla).
  let state = await snapshot(page)
  for (let i = 0; i < 80 && state.blocks < TOTAL_CATEGORIES; i += 1) {
    await page.waitForTimeout(250)
    state = await snapshot(page)
  }
  return state
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Trilha de Filmes/Séries: ★ Favoritos, ↺ Histórico, Todos e as categorias reais. */
async function waitForRealCategory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.side-category-nav-item').length >= 4, null, {
    timeout: 8000,
  })
}

const focusedTrailLabel = (page) => page.locator('.side-category-nav-item.tv-focus').textContent()
const gridTitles = (page) => page.locator('.content-card-title').allTextContents()

async function waitForGrid(page, predicate, description) {
  try {
    await page.waitForFunction(
      (source) => {
        const titles = [...document.querySelectorAll('.content-card-title')].map((node) => node.textContent)
        return new Function('titles', `return (${source})(titles)`)(titles)
      },
      predicate.toString(),
      { timeout: 8000 },
    )
  } catch {
    console.error(`  (grade não chegou a: ${description}; atual: ${JSON.stringify(await gridTitles(page))})`)
  }
}

async function scenarioNewList(browser, panelUrl) {
  console.log('=== Cenário 1: lista nova só com blocos; navegar, buscar, favoritar e tocar ===')
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error', error?.message ?? ''))
  // O player de desenvolvimento (<video>) nunca recebe um fluxo de verdade. Só no
  // host do painel: `**/series/**` também pegaria os módulos do Vite.
  await page.route(
    (url) => url.hostname === '127.0.0.1' && /\/(movie|series)\//.test(url.pathname),
    () => {},
  )

  const ready = await registerAndPrefetch(page, panelUrl)
  assert(ready.blocks === TOTAL_CATEGORIES, `lista nova: ${TOTAL_CATEGORIES} categorias gravadas como blocos`)
  assert(ready.nonEpisodeRows === 0, 'lista nova: nenhuma linha por item em `channels`')

  // Abrir categoria: itens na ordem da fonte.
  await openViaTopbar(page, 'movies')
  await waitForRealCategory(page)
  assert((await focusedTrailLabel(page))?.includes('Filmes 1') ?? false, 'Filmes abre na 1ª categoria real')
  await page.keyboard.press('ArrowRight')
  await waitForGrid(page, (titles) => titles.length === 3, '3 filmes')
  assert(
    (await gridTitles(page)).join(',') === 'Filme 10000,Filme 10001,Filme 10002',
    'categoria abre com os 3 filmes na ordem da fonte',
  )

  // Busca dentro da categoria → detalhe → favoritar → tocar e sair com progresso.
  await page.keyboard.press('ArrowUp') // grade -> "Pesquisar"
  await page.keyboard.press('Enter')
  const field = page.locator('input.search-field')
  await field.waitFor({ timeout: 8000 })
  await field.fill('10001')
  await waitForGrid(page, (titles) => titles.length === 1, '1 resultado')
  assert((await gridTitles(page)).join(',') === 'Filme 10001', 'busca "10001" acha só "Filme 10001"')
  await page.keyboard.press('ArrowDown') // campo -> resultado
  await page.keyboard.press('Enter')
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  assert((await page.locator('.vod-detail-title').textContent()) === 'Filme 10001', 'detalhe abre o item do bloco')
  await page.keyboard.press('ArrowRight') // Assistir -> Minha Lista
  await page.keyboard.press('Enter')
  await page.getByText('Adicionado aos favoritos').waitFor({ timeout: 4000 }).catch(() => {})
  await page.keyboard.press('ArrowLeft') // -> Assistir
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate(() => {
    const video = document.querySelector('.player-video')
    if (!video) return
    video.dispatchEvent(new Event('playing'))
    Object.defineProperty(video, 'duration', { value: 1800, configurable: true })
    video.currentTime = 300
    video.dispatchEvent(new Event('timeupdate'))
  })
  assert(true, 'o filme do bloco abriu no player')
  await page.keyboard.press('Escape') // encerra sem concluir
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
  await page.waitForSelector('text=/Continuar/', { timeout: 8000 })
  assert(true, 'sair com progresso salvo vira "Continuar"')

  // "Todos": junta as categorias do tipo (blocos).
  await page.keyboard.press('Escape') // detalhe -> resultado
  await page.waitForSelector('input.search-field', { timeout: 8000 })
  await page.keyboard.press('Escape') // resultado -> campo
  await page.keyboard.press('Escape') // campo -> "Pesquisar"
  await page.keyboard.press('Escape') // "Pesquisar" -> trilha
  await page.waitForSelector('.vod-side-nav .tv-focus', { timeout: 8000 })
  await page.keyboard.press('ArrowUp') // Filmes 1 -> Todos
  assert((await focusedTrailLabel(page))?.includes('Todos') ?? false, 'trilha em "Todos"')
  await page.keyboard.press('ArrowRight')
  await waitForGrid(page, (titles) => titles.length === 6, '6 filmes')
  const all = await gridTitles(page)
  assert(
    all.length === 6 && all.includes('Filme 10001') && all.includes('Filme 10102'),
    '"Todos" de Filmes mostra os 6 filmes das 2 categorias',
  )

  // ↺ Histórico e ★ Favoritos resolvem o item pelo bloco.
  await page.keyboard.press('Escape') // grade -> trilha
  await page.keyboard.press('ArrowUp') // Todos -> Histórico
  assert((await focusedTrailLabel(page))?.includes('Histórico') ?? false, 'trilha em "↺ Histórico"')
  await page.keyboard.press('ArrowRight')
  await waitForGrid(page, (titles) => titles.includes('Filme 10001'), 'Filme 10001')
  assert((await gridTitles(page)).join(',') === 'Filme 10001', '"↺ Histórico" mostra o filme assistido')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowUp') // Histórico -> Favoritos
  assert((await focusedTrailLabel(page))?.includes('Favoritos') ?? false, 'trilha em "★ Favoritos"')
  await page.keyboard.press('ArrowRight')
  await waitForGrid(page, (titles) => titles.includes('Filme 10001'), 'Filme 10001')
  assert((await gridTitles(page)).join(',') === 'Filme 10001', '"★ Favoritos" mostra o filme favoritado')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  assert((await page.locator('.vod-detail-title').textContent()) === 'Filme 10001', 'o detalhe abre a partir de ★ Favoritos')

  // Série: episódios continuam por série, em linhas; o item-série segue no bloco.
  await page.keyboard.press('Escape') // detalhe -> grade
  await page.waitForSelector('.vod-grid', { timeout: 8000 })
  await page.keyboard.press('Escape') // grade -> trilha
  await page.keyboard.press('Escape') // trilha -> Início
  await page.waitForSelector('.home-content', { timeout: 8000 })
  await openViaTopbar(page, 'series')
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight')
  await waitForGrid(page, (titles) => titles.length === 2, '2 séries')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await page.waitForFunction(
    () => document.querySelector('.vod-detail-action')?.textContent === '▶ Assistir T1:E1',
    null,
    { timeout: 8000 },
  ).catch(() => {})
  assert(
    (await page.locator('.vod-detail-action').first().textContent()) === '▶ Assistir T1:E1',
    'detalhe da série do bloco obtém os episódios',
  )
  const afterSeries = await snapshot(page)
  assert(
    afterSeries.nonEpisodeRows === 0 && afterSeries.episodeRows === 2,
    '`channels` só com episódios (2), nenhum item de categoria',
  )
  await context.close()
}

/** Reescreve cada bloco como linhas de `channels` (o formato de antes da 039) e grava favorito + progresso. */
async function downgradeAndSeedUserState(page, { favorite, progress }) {
  return page.evaluate(
    async ({ favorite, progress }) => {
      const request = indexedDB.open('ccplaytv')
      const handle = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const tx = handle.transaction(['categoryBlocks', 'channels', 'userStates', 'sources'], 'readwrite')
      const blocks = tx.objectStore('categoryBlocks')
      const channels = tx.objectStore('channels')
      const all = await new Promise((resolve) => {
        const query = blocks.getAll()
        query.onsuccess = () => resolve(query.result)
      })
      const [source] = await new Promise((resolve) => {
        const query = tx.objectStore('sources').getAll()
        query.onsuccess = () => resolve(query.result)
      })
      for (const block of all) {
        block.items.forEach((item, index) => {
          const { id, ...fields } = item
          void id
          channels.add({
            ...fields,
            sourceId: block.sourceId,
            generation: block.generation,
            kind: block.kind,
            groupOrder: block.groupOrder,
            categoryId: block.categoryId,
            categoryPosition: index,
          })
        })
        blocks.delete(block.categoryId)
      }
      const now = Date.now()
      const states = tx.objectStore('userStates')
      states.put({ stableId: `${source.id}|movie|id:${favorite}`, sourceId: source.id, isFavorite: true, favoritedAt: now, createdAt: now })
      states.put({
        stableId: `${source.id}|movie|id:${progress}`,
        sourceId: source.id,
        isFavorite: false,
        progressSeconds: 300,
        lastWatched: now,
        createdAt: now,
      })
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      handle.close()
      return all.length
    },
    { favorite, progress },
  )
}

/**
 * Painel falso do cenário 3: `STRESS_CATEGORIES` categorias de filmes com
 * `STRESS_PER_CATEGORY` itens cada, no formato de um `get_vod_streams` real
 * (~300 bytes por item), escritas em fluxo — o servidor nunca monta o JSON
 * inteiro. As categorias vêm intercaladas, como num painel de verdade.
 */
function startStressPanelServer() {
  const VOD_STRESS = Array.from({ length: STRESS_CATEGORIES }, (_, i) => ({
    category_id: String(3000 + i),
    category_name: `Estresse ${String(i + 1).padStart(2, '0')}`,
  }))
  const movie = (index, categoryId) => {
    const code = String(index).padStart(6, '0')
    return JSON.stringify({
      num: index + 1,
      name: `Filme Estresse ${code} (${1970 + (index % 55)})`,
      stream_type: 'movie',
      stream_id: 500000 + index,
      stream_icon: `http://img.exemplo.test/poster/${code}-${(index * 2654435761) % 4294967296}.jpg`,
      rating: String((index % 90) / 10),
      rating_5based: (index % 50) / 10,
      added: String(1600000000 + index),
      category_id: categoryId,
      container_extension: 'mp4',
      custom_sid: '',
      direct_source: '',
      year: String(1970 + (index % 55)),
    })
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname !== '/player_api.php') {
      res.writeHead(url.pathname === '/xmltv.php' ? 500 : 404)
      res.end()
      return
    }
    const action = url.searchParams.get('action')
    const categoryId = url.searchParams.get('category_id')
    const json = (body) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (action === 'get_vod_categories') return json(VOD_STRESS)
    if (action === 'get_vod_streams') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      const total = STRESS_CATEGORIES * STRESS_PER_CATEGORY
      let index = 0
      let first = true
      res.write('[')
      const pump = () => {
        let chunk = ''
        for (let n = 0; n < 2000 && index < total; index += 1) {
          const category = categoryId ?? VOD_STRESS[index % STRESS_CATEGORIES].category_id
          if (categoryId && VOD_STRESS[index % STRESS_CATEGORIES].category_id !== categoryId) continue
          chunk += (first ? '' : ',') + movie(index, category)
          first = false
          n += 1
        }
        if (index >= total) {
          res.end(`${chunk}]`)
          return
        }
        if (res.write(chunk)) setImmediate(pump)
        else res.once('drain', pump)
      }
      pump()
      return
    }
    if (action) return json([])
    return json({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/**
 * Amostrador de heap (MB): a página por `Runtime.getHeapUsage` e cada Worker
 * vivo anexando ao alvo dele pela sessão do navegador (a sessão da página não
 * alcança o Worker). Guarda o pico de cada um.
 */
async function startHeapSampler(browser, page) {
  const pageSession = await page.context().newCDPSession(page)
  const browserSession = await browser.newBrowserCDPSession()
  const pending = new Map()
  let nextId = 1
  browserSession.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    const parsed = JSON.parse(message)
    const resolve = pending.get(`${sessionId}:${parsed.id}`)
    if (resolve) {
      pending.delete(`${sessionId}:${parsed.id}`)
      resolve(parsed.result)
    }
  })
  const attached = new Map()
  const peak = { pageMb: 0, workerMb: 0, workersSeen: 0 }
  const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10

  async function workerHeap(targetId) {
    let sessionId = attached.get(targetId)
    if (!sessionId) {
      sessionId = (await browserSession.send('Target.attachToTarget', { targetId, flatten: false })).sessionId
      attached.set(targetId, sessionId)
      peak.workersSeen += 1
    }
    const id = nextId++
    const result = new Promise((resolve) => {
      pending.set(`${sessionId}:${id}`, resolve)
      setTimeout(() => resolve(null), 2000)
    })
    await browserSession.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id, method: 'Runtime.getHeapUsage' }),
    })
    return result
  }

  let running = true
  let sampling = Promise.resolve()
  const sample = async () => {
    const heap = await pageSession.send('Runtime.getHeapUsage').catch(() => null)
    if (heap) peak.pageMb = Math.max(peak.pageMb, mb(heap.usedSize))
    const { targetInfos } = await browserSession.send('Target.getTargets')
    let workers = 0
    for (const target of targetInfos.filter((info) => info.type === 'worker')) {
      const usage = await workerHeap(target.targetId).catch(() => null)
      if (usage) workers += usage.usedSize
    }
    peak.workerMb = Math.max(peak.workerMb, mb(workers))
  }
  const loop = async () => {
    while (running) {
      sampling = sample().catch(() => {})
      await sampling
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  const done = loop()
  return {
    peak,
    reset: () => Object.assign(peak, { pageMb: 0, workerMb: 0 }),
    stop: async () => {
      running = false
      await done
    },
  }
}

async function scenarioStress(browser) {
  const total = STRESS_CATEGORIES * STRESS_PER_CATEGORY
  console.log(`=== Cenário 3: ${total} filmes numa seção (estresse, SC-004) ===`)
  const server = await startStressPanelServer()
  const panelUrl = `http://127.0.0.1:${server.address().port}/get.php?username=usuario&password=senha`
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  let crashed = false
  page.on('crash', () => {
    crashed = true
  })
  page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error', error?.message ?? ''))
  await page.route(/\.(jpe?g|png|webp)(\?|$)/i, (route) => route.abort())
  const sampler = await startHeapSampler(browser, page)

  try {
    await page.goto(APP_URL)
    await page.waitForSelector('.add-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('#add-source-title', { timeout: 8000 })
    await cadastrarListaM3u(page, { nome: 'Lista Estresse 039', url: panelUrl })
    await page.waitForSelector('text=/Concluída/', { timeout: 60000 })
    await page.getByRole('button', { name: 'Abrir lista' }).click()
    await page.waitForSelector('.home-content', { timeout: 10000 })

    // Pré-carga da seção inteira, parado no Início.
    const t0 = Date.now()
    let state = await snapshotCounts(page)
    while (!crashed && state.blocks < STRESS_CATEGORIES && Date.now() - t0 < 600_000) {
      await page.waitForTimeout(1000)
      state = await snapshotCounts(page).catch(() => state)
    }
    const loadMs = Date.now() - t0
    const loadPeak = { ...sampler.peak }
    assert(!crashed, 'a página não quebrou durante a carga')
    assert(
      state.blocks === STRESS_CATEGORIES && state.items === total,
      `carga terminou: ${state.blocks}/${STRESS_CATEGORIES} blocos, ${state.items}/${total} itens em ${Math.round(loadMs / 1000)} s`,
    )
    console.log(
      `  heap na carga: página pico ${loadPeak.pageMb} MB; Worker pico ${loadPeak.workerMb} MB (${loadPeak.workersSeen} Worker(s) visto(s)); armazenamento ${state.storageMb} MB`,
    )

    // "Todos" de Filmes: o tipo inteiro na memória (R-005).
    sampler.reset()
    await openViaTopbar(page, 'movies')
    await waitForRealCategory(page)
    await page.keyboard.press('ArrowUp') // 1ª categoria real -> "Todos"
    const tAll = Date.now()
    await page.keyboard.press('ArrowRight')
    const shown = await page
      .waitForFunction(
        () =>
          document.querySelectorAll('.side-category-nav-item')[2]?.classList.contains('is-selected') &&
          document.querySelectorAll('.content-card-title').length > 0,
        null,
        { timeout: 120_000 },
      )
      .then(() => true, () => false)
    const allMs = Date.now() - tAll
    await page.waitForTimeout(1000)
    assert(!crashed && shown, `"Todos" de Filmes abriu (${total} itens na lista) em ${allMs} ms`)
    console.log(`  heap ao abrir "Todos": página pico ${sampler.peak.pageMb} MB`)

    // Descer 300 fileiras (1.800 cartões): as páginas seguintes chegam conforme o foco
    // (feature 039, T022) e o heap cresce com o quanto se desceu, não com a lista.
    sampler.reset()
    const firstTitle = await page.locator('.content-card-title').first().textContent()
    for (let row = 0; row < 300; row += 1) await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1500)
    const focusedTitle = await page.locator('.vod-grid-cell .tv-focus').locator('..').locator('.content-card-title').textContent().catch(() => null)
    assert(!crashed && focusedTitle !== null && focusedTitle !== firstTitle, `descer 300 fileiras em "Todos" chega a outro cartão com foco`)
    console.log(`  heap descendo 300 fileiras em "Todos": página pico ${sampler.peak.pageMb} MB`)

    // Entrar numa categoria de 10 mil depois de tudo isso.
    await page.keyboard.press('Escape') // grade -> trilha
    await page.keyboard.press('ArrowDown') // Todos -> 1ª categoria real
    const tCat = Date.now()
    await page.keyboard.press('ArrowRight')
    const catShown = await page
      .waitForFunction(
        () =>
          document.querySelectorAll('.side-category-nav-item')[3]?.classList.contains('is-selected') &&
          document.querySelectorAll('.content-card-title').length > 0,
        null,
        { timeout: 60_000 },
      )
      .then(() => true, () => false)
    assert(!crashed && catShown, `categoria de ${STRESS_PER_CATEGORY} itens abriu em ${Date.now() - tCat} ms`)
  } finally {
    await sampler.stop().catch(() => {})
    await context.close()
    server.close()
  }
}

/** Blocos, itens em blocos e uso de armazenamento (MB) — só números. */
async function snapshotCounts(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('ccplaytv')
    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    let blocks = 0
    let items = 0
    await new Promise((resolve) => {
      const cursor = handle.transaction('categoryBlocks').objectStore('categoryBlocks').openCursor()
      cursor.onsuccess = () => {
        const current = cursor.result
        if (!current) return resolve()
        blocks += 1
        items += current.value.items.length
        current.continue()
      }
    })
    handle.close()
    const estimate = await navigator.storage.estimate()
    return { blocks, items, storageMb: Math.round(((estimate.usage ?? 0) / 1048576) * 10) / 10 }
  })
}

async function run() {
  const server = await startPanelServer()
  const panelUrl = `http://127.0.0.1:${server.address().port}/get.php?username=usuario&password=senha`
  const browser = await launchBrowser()

  if (STRESS === 'so') {
    try {
      await scenarioStress(browser)
    } finally {
      await browser.close()
      server.close()
    }
    if (failures > 0) {
      console.error(`\n${failures} verificação(ões) falharam`)
      process.exit(1)
    }
    console.log('\nTodas as verificações passaram')
    return
  }

  try {
    await scenarioNewList(browser, panelUrl)

    console.log('=== Cenário 2: lista no formato antigo vira blocos sozinha, sem perder nada ===')
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error('  [pageerror]', error?.name ?? 'Error', error?.message ?? ''))
    const before = await registerAndPrefetch(page, panelUrl)
    assert(before.blocks === TOTAL_CATEGORIES && before.nonEpisodeRows === 0, 'lista nova gravada como blocos')

    const converted = await downgradeAndSeedUserState(page, { favorite: '10001', progress: '10102' })
    const legacy = await snapshot(page)
    assert(converted === TOTAL_CATEGORIES && legacy.blocks === 0, 'semeado: todas as categorias voltaram ao formato antigo (linhas)')

    await page.reload()
    await page.waitForSelector('.source-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })

    let after = await snapshot(page)
    for (let i = 0; i < 120 && (after.blocks < TOTAL_CATEGORIES || after.nonEpisodeRows > 0); i += 1) {
      await page.waitForTimeout(250)
      after = await snapshot(page)
    }
    assert(after.blocks === TOTAL_CATEGORIES && after.nonEpisodeRows === 0, 'em segundo plano, todas as categorias viraram blocos e as linhas sumiram')
    const sameItems = Object.entries(before.byCategory).every(
      ([name, entry]) => JSON.stringify(entry.names) === JSON.stringify(after.byCategory[name]?.names),
    )
    assert(sameItems, 'mesmos itens, na mesma ordem, em cada categoria')
    const sameFetchedAt = Object.entries(legacy.byCategory).every(
      ([name, entry]) => entry.itemsFetchedAt === after.byCategory[name]?.itemsFetchedAt,
    )
    assert(sameFetchedAt, 'converter não conta como renovar (itemsFetchedAt intacto)')

    // Estado do usuário é por identidade estável: o Início relê depois da conversão.
    await page.reload()
    await page.waitForSelector('.source-card', { timeout: 10000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.home-content', { timeout: 10000 })
    const continueTitles = page.locator('section.home-row[aria-label="Continuar assistindo"] .content-card-title')
    await continueTitles.first().waitFor({ timeout: 8000 })
    assert((await continueTitles.allTextContents()).includes('Filme 10102'), '"Continuar assistindo" ainda mostra o filme com progresso')
    const favoriteTitles = page.locator('section.home-row[aria-label="Minha Lista"] .content-card-title')
    await favoriteTitles.first().waitFor({ timeout: 8000 })
    assert((await favoriteTitles.allTextContents()).includes('Filme 10001'), '"Minha Lista" ainda mostra o filme favorito')

    // Abrir o favorito pelo "★ Favoritos" de Filmes: o detalhe lê o item pelo id novo (bloco).
    await page.keyboard.press('ArrowDown') // hero -> "Continuar assistindo"
    await page.keyboard.press('ArrowDown') // -> "Minha Lista"
    await page.locator('section.home-row[aria-label="Minha Lista"] .tv-focus').waitFor({ timeout: 4000 })
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight') // até o agregado "Filmes (N)"
    await page.keyboard.press('Enter')
    await page.waitForSelector('.content-card-title', { timeout: 8000 })
    assert(
      (await page.locator('.content-card-title').first().textContent()) === 'Filme 10001',
      '"★ Favoritos" de Filmes mostra o favorito',
    )
    await page.keyboard.press('ArrowRight') // trilha -> grade
    await page.keyboard.press('Enter')
    await page.waitForSelector('.vod-detail-hero', { timeout: 8000 })
    assert(
      ((await page.locator('.vod-detail-hero').textContent()) ?? '').includes('Filme 10001'),
      'o detalhe do favorito abre com o item convertido',
    )
    await context.close()

    if (STRESS === '1') await scenarioStress(browser)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam`)
    process.exit(1)
  }
  console.log('\nTodas as verificações passaram')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
