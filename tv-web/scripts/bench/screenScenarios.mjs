import { instrument, measure as observe, heap, settle, snapshot, startup } from './screenInstrumentation.mjs'
import { seed, routes } from './screenRuntime.mjs'
import { CLOCK, SOURCE_IDS } from './screenFixtures.mjs'

const HOME = '.home-content .home-card'
const VOD = '.vod-showcase .content-card'
const GRID = '.vod-grid .content-card'
// O handle devolvido por `waitForSelector` fica vivo no CDP e segura a árvore da tela depois de desmontada (065, T054).
const waitFor = async (page, selector, options) => (await page.waitForSelector(selector, options))?.dispose()
const nav = (page, index) => page.locator('.topbar-nav button').nth(index).click()

async function goHome(page) { await nav(page, 0); await waitFor(page, HOME); await settle(page, 0) }
async function goKind(page, index, prefix) {
  await nav(page, index)
  await page.waitForFunction(prefix => [...document.querySelectorAll('.vod-showcase .content-card-title')].some(e => e.textContent.startsWith(prefix)), prefix)
  await settle(page, 0)
}
async function category(page, kind = 'movie') {
  await page.locator('.side-category-nav-item').filter({ hasText: `Categoria ${kind} 0` }).first().click()
  await waitFor(page, GRID)
  await settle(page, 0)
}
async function returnToShowcase(page) { await page.keyboard.press('Escape'); await waitFor(page, VOD); await settle(page, 0) }

export async function runScenario(browser, runtime, config, rows, cpu, run) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage()
  const errors = []
  let workersCreated = 0
  page.on('worker', () => { workersCreated++ })
  page.on('pageerror', error => errors.push(error.name))
  const api = await routes(page, runtime.origin, config.fixture)
  const measure = async (...args) => {
    const count = api.length
    return { ...await observe(...args), requests: api.slice(count) }
  }
  await instrument(page, CLOCK)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  const prepare = async () => {
    // Preparo fora de todos os intervalos de tela: CPU1 reduz apenas o tempo do seed.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    try { return { ...await seed(page, rows), cpu: 1 } }
    finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }) }
  }
  const appUrl = `${runtime.origin}/app/index.html`, controlUrl = `${runtime.origin}/control/index.html`
  const sample = { configuration: config.id, run, kind: config.kind, steps: [], api, errors, startup: [] }
  try {
    // Entrada NORMAL é a única fonte dos tempos/bytes de abertura.
    if (config.id === 'screens-local-100-images') {
      sample.startup.push({ lists: false, cache: 'cold', ...await startup(page, appUrl, false) })
      sample.startup.push({ lists: false, cache: 'warm', ...await startup(page, appUrl, false) })
      sample.preparation = await prepare()
      sample.startup.push({ lists: true, cache: 'cold', ...await startup(page, appUrl, true) })
      sample.startup.push({ lists: true, cache: 'warm', ...await startup(page, appUrl, true) })
      sample.firstInteraction = await measure(page, 'normal-first-command', () => page.keyboard.press('ArrowRight'), '.add-card.tv-focus')
      await page.keyboard.press('ArrowLeft')
      await waitFor(page, '.source-card.tv-focus')
      sample.normalNavigation = [
        await measure(page, 'normal-first-home', () => page.locator('.source-card').filter({ hasText: 'Sintético A' }).click(), HOME),
        await measure(page, 'normal-first-movies', () => nav(page, 2), VOD, 'Filme'),
        await measure(page, 'normal-first-series', () => nav(page, 3), VOD, 'Série'),
        await measure(page, 'normal-first-category', () => category(page, 'series'), GRID, 'Série'),
      ]
    } else {
      await page.goto(controlUrl)
      await page.waitForFunction(() => Boolean(window.__screenControl))
      await page.evaluate(() => window.__screenControl.initialize())
      sample.preparation = await prepare()
    }
    await page.goto(controlUrl)
    await waitFor(page, '.source-card.tv-focus')
    await page.waitForFunction(() => Boolean(window.__screenControl))
    sample.storageBefore = await page.evaluate(async () => {
      const estimate = await navigator.storage.estimate()
      return { usageBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0 }
    })
    sample.before = await heap(page, cdp)
    sample.steps.push(await measure(page, 'home-cold', () => page.locator('.source-card').filter({ hasText: 'Sintético A' }).click(), HOME))
    sample.steps.push(await measure(page, 'movies-after-home', () => nav(page, 2), VOD, 'Filme'))
    sample.steps.push(await measure(page, 'series-after-home', () => nav(page, 3), VOD, 'Série'))
    sample.afterScreens = await heap(page, cdp)
    sample.steps.push(await measure(page, 'home-return', () => nav(page, 0), HOME))
    await page.evaluate(source => window.__screenControl.coldMovieIndex(source), SOURCE_IDS[0])
    sample.steps.push(await measure(page, 'movies-index-cold', () => nav(page, 2), VOD, 'Filme'))
    sample.selection = await page.evaluate(({ source, now }) => window.__screenControl.selection(source, now), { source: SOURCE_IDS[0], now: CLOCK })
    if (config.kind === 'screens') {
      let eventData
      const events = await measure(page, 'categories-three', async () => {
        const running = page.evaluate(({ source, now }) => window.__screenControl.events(source, now), { source: SOURCE_IDS[0], now: CLOCK }).then(value => { eventData = value })
        await page.waitForFunction(() => window.__screenControl.eventProgress() >= 1)
        for (let key = 0; key < 12; key++) {
          await page.keyboard.press(key % 2 ? 'ArrowLeft' : 'ArrowRight')
          await page.waitForTimeout(350)
        }
        await running
      }, null)
      const last = eventData.events.at(-1)?.at
      const firstOffset = eventData.events[0].at - events.browserStartMs
      const duringUpdates = events.longTaskSamples.filter(t => t.offsetMs + t.ms >= firstOffset)
      events.longTaskTotalMs = duringUpdates.reduce((sum, t) => sum + t.ms, 0)
      events.maxLongTaskMs = Math.max(0, ...duringUpdates.map(t => t.ms))
      events.observationAfterLastMs = events.browserStartMs + events.elapsedMs - last
      events.scheduledIntervalMs = 1000
      events.completions = eventData.events.map((event, index) => ({ categoryId: event.categoryId, offsetMs: event.at - eventData.events[0].at, index }))
      events.propagationProxyMs = last !== undefined && eventData.publishedAt >= last ? eventData.publishedAt - last : null
      sample.steps.push(events)
      sample.steps.push(await measure(page, 'movie-category-cold', () => category(page), GRID, 'Filme'))
      sample.categoryMemory = await heap(page, cdp)
    } else if (config.kind === 'category') {
      await page.evaluate(() => { window.__screenMetrics.reads = {}; window.__screenMetrics.long = [] })
      await cdp.send('HeapProfiler.collectGarbage')
      const before = await cdp.send('Runtime.getHeapUsage')
      let peakBytes = before.usedSize
      let sampling = false
      const sampler = setInterval(async () => {
        if (sampling) return
        sampling = true
        try { peakBytes = Math.max(peakBytes, (await cdp.send('Runtime.getHeapUsage')).usedSize) } catch { /* fechamento do contexto */ } finally { sampling = false }
      }, 100)
      try { sample.steps.push(await measure(page, 'category-first', () => category(page), GRID, 'Filme')) }
      finally { clearInterval(sampler) }
      sample.temporaryHeapBytes = Math.max(0, peakBytes - before.usedSize)
      await page.locator('.vod-grid').evaluate(element => { element.scrollTop = element.scrollHeight })
      await settle(page)
      await page.waitForFunction(() => [...document.querySelectorAll('.content-card-title')].some(e => e.textContent.startsWith('Filme 29999')), null, { timeout: 30000 })
      sample.lastItem = await snapshot(page)
      // Busca e ordenação reais; não limitar equivalência à primeira página.
      await page.keyboard.press('ArrowUp')
      await waitFor(page, '.vod-toolbar-search-button.tv-focus')
      await page.keyboard.press('Enter')
      await page.locator('input.search-field').fill('Filme 29999')
      await page.waitForFunction(() => {
        const cards = document.querySelectorAll('.vod-grid .content-card-title')
        return cards.length === 1 && cards[0].textContent.startsWith('Filme 29999')
      })
      await settle(page)
      sample.searchLastItem = await snapshot(page)
      await page.keyboard.press('ArrowDown')
      await waitFor(page, '.vod-grid .tv-focus')
      sample.detailBefore = await snapshot(page)
      await page.keyboard.press('Enter')
      await waitFor(page, '.vod-detail--movie')
      await settle(page)
      await page.keyboard.press('Escape')
      await waitFor(page, GRID)
      await settle(page)
      sample.detailReturned = await snapshot(page)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await settle(page)
      await page.keyboard.press('ArrowRight')
      await waitFor(page, '.vod-toolbar-sort-button.tv-focus')
      await page.keyboard.press('Enter')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await settle(page)
      sample.sorted = await snapshot(page)
      await page.keyboard.press('Escape')
      if (await page.locator('.vod-grid').count()) await page.keyboard.press('Escape')
      await waitFor(page, VOD)
      await category(page)
      sample.returned = await snapshot(page)
      sample.categoryMemory = await heap(page, cdp)
    } else if (config.kind === 'episodes') {
      await goKind(page, 3, 'Série')
      sample.steps.push(await measure(page, 'series-summary-first', () => category(page, 'series'), GRID, 'Série'))
      sample.summariesBefore = await page.evaluate(source => window.__screenControl.summary(source), SOURCE_IDS[0])
      await returnToShowcase(page)
      sample.steps.push(await measure(page, 'series-summary-reentry', () => category(page, 'series'), GRID, 'Série'))
      await returnToShowcase(page)
      await page.evaluate(source => window.__screenControl.episodeChange(source), SOURCE_IDS[0])
      sample.steps.push(await measure(page, 'series-summary-delta', () => category(page, 'series'), GRID, 'Série'))
      sample.summariesAfter = await page.evaluate(source => window.__screenControl.summary(source), SOURCE_IDS[0])
    } else if (config.kind === 'cycles') {
      async function visit() {
        await goHome(page); await goKind(page, 2, 'Filme'); await goKind(page, 3, 'Série')
        await category(page, 'series'); await nav(page, 0); await waitFor(page, HOME); await settle(page, 0)
      }
      async function pick(list) {
        await page.locator('.topbar-profile').click()
        await waitFor(page, '.source-card')
        await page.locator('.source-card').filter({ hasText: `Sintético ${String.fromCharCode(65 + list)}` }).click()
        await waitFor(page, HOME); await settle(page, 0)
      }
      for (let list = 0; list < 3; list++) { console.log(`  aquecimento lista ${list + 1}/3`); await pick(list); await visit() }
      await pick(0)
      sample.navigationCycles = []
      sample.listCycles = []
      for (let cycle = 1; cycle <= 10; cycle++) {
        console.log(`  navegação ciclo ${cycle}/10`)
        await visit()
        sample.navigationCycles.push({ cycle, ...await heap(page, cdp) })
      }
      for (let cycle = 1; cycle <= 10; cycle++) {
        console.log(`  alternância ciclo ${cycle}/10`)
        for (const list of [1, 2, 0]) { await pick(list); await visit() }
        sample.listCycles.push({ cycle, ...await heap(page, cdp) })
      }
      sample.afterCycles = await snapshot(page)
    }
    sample.storageAfter = await page.evaluate(async () => ({ usageBytes: (await navigator.storage.estimate()).usage ?? 0 }))
    sample.workers = { created: workersCreated, heapBytes: workersCreated === 0 ? 0 : null }
    if (errors.length) throw new Error('erro de execução no app observado')
    return sample
  } finally { await context.close() }
}
