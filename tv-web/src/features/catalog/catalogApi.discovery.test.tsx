import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDailyTip, useWeeklyTop10 } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { weekKey, type DiscoveryTitle } from '../../lib/metadata/tmdbDiscovery'

const SOURCE_ID = 'source-descoberta-057'
const KEY = '0123456789abcdef0123456789abcdef'
const YEAR = new Date().getFullYear()

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrapperOf(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function dayOf(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function putKey() {
  await db.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: 'connected', lastTestedAt: 0 })
}

async function putCache(source: 'trending' | 'pool', kind: 'movie' | 'series', titles: DiscoveryTitle[]) {
  const now = Date.now()
  await db.discoveryCache.put({
    id: `${source}:${kind}:pt`,
    source,
    kind,
    language: 'pt',
    periodKey: source === 'trending' ? weekKey(now) : dayOf(now),
    fetchedAt: now,
    titles,
  })
}

const tmdb = (rank: number, kind: 'movie' | 'series', name: string, over: Partial<DiscoveryTitle> = {}): DiscoveryTitle => ({
  tmdbId: 7000 + rank,
  kind,
  title: name,
  year: YEAR - 1,
  voteAverage: 8,
  voteCount: 1000,
  popularity: 50,
  rank,
  ...over,
})

function recordOf(kind: 'movie' | 'series', name: string, index: number): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    kind,
    name,
    originalName: name,
    groupOrder: 0,
    addedAt: index,
    year: YEAR - 1,
    ...(kind === 'movie' ? { providerStreamId: `p${index}` } : { seriesId: `p${index}` }),
  }
}

async function seedList(kind: 'movie' | 'series', names: string[], pendingCategories = 0) {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
  const ids = await storeCategories([
    { sourceId: SOURCE_ID, generation: 1, kind, fetchMode: 'on_demand', name: 'Cat', order: 0, providerCategoryId: '1' },
    ...Array.from({ length: pendingCategories }, (_, i) => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind,
      fetchMode: 'on_demand' as const,
      name: `Pendente ${i}`,
      order: i + 1,
      providerCategoryId: String(i + 2),
    })),
  ])
  await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind, categoryId: ids[0], groupOrder: 0 }, names.map((name, i) => recordOf(kind, name, i)), 1)
  return ids
}

beforeEach(async () => {
  await db.integrations.clear()
  await db.discoveryCache.clear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.integrations.clear()
  await db.discoveryCache.clear()
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
})

describe('useWeeklyTop10 (feature 057)', () => {
  it('cruza o ranking guardado com a lista, com a posição real, a cobertura do índice e sem rede', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await putKey()
    await seedList('movie', ['Alfa', 'Beta [L]', 'Beta', 'Gama', 'Fora do ranking'], 1)
    await putCache('trending', 'movie', [
      tmdb(1, 'movie', 'Alfa'),
      tmdb(2, 'movie', 'Ausente'),
      tmdb(3, 'movie', 'Beta'),
      tmdb(4, 'movie', 'Gama'),
    ])
    const { result } = renderHook(() => useWeeklyTop10(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(result.current.data?.length).toBe(3))

    expect(result.current.data!.map((pick) => [pick.rank, pick.item.name])).toEqual([
      [1, 'Alfa'],
      [3, 'Beta'], // a principal vence a `[L]`
      [4, 'Gama'],
    ])
    expect(result.current.coveredCategories).toBe(1)
    // 061: notas já na descoberta, mapeadas pelo id do item da lista.
    for (const pick of result.current.data!) {
      expect(result.current.ratings?.get(pick.item.id)).toEqual({ average: 8, votes: 1000 })
    }
    expect(result.current.totalCategories).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('abaixo de 3 cruzados a lista é vazia', async () => {
    await putKey()
    await seedList('movie', ['Alfa', 'Beta'])
    await putCache('trending', 'movie', [tmdb(1, 'movie', 'Alfa'), tmdb(2, 'movie', 'Beta'), tmdb(3, 'movie', 'Ausente')])
    const { result } = renderHook(() => useWeeklyTop10(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('sem chave não há dado e o índice nem é lido por causa da fileira', async () => {
    await seedList('movie', ['Alfa', 'Beta', 'Gama'])
    const client = newClient()
    const { result } = renderHook(() => useWeeklyTop10(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(result.current.isLoading).toBe(false)
    // A query do índice existe (desabilitada) mas nunca buscou nada.
    const state = client.getQueryState(['catalog-search-index', SOURCE_ID, 'movie'])
    expect(state?.fetchStatus ?? 'idle').toBe('idle')
    expect(state?.dataUpdateCount ?? 0).toBe(0)
  })

  it('categoria que chega depois (índice invalidado) atualiza a fileira', async () => {
    await putKey()
    await seedList('movie', ['Alfa', 'Beta', 'Gama'], 1)
    await putCache('trending', 'movie', [
      tmdb(1, 'movie', 'Alfa'),
      tmdb(2, 'movie', 'Beta'),
      tmdb(3, 'movie', 'Gama'),
      tmdb(5, 'movie', 'Delta'),
    ])
    const client = newClient()
    const { result } = renderHook(() => useWeeklyTop10(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(result.current.data?.length).toBe(3))

    const categories = await db.categories.where('sourceId').equals(SOURCE_ID).toArray()
    const pending = categories.find((category) => category.name === 'Pendente 0')!
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: pending.id!, groupOrder: 1 }, [recordOf('movie', 'Delta', 9)], 1)
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['catalog-search-index', SOURCE_ID] })
    })
    await waitFor(() => expect(result.current.data?.map((pick) => pick.rank)).toEqual([1, 2, 3, 5]))
    expect(result.current.coveredCategories).toBe(2)
  })

  it('o resultado não é calculado na renderização: a 1ª renderização vem sem dado e a fileira aparece depois; recalcular não a apaga', async () => {
    await putKey()
    await seedList('movie', ['Alfa', 'Beta', 'Gama'], 1)
    await putCache('trending', 'movie', [tmdb(1, 'movie', 'Alfa'), tmdb(2, 'movie', 'Beta'), tmdb(3, 'movie', 'Gama'), tmdb(5, 'movie', 'Delta')])
    const client = newClient()
    const seen: Array<number | undefined> = []
    const { result } = renderHook(
      () => {
        const row = useWeeklyTop10(SOURCE_ID, 'movie')
        seen.push(row.data?.length)
        return row
      },
      { wrapper: wrapperOf(client) },
    )
    expect(seen[0]).toBeUndefined() // nada é calculado antes do primeiro desenho
    await waitFor(() => expect(result.current.data?.length).toBe(3))

    // Categoria nova chega: o índice é refeito e o cruzamento recalculado; o resultado anterior fica até o novo chegar.
    const pending = (await db.categories.where('sourceId').equals(SOURCE_ID).toArray()).find((c) => c.name === 'Pendente 0')!
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: pending.id!, groupOrder: 1 }, [recordOf('movie', 'Delta', 9)], 1)
    const firstDefined = seen.findIndex((n) => n !== undefined)
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['catalog-search-index', SOURCE_ID] })
    })
    await waitFor(() => expect(result.current.data?.length).toBe(4))
    expect(seen.slice(firstDefined).every((n) => n !== undefined)).toBe(true) // nunca voltou a `undefined`
  })
  it('série usa o ranking e o índice de séries', async () => {
    await putKey()
    await seedList('series', ['Série A', 'Série B', 'Série C'])
    await putCache('trending', 'series', [tmdb(2, 'series', 'Série A'), tmdb(6, 'series', 'Série B'), tmdb(7, 'series', 'Série C')])
    const { result } = renderHook(() => useWeeklyTop10(SOURCE_ID, 'series'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(result.current.data?.length).toBe(3))
    expect(result.current.data!.map((pick) => [pick.rank, pick.item.kind])).toEqual([
      [2, 'series'],
      [6, 'series'],
      [7, 'series'],
    ])
  })
})

describe('useDailyTip (feature 057)', () => {
  const names = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis']

  it('sorteia entre os candidatos válidos cruzados, igual a cada montagem no mesmo dia, e vazio abaixo de 5', async () => {
    await putKey()
    await seedList('movie', names)
    await putCache('pool', 'movie', [
      ...names.map((name, i) => tmdb(i + 1, 'movie', name)),
      tmdb(20, 'movie', 'Fraco', { voteAverage: 6 }), // nota baixa: fora
    ])
    const first = renderHook(() => useDailyTip(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(first.result.current.data?.length).toBe(6))
    // 061: a Dica expõe o mesmo dado guardado, sem consulta de detalhe por card.
    for (const item of first.result.current.data!) {
      expect(first.result.current.ratings?.get(item.id)).toEqual({ average: 8, votes: 1000 })
    }
    const second = renderHook(() => useDailyTip(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(second.result.current.data?.length).toBe(6))
    expect(second.result.current.data!.map((item) => item.id)).toEqual(first.result.current.data!.map((item) => item.id))

    await putCache('pool', 'movie', names.slice(0, 4).map((name, i) => tmdb(i + 1, 'movie', name)))
    const few = renderHook(() => useDailyTip(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(few.result.current.data).toEqual([]))
  })

  it('o dia fica fixo na montagem: o relógio andando não troca o sorteio', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(YEAR, 5, 10, 12))
      await putKey()
      await seedList('movie', Array.from({ length: 30 }, (_, i) => `Filme ${i}`))
      await putCache('pool', 'movie', Array.from({ length: 30 }, (_, i) => tmdb(i + 1, 'movie', `Filme ${i}`)))
      const client = newClient()
      const { result } = renderHook(() => useDailyTip(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
      await waitFor(() => expect(result.current.data?.length).toBe(10))
      const before = result.current.data!.map((item) => item.id)

      vi.setSystemTime(new Date(YEAR, 5, 11, 12)) // virou o dia com a tela aberta
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['catalog-search-index', SOURCE_ID] })
      })
      await waitFor(() => expect(result.current.data?.length).toBe(10))
      expect(result.current.data!.map((item) => item.id)).toEqual(before)
    } finally {
      vi.useRealTimers()
    }
  })
})
