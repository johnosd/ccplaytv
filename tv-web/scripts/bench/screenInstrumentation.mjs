// Instrumentação de observação: contadores agregados, nunca URLs/payloads/erros de fetch.
export async function instrument(page, clock) {
  await page.addInitScript(({ clock }) => {
    const OriginalDate = Date
    const bootAt = performance.now()
    class FixedDate extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [clock + performance.now() - bootAt])) }
      static now() { return Math.floor(clock + performance.now() - bootAt) }
    }
    window.Date = FixedDate
    const state = window.__screenMetrics = { long: [], reads: {}, marker: null, started: 0, actionAt: null, directions: [] }
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) state.long.push({ at: entry.startTime, ms: entry.duration })
    }).observe({ type: 'longtask', buffered: true })
    for (const event of ['click', 'keydown']) document.addEventListener(event, e => {
      if (state.started && state.actionAt === null) state.actionAt = performance.now()
      if (event === 'keydown' && e.key.startsWith('Arrow')) {
        const at = performance.now()
        requestAnimationFrame(() => requestAnimationFrame(() => state.directions.push(performance.now() - at)))
      }
    }, true)
    for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const operation of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count']) {
        const original = prototype[operation]
        if (!original) continue
        prototype[operation] = function (...args) {
          const request = original.apply(this, args)
          const store = this.objectStore?.name || this.name
          request.addEventListener('success', () => {
            const result = request.result
            const values = result == null ? [] : Array.isArray(result) ? result : result.value ? [result.value] : [result]
            const seen = new Set()
            for (const value of values) {
              const kind = ['movie', 'series', 'channel', 'episode'].includes(value?.kind) ? value.kind : 'other'
              const source = /^screen-065-[abc]$/.test(value?.sourceId) ? value.sourceId.slice(-1) : 'other'
              const key = `${store}:${operation}:${kind}:${source}`
              const row = state.reads[key] ??= { store, operation, kind, source, calls: 0, records: 0, items: 0 }
              if (!seen.has(key)) { row.calls++; seen.add(key) }
              row.records++
              row.items += value?.items?.length ?? 0
            }
          })
          return request
        }
      }
    }
  }, { clock })
}

export async function settle(page, milliseconds = 300) {
  await page.waitForFunction(() => !window.__screenControl || window.__screenControl.pending() === 0, null, { timeout: 30000 })
  await page.waitForTimeout(milliseconds)
}

export async function heap(page, cdp) {
  await settle(page)
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  return { retainedBytes: usedSize, cache: await page.evaluate(() => window.__screenControl?.cacheCounts() ?? null) }
}

export async function snapshot(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.content-card, .home-card')].map(card => ({
      id: card.getAttribute('data-item-id'),
      title: card.querySelector('.content-card-title, .home-card-title')?.textContent?.trim(),
      meta: card.querySelector('.content-card-meta')?.textContent?.trim() ?? '',
      rank: card.querySelector('.content-card-rank')?.textContent?.trim() ?? '',
    }))
    const focus = document.querySelector('.tv-focus')
    return { cards, source: document.querySelector('.topbar-profile-name')?.textContent?.trim() ?? null,
      hero: document.querySelector('.home-hero-title')?.textContent?.trim() ?? null,
      focus: focus?.getAttribute('aria-label') ?? focus?.textContent?.trim() ?? '',
      scroll: [...document.querySelectorAll('[class*="scroll"], .vod-grid')].map(e => ({ top: e.scrollTop, left: e.scrollLeft })) }
  })
}

export async function measure(page, name, action, selector, titlePrefix) {
  console.log(`  etapa ${name}`)
  await page.evaluate(({ selector, titlePrefix }) => {
    const state = window.__screenMetrics
    state.long = []; state.reads = {}; state.directions = []; state.marker = null; state.actionAt = null; state.started = performance.now()
    state.observer?.disconnect()
    const ready = () => {
      const content = selector ? document.querySelector(selector) : null
      const titles = [...document.querySelectorAll('.content-card-title, .home-card-title')]
      if (!content || !document.querySelector('.tv-focus') || (titlePrefix && !titles.some(t => t.textContent.startsWith(titlePrefix)))) return
      requestAnimationFrame(() => requestAnimationFrame(() => { state.marker ??= performance.now() }))
    }
    state.observer = new MutationObserver(ready)
    state.observer.observe(document, { subtree: true, childList: true, attributes: true })
    state.checkReady = ready
  }, { selector, titlePrefix })
  const before = performance.now()
  try { await action() } catch (error) { error.benchStage = name; throw error }
  await page.evaluate(() => window.__screenMetrics.checkReady())
  if (selector) await page.waitForFunction(() => window.__screenMetrics.marker !== null, null, { timeout: 30000 })
  await settle(page)
  const sample = await page.evaluate(() => {
    const state = window.__screenMetrics
    state.observer.disconnect()
    return { elapsedMs: performance.now() - state.started,
      browserStartMs: state.started,
      usefulMs: state.marker === null ? null : state.marker - (state.actionAt ?? state.started),
      automationBeforeActionMs: state.actionAt === null ? null : state.actionAt - state.started,
      maxLongTaskMs: Math.max(0, ...state.long.map(t => t.ms)),
      longTaskTotalMs: state.long.reduce((sum, t) => sum + t.ms, 0),
      longTaskSamples: state.long.map(t => ({ offsetMs: t.at - state.started, ms: t.ms })),
      reads: Object.values(state.reads), directionSamplesMs: state.directions }
  })
  return { name, ...sample, actionRpcMs: performance.now() - before,
    cacheAtEnd: await page.evaluate(() => window.__screenControl?.cacheCounts() ?? null), equivalent: await snapshot(page) }
}

export async function startup(page, url, withList) {
  const started = performance.now()
  await page.goto(url)
  await page.waitForSelector(withList ? '.source-card.tv-focus' : '.add-card.tv-focus', { timeout: 30000 })
  return page.evaluate(({ elapsed }) => ({
    elapsedProxyMs: elapsed,
    usefulMs: performance.now(),
    jsBytes: performance.getEntriesByType('resource').filter(r => /\.js(?:\?|$)/.test(r.name)).reduce((sum, r) => sum + r.decodedBodySize, 0),
    focusReady: Boolean(document.querySelector('.tv-focus')),
  }), { elapsed: performance.now() - started })
}
