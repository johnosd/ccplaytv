import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { ALL_PAGES_REFETCH_MAX, createPrefetchInvalidator } from './prefetchApi'

/**
 * "Todos" aos poucos (feature 039) × pré-carga: reler uma consulta infinita
 * relê todas as páginas lidas. Com muitas páginas, cada lote da pré-carga só
 * marca a consulta como velha; com poucas (o "Todos" ainda vazio esperando a
 * pré-carga), relê na hora.
 */

afterEach(() => {
  vi.useRealTimers()
})

function seedPages(client: QueryClient, kind: string, pages: number, queryFn: () => Promise<unknown>) {
  const key = ['catalog-all-pages', 'fonte', kind]
  client.setQueryData(key, { pages: Array.from({ length: pages }, () => ({ items: [] })), pageParams: [] })
  // Observador ativo, como a tela aberta em "Todos".
  const observer = new QueryObserver(client, { queryKey: key, queryFn, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  return { key, unsubscribe }
}

describe('createPrefetchInvalidator × "Todos" aos poucos', () => {
  it('com muitas páginas lidas: marca como velha sem reler; com poucas: relê', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const manyFetch = vi.fn(async () => ({ pages: [], pageParams: [] }))
    const fewFetch = vi.fn(async () => ({ pages: [], pageParams: [] }))
    const many = seedPages(client, 'movie', ALL_PAGES_REFETCH_MAX + 28, manyFetch)
    const few = seedPages(client, 'series', ALL_PAGES_REFETCH_MAX, fewFetch)

    const invalidator = createPrefetchInvalidator(client, 10)
    invalidator.categoryDone('fonte', 1)
    await vi.advanceTimersByTimeAsync(10)

    expect(manyFetch).not.toHaveBeenCalled()
    expect(client.getQueryState(many.key)?.isInvalidated).toBe(true)
    expect(fewFetch).toHaveBeenCalledTimes(1)

    invalidator.dispose()
    many.unsubscribe()
    few.unsubscribe()
    client.clear()
  })
})
