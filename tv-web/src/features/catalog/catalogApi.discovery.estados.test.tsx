import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDailyTip, useSaveTmdbKey, useWeeklyTop10 } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { resetAppLanguageForTests, writeAppLanguage } from '../../lib/i18n/appLanguage'
import { removeTmdbKey, RATE_LIMIT_PAUSE_MS } from '../../lib/metadata/tmdbKeyRepository'
import { weekKey, type DiscoveryTitle } from '../../lib/metadata/tmdbDiscovery'

/**
 * Estados de borda das fileiras do TMDB (feature 057, US4): sem chave, chave recusada, limite de uso, sem rede com e sem cache,
 * troca de lista, de idioma e remoção da chave. Os hooks reais contra `fake-indexeddb`; a rede é sempre simulada.
 */

const A = 'source-estados-057-a'
const B = 'source-estados-057-b'
const KEY = '0123456789abcdef0123456789abcdef'
const YEAR = new Date().getFullYear()

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const wrapperOf = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

const tmdb = (rank: number, name: string): DiscoveryTitle => ({
  tmdbId: 9000 + rank,
  kind: 'movie',
  title: name,
  year: YEAR - 1,
  voteAverage: 8,
  voteCount: 1000,
  popularity: 50,
  rank,
})

const TITLES = [tmdb(1, 'Alfa'), tmdb(2, 'Beta'), tmdb(3, 'Gama')]

async function putKey(over: { state?: 'connected' | 'refused' | 'offline' | 'rate_limited'; pausedUntil?: number } = {}) {
  await db.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: over.state ?? 'connected', lastTestedAt: 0, pausedUntil: over.pausedUntil })
}

async function putTrending(titles: DiscoveryTitle[], language: 'pt' | 'en' = 'pt', periodKey = weekKey(Date.now())) {
  await db.discoveryCache.put({ id: `trending:movie:${language}`, source: 'trending', kind: 'movie', language, periodKey, fetchedAt: Date.now(), titles })
}

const record = (sourceId: string, name: string, index: number): CatalogRecord => ({
  sourceId,
  generation: 1,
  kind: 'movie',
  name,
  originalName: name,
  groupOrder: 0,
  addedAt: index,
  year: YEAR - 1,
  providerStreamId: `${sourceId}-${index}`,
})

async function seedList(sourceId: string, names: string[]) {
  await db.sources.put({ id: sourceId, type: 'provider_credentials', displayName: sourceId, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  const [categoryId] = await storeCategories([{ sourceId, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Cat', order: 0, providerCategoryId: '1' }])
  await renewCategoryItems({ sourceId, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, names.map((name, i) => record(sourceId, name, i)), 1)
}

const trendingResponse = (names: string[]) =>
  new Response(JSON.stringify({ results: names.map((name, i) => ({ id: 100 + i, title: name, release_date: `${YEAR - 1}-01-01`, vote_average: 8, vote_count: 900, popularity: 10 })) }), { status: 200 })

// `writeAppLanguage` grava no `localStorage`: sem limpar, o idioma "en" de um teste vaza para o seguinte.
function resetLanguage() {
  try {
    window.localStorage.clear()
  } catch {
    // armazenamento indisponível: o teste segue com o idioma de sessão descartado
  }
  resetAppLanguageForTests()
}

beforeEach(async () => {
  resetLanguage()
  await db.integrations.clear()
  await db.discoveryCache.clear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  resetLanguage()
  await db.integrations.clear()
  await db.discoveryCache.clear()
  for (const id of [A, B]) {
    await db.sources.delete(id)
    await db.categories.where('sourceId').equals(id).delete()
    await db.categoryBlocks.where('[sourceId+generation+kind]').between([id, 0, ''], [id, 99, '￿']).delete()
  }
})

describe('Top 10 / Dica — estados de borda (feature 057, US4)', () => {
  it('chave recusada ou em pausa por limite de uso: nenhuma requisição, e o último ranking guardado ainda vale', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await seedList(A, ['Alfa', 'Beta', 'Gama'])
    await putTrending(TITLES, 'pt', '2000-W01') // de outra semana: vencido

    await putKey({ state: 'refused' })
    const refused = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(refused.result.current.data?.length).toBe(3))

    await putKey({ state: 'rate_limited', pausedUntil: Date.now() + RATE_LIMIT_PAUSE_MS })
    const paused = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(paused.result.current.data?.length).toBe(3))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sem rede: com cache de outra semana usa o último; sem cache a fileira some, sem erro e sem prender nada', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await seedList(A, ['Alfa', 'Beta', 'Gama'])
    await putKey()

    const empty = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(empty.result.current.data).toEqual([]))
    expect(empty.result.current.isLoading).toBe(false)

    await db.integrations.update('tmdb', { state: 'connected', pausedUntil: undefined })
    await putTrending(TITLES, 'pt', '2000-W01')
    const stale = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(stale.result.current.data?.length).toBe(3))
  })

  it('sem rede a Dica também some sem cache e usa o último conjunto guardado, sorteando com a semente de hoje', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const names = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco']
    await seedList(A, names)
    await putKey()
    const none = renderHook(() => useDailyTip(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(none.result.current.data).toEqual([]))

    await db.integrations.update('tmdb', { state: 'connected', pausedUntil: undefined })
    await db.discoveryCache.put({
      id: 'pool:movie:pt',
      source: 'pool',
      kind: 'movie',
      language: 'pt',
      periodKey: '2000-01-01', // outro dia
      fetchedAt: 0,
      titles: names.map((name, i) => tmdb(i + 1, name)),
    })
    const stale = renderHook(() => useDailyTip(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(stale.result.current.data?.length).toBe(5))
  })

  it('trocar a lista ativa recalcula o cruzamento sem nova consulta ao TMDB (o ranking não é da lista)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await seedList(A, ['Alfa', 'Beta', 'Gama'])
    await seedList(B, ['Beta', 'Gama', 'Delta']) // 2 cruzados: abaixo do mínimo de 3
    await putKey()
    await putTrending([...TITLES, tmdb(4, 'Delta')])

    const { result, rerender } = renderHook(({ source }) => useWeeklyTop10(source, 'movie'), { wrapper: wrapperOf(client()), initialProps: { source: A } })
    await waitFor(() => expect(result.current.data?.map((p) => p.rank)).toEqual([1, 2, 3]))
    rerender({ source: B })
    await waitFor(() => expect(result.current.data?.map((p) => p.rank)).toEqual([2, 3, 4]))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('trocar o idioma do app refaz a consulta no idioma novo; o cache do idioma anterior segue guardado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => trendingResponse(['Alfa', 'Beta', 'Gama']))
    await seedList(A, ['Alfa', 'Beta', 'Gama'])
    await putKey()
    await putTrending(TITLES, 'pt')

    const { result } = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(result.current.data?.length).toBe(3))
    expect(fetchSpy).not.toHaveBeenCalled() // pt: o cache da semana vale

    act(() => {
      writeAppLanguage('en')
    })
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(String(fetchSpy.mock.calls[0][0])).toContain('language=en-US')
    await waitFor(() => expect(db.discoveryCache.get('trending:movie:en')).resolves.toBeDefined())
    expect(await db.discoveryCache.get('trending:movie:pt')).toBeDefined()
  })

  it('salvar a chave em Integrações faz as fileiras aparecerem sem esperar o "sem chave" vencer na memória', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/authentication') ? new Response(JSON.stringify({ success: true }), { status: 200 }) : trendingResponse(['Alfa', 'Beta', 'Gama']),
    )
    await seedList(A, ['Alfa', 'Beta', 'Gama'])
    const queryClient = client()
    const { result } = renderHook(() => ({ top10: useWeeklyTop10(A, 'movie'), save: useSaveTmdbKey() }), { wrapper: wrapperOf(queryClient) })
    await waitFor(() => expect(result.current.top10.data).toEqual([])) // sem chave: ausente (e o resultado "no_key" fica em memória)

    await act(async () => {
      await result.current.save.mutateAsync(KEY)
    })
    await waitFor(() => expect(result.current.top10.data?.length).toBe(3))
  })

  it('remover a chave limpa o cache e, ao reabrir, as fileiras somem sem requisição', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await seedList(A, ['Alfa', 'Beta', 'Gama'])
    await putKey()
    await putTrending(TITLES)
    const first = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(first.result.current.data?.length).toBe(3))
    first.unmount()

    await removeTmdbKey()
    expect(await db.discoveryCache.count()).toBe(0)
    const reopened = renderHook(() => useWeeklyTop10(A, 'movie'), { wrapper: wrapperOf(client()) })
    await waitFor(() => expect(reopened.result.current.data).toEqual([]))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
