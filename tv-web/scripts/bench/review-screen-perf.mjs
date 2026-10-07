// Medição ad hoc de code review: produção, dados sintéticos, contexto isolado.
// node scripts/bench/review-screen-perf.mjs [--cpu 4] [--repeat 3]
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cpu = Number(process.argv[process.argv.indexOf('--cpu') + 1]) || 4
const repeat = Number(process.argv[process.argv.indexOf('--repeat') + 1]) || 3
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const file = path.resolve(root, 'dist', pathname === '/' ? 'index.html' : `.${pathname}`)
  if (!file.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(403).end(); return }
  try {
    const data = await readFile(file)
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' }[path.extname(file)]
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(data)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const results = []

async function instrument(page) {
  await page.addInitScript(() => {
    window.__reads = []
    window.__long = []
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__long.push({ start: entry.startTime, ms: entry.duration })
    }).observe({ type: 'longtask', buffered: true })
    for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      const original = prototype.getAll
      prototype.getAll = function (...args) {
        const start = performance.now()
        const name = this.objectStore?.name || this.name
        const req = original.apply(this, args)
        req.addEventListener('success', () => window.__reads.push({ name, ms: performance.now() - start, records: req.result.length,
          items: req.result.reduce((n, row) => n + (row.items?.length || 0), 0) }))
        return req
      }
    }
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, inject: () => 1,
      onCommitFiberRoot(_id, root) {
        const visit = fiber => {
          if (!fiber) return
          if (fiber.memoizedProps?.client?.getQueryCache) window.__qc = fiber.memoizedProps.client
          visit(fiber.child); visit(fiber.sibling)
        }
        visit(root.current)
      }, onCommitFiberUnmount() {},
    }
  })
}

async function seed(page, movies, series, tmdb) {
  await page.evaluate(async ({ movies, series, tmdb }) => {
    const database = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ccplaytv'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    })
    const now = Date.now()
    const tx = database.transaction(['sources', 'categories', 'categoryBlocks', 'integrations'], 'readwrite')
    tx.objectStore('sources').put({ id: 'review', displayName: 'Review sintético', type: 'provider_credentials',
      connectionState: 'synced', providerImportMode: 'xtream_api', providerMigratedAt: now, lastSuccessfulSyncAt: now,
      epgIdsCapturedAt: now, epgDisabled: true, activeGeneration: 1, createdAt: now, updatedAt: now })
    for (const [kind, total, catCount, offset] of [['movie', movies, 104, 1], ['series', series, 30, 200]]) {
      for (let c = 0; c < catCount; c++) {
        const categoryId = c + offset
        const start = Math.floor(c * total / catCount), end = Math.floor((c + 1) * total / catCount)
        const items = Array.from({ length: end - start }, (_, index) => {
          const n = start + index
          const name = `${kind === 'movie' ? 'Filme' : 'Série'} ${n} (${new Date().getFullYear() - n % 8})`
          return { id: -(categoryId * 4294967296 + index + 1), name, originalName: name,
            providerStreamId: String(n + 1), ...(kind === 'series' ? { seriesId: String(n + 1) } : {}),
            year: new Date().getFullYear() - n % 8, addedAt: now - n * 1000, providerRating: 6 + (n % 39) / 10, streamExtension: 'mp4' }
        })
        tx.objectStore('categories').put({ id: categoryId, sourceId: 'review', generation: 1, kind, name: `Categoria ${kind} ${c}`,
          order: c, fetchMode: 'eager', itemsFetchedAt: now, itemsCount: items.length, declaredCount: items.length })
        tx.objectStore('categoryBlocks').put({ categoryId, sourceId: 'review', generation: 1, kind, groupOrder: c, items })
      }
    }
    if (tmdb) tx.objectStore('integrations').put({ id: 'tmdb', key: '0123456789abcdef0123456789abcdef', format: 'v3', state: 'connected', lastTestedAt: now })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    database.close()
  }, { movies, series, tmdb })
}

async function snapshot(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  const heap = await cdp.send('Runtime.getHeapUsage')
  const cache = await page.evaluate(() => window.__qc?.getQueryCache().getAll().map(q => ({
    key: q.queryKey, observers: q.getObserversCount(), entries: q.state.data?.entries?.length,
    items: q.state.data?.items?.length, pages: q.state.data?.pages?.length,
  })) || [])
  return { heapMiB: heap.usedSize / 1048576, queries: cache.length, indexEntries: cache.reduce((n, q) => n + (q.entries || 0), 0), cache }
}

async function measure(page, name, action, selector, settled = 2200) {
  await page.evaluate(() => { window.__reads = []; window.__long = []; window.__t0 = performance.now(); window.__marker = null
    window.__observer = new MutationObserver(() => {
      if (document.querySelector(window.__selector) && window.__marker === null) {
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__marker ??= performance.now() - window.__t0 }))
      }
    }); window.__observer.observe(document, { subtree: true, childList: true })
  })
  await page.evaluate(selector => { window.__selector = selector }, selector)
  await action()
  if (selector) await page.waitForFunction(() => window.__marker !== null, null, { timeout: 20000 })
  await page.waitForTimeout(settled)
  const data = await page.evaluate(() => {
    window.__observer.disconnect()
    return { firstContentMs: window.__marker, maxLongTaskMs: Math.max(0, ...window.__long.map(e => e.ms)),
      longTaskTotalMs: window.__long.reduce((n, e) => n + e.ms, 0), longTasks: window.__long.length,
      blockGetAllReads: window.__reads.filter(r => r.name === 'categoryBlocks'), reads: window.__reads }
  })
  console.log(name, JSON.stringify({ firstContentMs: data.firstContentMs, maxLongTaskMs: data.maxLongTaskMs,
    longTaskTotalMs: data.longTaskTotalMs, blockItems: data.blockGetAllReads.reduce((n, r) => n + r.items, 0) }))
  return { name, ...data }
}

try {
  for (const tmdb of [false, true]) for (let run = 0; run < repeat; run++) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.name + ': ' + e.message.slice(0, 120)))
    const api = []
    await page.route('https://api.themoviedb.org/**', async route => {
      const url = new URL(route.request().url())
      api.push({ path: url.pathname, page: url.searchParams.get('page'), at: Date.now() })
      await new Promise(resolve => setTimeout(resolve, 100))
      const kind = url.pathname.includes('/tv') ? 'series' : 'movie'
      const results = Array.from({ length: 20 }, (_, n) => ({ id: n + 1, title: `Filme ${n}`, original_title: `Filme ${n}`,
        name: `Série ${n}`, original_name: `Série ${n}`, release_date: `${new Date().getFullYear() - n % 8}-01-01`,
        first_air_date: `${new Date().getFullYear() - n % 8}-01-01`, vote_average: 8, vote_count: 900, popularity: 90 - n }))
      await route.fulfill({ json: { results, total_pages: 8, media_type: kind } })
    })
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin || url.hostname === 'api.themoviedb.org') return route.fallback()
      return route.abort()
    })
    await instrument(page)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    await page.goto(origin)
    await page.waitForSelector('.add-card', { timeout: 15000 })
    await seed(page, 43000, 10000, tmdb)
    await page.reload()
    await page.waitForSelector('.source-card', { timeout: 15000 })
    const before = await snapshot(page, cdp)
    const samples = []
    samples.push(await measure(page, 'home-cold', () => page.locator('.source-card').click(), '.home-billboard, .home-hero', 3500))
    const home = await snapshot(page, cdp)
    samples.push(await measure(page, 'movies-after-home', () => page.locator('.topbar-nav button').nth(2).click(), '.vod-showcase .content-card'))
    const movies = await snapshot(page, cdp)
    samples.push(await measure(page, 'series-after-home', () => page.locator('.topbar-nav button').nth(3).click(), '.vod-showcase .content-card'))
    const series = await snapshot(page, cdp)
    samples.push(await measure(page, 'home-return', () => page.locator('.topbar-nav button').nth(0).click(), '.home-billboard, .home-hero'))
    // Índice frio de Filmes: mantém catálogo local e elimina só cache de consulta do tipo.
    await page.evaluate(() => window.__qc.removeQueries({ queryKey: ['catalog-search-index', 'review', 'movie'] }))
    samples.push(await measure(page, 'movies-index-cold', () => page.locator('.topbar-nav button').nth(2).click(), '.vod-showcase .content-card'))
    const beforeInvalidation = api.length
    // Reproduz a invalidação feita a cada lote da pré-carga, sem tráfego real do provedor.
    samples.push(await measure(page, 'index-invalidate-3-batches', async () => {
      for (let n = 0; n < 3; n++) {
        await page.evaluate(() => window.__qc.invalidateQueries({ queryKey: ['catalog-search-index', 'review'] }))
        await page.waitForTimeout(1000)
      }
    }, null, 100))
    // Reabre categoria real pela lista lateral usando clique do fluxo existente.
    samples.push(await measure(page, 'movie-category-cold', () => page.locator('.side-category-nav-item').filter({ hasText: 'Categoria movie 0' }).first().click(), '.vod-grid .content-card'))
    const category = await snapshot(page, cdp)
    const entry = { run, tmdb, cpuThrottle: cpu, movies: 43000, series: 10000, categories: 134, before, home, moviesMemory: movies,
      seriesMemory: series, category, samples, api, apiAfterInvalidation: api.length - beforeInvalidation, errors }
    results.push(entry)
    console.log('snapshot', JSON.stringify({ tmdb, run, heapBefore: before.heapMiB, heapHome: home.heapMiB,
      heapMovies: movies.heapMiB, heapSeries: series.heapMiB, indexEntries: series.indexEntries, api: api.length, errors }))
    await context.close()
  }
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  const destination = path.join(root, 'bench-results', 'review-screen-perf')
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, `cpu${cpu}.json`), JSON.stringify({ date: new Date().toISOString(), browser: browser.version(),
    caveats: ['Synthetic catalog; eager blocks; no posters, history or episodes', 'CPU throttle is not physical TV',
      'All synthetic titles eligible for rated selection: stress case',
      'Timer starts before Playwright click: includes RPC/actionability overhead',
      'DOM appearance + two animation frames; not screenshot paint', 'V8 heap after forced GC; excludes GPU/video and overall process RSS'], results }, null, 2))
}
