/** Feature 065: adapter exclusivo da entrada de benchmark; nunca importado por main.tsx. */
import type { QueryClient } from '@tanstack/react-query'
import { db } from '../lib/catalog/db'
import { getActiveCategoryBlock, listCategories, storeCategoryItems } from '../lib/catalog/catalogRepository'
import { blockRecords } from '../lib/catalog/categoryBlocks'
import { createActivityGate } from '../lib/catalog/prefetch/activityGate'
import { createPrefetchScheduler } from '../lib/catalog/prefetch/prefetchScheduler'
import { createPrefetchInvalidator } from '../features/catalog/prefetchApi'
import { selectFeaturedRated } from '../features/vod/ratedSelection'
import { categoryEventItems } from './screenFixtureEvents'
import { markCompleted } from '../lib/catalog/userStateRepository'

export interface ScreenControl {
  initialize(): Promise<void>
  pending(): number
  cacheCounts(): { queries: number; indexEntries: number; pageItems: number; categoryItems: number }
  coldMovieIndex(sourceId: string): void
  categories(sourceId: string): Promise<{ count: number; items: number }>
  eventProgress(): number
  events(sourceId: string, fixtureClock: number): Promise<{ events: Array<{ categoryId: number; at: number }>; publishedAt: number }>
  selection(sourceId: string, now: number): Promise<{ ms: number; ids: number[]; eligibleCount: number }>
  episodeChange(sourceId: string): Promise<void>
  summary(sourceId: string): Array<{ seriesId: string; known: number; watched: number; upToDate: boolean }>
}

declare global { interface Window { __screenControl?: ScreenControl } }

export function installScreenControl(client: QueryClient): void {
  if (location.hostname !== '127.0.0.1') throw new Error('benchmark exige loopback')
  let liveEvents: Array<{ categoryId: number; at: number }> = []
  window.__screenControl = {
    eventProgress: () => liveEvents.length,
    initialize: async () => { await db.open() },
    episodeChange: sourceId => markCompleted(`${sourceId}|episode|id:1-2|s1|e2`, sourceId),
    summary(sourceId) {
      const summaries = client.getQueryData<Map<string, { known: number; watched: number; upToDate: boolean }>>(['series-watched-summary', sourceId])
      return [...(summaries ?? [])].map(([seriesId, value]) => ({ seriesId, ...value })).sort((a, b) => Number(a.seriesId) - Number(b.seriesId))
    },
    pending: () => client.getQueryCache().getAll().filter(q => q.getObserversCount() > 0 && q.state.fetchStatus === 'fetching').length,
    cacheCounts() {
      let indexEntries = 0, pageItems = 0, categoryItems = 0
      const queries = client.getQueryCache().getAll()
      for (const query of queries) {
        const data = query.state.data as { items?: unknown[]; entries?: unknown[]; pages?: Array<{ items?: unknown[] }> } | undefined
        indexEntries += data?.entries?.length ?? 0
        pageItems += data?.pages?.reduce((sum, page) => sum + (page.items?.length ?? 0), 0) ?? 0
        if (query.queryKey[0] === 'category-content') categoryItems += data?.items?.length ?? 0
      }
      return { queries: queries.length, indexEntries, pageItems, categoryItems }
    },
    coldMovieIndex(sourceId) {
      client.removeQueries({ queryKey: ['catalog-search-index', sourceId, 'movie'] })
    },
    async categories(sourceId) {
      const categories = await listCategories(sourceId)
      return { count: categories.length, items: categories.reduce((n, c) => n + c.count, 0) }
    },
    async events(sourceId, fixtureClock) {
      const selected = (await listCategories(sourceId, 'movie')).slice(0, 3)
      const completed = new Set<number>()
      const events: Array<{ categoryId: number; at: number }> = []
      liveEvents = events
      const invalidator = createPrefetchInvalidator(client)
      let publishedAt = 0
      const unsubscribe = client.getQueryCache().subscribe(event => {
        if (event.type === 'updated' && event.action.type === 'success' && event.query.getObserversCount() > 0 && event.query.queryKey.includes(sourceId)) publishedAt = performance.now()
      })
      const started = performance.now()
      let finish: (() => void) | undefined
      const done = new Promise<void>(resolve => { finish = resolve })
      const scheduler = createPrefetchScheduler({
        gate: createActivityGate(), idleAfterKeyMs: 0, gapMs: 0,
        loadCategories: async () => selected.map(c => ({ id: c.id!, kind: c.kind, order: c.order,
          fetchMode: 'on_demand', itemsFetchedAt: completed.has(c.id!) ? Date.now() : undefined })),
        async runCategory(_source, categoryId) {
          // Aquisição simulada; publicação no repositório canônico e callback reais.
          const due = started + (events.length + 1) * 1000
          await new Promise(resolve => setTimeout(resolve, Math.max(0, due - performance.now())))
          const category = selected.find(c => c.id === categoryId)!
          const block = await getActiveCategoryBlock(sourceId, categoryId)
          if (!block) return 'failed'
          const items = blockRecords(block)
          items.push(...categoryEventItems({ id: categoryId, order: category.order, generation: block.generation }, sourceId, fixtureClock))
          await storeCategoryItems({ sourceId, generation: 1, kind: 'movie', categoryId, groupOrder: category.order }, items, Date.now())
          completed.add(categoryId)
          return 'done'
        },
        onCategoryDone(_source, categoryId) {
          events.push({ categoryId, at: performance.now() })
          invalidator.categoryDone(sourceId, categoryId, 'movie')
          if (events.length === selected.length) finish?.()
        },
      })
      try {
        scheduler.start(sourceId)
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([done, new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('conclusões sintéticas não terminaram')), 120000)
          })])
        } finally { if (timer !== undefined) clearTimeout(timer) }
        // O batch real de 1 s precisa publicar depois da terceira conclusão.
        await new Promise(resolve => setTimeout(resolve, 2100))
        while (client.getQueryCache().getAll().some(q => q.getObserversCount() > 0 && q.state.fetchStatus === 'fetching')) await new Promise(resolve => setTimeout(resolve, 20))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return { events, publishedAt }
      } finally {
        scheduler.stop()
        invalidator.dispose()
        unsubscribe()
      }
    },
    async selection(sourceId, now) {
      const categories = await listCategories(sourceId, 'movie')
      const records = []
      for (const category of categories) {
        const block = await getActiveCategoryBlock(sourceId, category.id!)
        if (block) records.push(...blockRecords(block))
      }
      const started = performance.now()
      const result = selectFeaturedRated(records, { id: i => String(i.id), name: i => i.name,
        rating: i => i.providerRating, year: i => i.year, addedAt: i => i.addedAt },
      { now, seed: '2026-10-07|movie|screen-065-a' })
      return { ms: performance.now() - started, ids: result.picked.map(i => i.id!), eligibleCount: result.eligibleCount }
    },
  }
}
