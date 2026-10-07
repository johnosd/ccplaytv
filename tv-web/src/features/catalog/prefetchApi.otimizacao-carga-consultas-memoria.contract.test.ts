import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { createPrefetchInvalidator } from './prefetchApi'

afterEach(() => vi.useRealTimers())

it('FR-004/FR-005 US2-AC2: conclusão de filmes atualiza filmes sem reler séries ou outra lista', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const watches = [
    { source: 'fonte', kind: 'movie', fetch: vi.fn(async () => ({ entries: ['novo'] })) },
    { source: 'fonte', kind: 'series', fetch: vi.fn(async () => ({ entries: [] })) },
    { source: 'outra', kind: 'movie', fetch: vi.fn(async () => ({ entries: [] })) },
  ]
  const unsubs = watches.map((watch) => {
    const key = ['catalog-search-index', watch.source, watch.kind]
    client.setQueryData(key, { entries: [] })
    return new QueryObserver(client, { queryKey: key, queryFn: watch.fetch, staleTime: Infinity }).subscribe(() => {})
  })
  const invalidator = createPrefetchInvalidator(client, 10)
  try {
    invalidator.categoryDone('fonte', 7, 'movie')
    invalidator.categoryDone('fonte', 8, 'movie')
    await vi.advanceTimersByTimeAsync(10)
    expect(watches[0].fetch).toHaveBeenCalledTimes(1)
    expect(watches[1].fetch).not.toHaveBeenCalled()
    expect(watches[2].fetch).not.toHaveBeenCalled()
  } finally {
    invalidator.dispose()
    for (const unsubscribe of unsubs) unsubscribe()
    client.clear()
  }
})
