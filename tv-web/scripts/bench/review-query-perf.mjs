// Diagnóstico de funções reais: algoritmos, 429 e chamada que não termina.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
vite.middlewares.use('/__review', (_req, res) => res.end('<!doctype html><title>Review isolado</title>'))
await vite.listen()
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
try {
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__review`)
  const result = await page.evaluate(async () => {
    const { selectFeaturedRated } = await import('/src/features/vod/ratedSelection.ts')
    const { recentlyAddedBy } = await import('/src/features/vod/vodShowcase.ts')
    const { CatalogDb } = await import('/src/lib/catalog/db.ts')
    const { saveTmdbKey, getTmdbStatus } = await import('/src/lib/metadata/tmdbKeyRepository.ts')
    const { loadTipPool } = await import('/src/lib/metadata/tmdbDiscovery.ts')
    const { tmdbGet } = await import('/src/lib/metadata/tmdbConnector.ts')
    const now = Date.now(), year = new Date().getFullYear()
    const records = Array.from({ length: 43000 }, (_, n) => ({ id: String(n), name: `Filme ${n} (${year - n % 8})`,
      year: year - n % 8, rating: 6 + (n % 39) / 10, addedAt: now - n * 1000 }))
    const read = { id: e => e.id, name: e => e.name, year: e => e.year, rating: e => e.rating, addedAt: e => e.addedAt }
    const algorithm = []
    for (const eligibleFraction of [1, 0.2]) for (let n = 0; n < 5; n++) {
      const inputs = eligibleFraction === 1 ? records : records.map((record, index) => ({ ...record, rating: index % 5 === 0 ? record.rating : 5 }))
      let start = performance.now()
      const rated = selectFeaturedRated(inputs, read, { now, seed: 'review' })
      const ratedMs = performance.now() - start
      start = performance.now()
      const added = recentlyAddedBy(inputs, e => e.addedAt)
      algorithm.push({ eligibleFraction, ratedMs, addedMs: performance.now() - start, eligible: rated.eligibleCount, ratedCards: rated.picked.length, addedCards: added.length })
    }
    const database = new CatalogDb('review-micro')
    await saveTmdbKey('0123456789abcdef0123456789abcdef', { database, fetchImpl: async () => Response.json({ success: true }) })
    const calls = []
    const pool = await loadTipPool('movie', { database, fetchImpl: async url => {
      const n = Number(new URL(url).searchParams.get('page')); calls.push(n)
      if (n === 2) return Response.json({}, { status: 429, headers: { 'Retry-After': '60' } })
      return Response.json({ results: [{ id: n, title: `Filme ${n}`, release_date: `${year}-01-01`, vote_average: 8, vote_count: 900, popularity: 50 }] })
    } })
    let finished = false
    let gotSignal = false
    void tmdbGet('/trending/movie/week', {}, { key: '0123456789abcdef0123456789abcdef', format: 'v3' },
      async (_url, init) => { gotSignal = !!init.signal; return new Promise(() => {}) }).finally(() => { finished = true })
    await new Promise(resolve => setTimeout(resolve, 3000))
    const { state } = await getTmdbStatus({ database })
    const cache = await database.discoveryCache.count()
    await database.delete()
    return { cpuThrottle: 4, items: records.length, algorithm, partial429: { requestedPages: calls, state, poolStatus: pool.status, cachedRows: cache },
      hangingRequest: { observedMs: 3000, finished, gotSignal } }
  })
  console.log(JSON.stringify(result, null, 2))
  await mkdir('bench-results/review-screen-perf', { recursive: true })
  await writeFile('bench-results/review-screen-perf/queries.json', JSON.stringify(result, null, 2))
} finally {
  await context.close(); await browser.close(); await vite.close()
}
