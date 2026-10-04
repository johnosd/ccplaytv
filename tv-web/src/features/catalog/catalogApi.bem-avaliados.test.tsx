import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTopRated } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'

const SOURCE_ID = 'source-bem-avaliados-056'
const YEAR = new Date().getFullYear()

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrapperOf(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(async () => {
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
})

interface Spec {
  rating?: number
  /** Anos atrás (0 = ano corrente); `undefined` = sem ano. */
  yearsAgo?: number
  name?: string
}

function recordOf(kind: 'movie' | 'series', spec: Spec, index: number, groupOrder = 0, prefix = 'Título'): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    kind,
    name: spec.name ?? `${prefix} ${index}`,
    originalName: spec.name ?? `${prefix} ${index}`,
    groupOrder,
    addedAt: index,
    ...(kind === 'movie' ? { providerStreamId: `${prefix}${index}` } : { seriesId: `${prefix}${index}` }),
    ...(spec.rating !== undefined ? { providerRating: spec.rating } : {}),
    ...(spec.yearsAgo !== undefined ? { year: YEAR - spec.yearsAgo } : {}),
  }
}

async function seed(kind: 'movie' | 'series', specs: Spec[], extraUncoveredCategories = 0) {
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
    ...Array.from({ length: extraUncoveredCategories }, (_, index) => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind,
      fetchMode: 'on_demand' as const,
      name: `Pendente ${index}`,
      order: index + 1,
      providerCategoryId: String(index + 2),
    })),
  ])
  await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind, categoryId: ids[0], groupOrder: 0 }, specs.map((spec, index) => recordOf(kind, spec, index)), 1)
  return ids
}

const ratings = (items: { provider_rating?: number | null }[] | undefined) => items?.map((item) => item.provider_rating)

// Feature 056 (T013, T031; refinamento 2026-10-04): o hook lê o índice local — sem rede — e só os escolhidos viram item de tela.
describe('useTopRated (feature 056)', () => {
  it('só entram nota 6,0–9,9 com ano; recentes, em ordem de nota; a cobertura vem do índice', async () => {
    await seed(
      'movie',
      [
        { rating: 6, yearsAgo: 1 },
        { rating: 9.5, yearsAgo: 0 },
        { rating: 10, yearsAgo: 0 }, // 10,0: fora
        { rating: 8, yearsAgo: 2 },
        { rating: 5.5, yearsAgo: 1 }, // abaixo do piso: fora
        { rating: 9.2 }, // sem ano: fora
        { rating: 7, yearsAgo: 3 },
        { yearsAgo: 1 }, // sem nota: fora
        { rating: 9.5, yearsAgo: 1 },
      ],
      1,
    )
    const { result } = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(result.current.data).toBeDefined())

    const data = result.current.data!
    expect(ratings(data)).toEqual([9.5, 9.5, 8, 7, 6])
    // Empate em 9,5: o ano mais novo primeiro.
    expect(data[0].year).toBe(YEAR)
    expect(data[1].year).toBe(YEAR - 1)
    expect(result.current.coveredCategories).toBe(1)
    expect(result.current.totalCategories).toBe(2)
  })

  it('versões do mesmo título viram um só; abaixo de 5 elegíveis a lista é vazia; série usa o tipo série', async () => {
    await seed('movie', [
      { rating: 9, yearsAgo: 0, name: 'Condor' },
      { rating: 8.5, yearsAgo: 0, name: 'Condor [L]' },
      { rating: 8, yearsAgo: 0, name: 'Outro' },
      { rating: 7, yearsAgo: 0, name: 'Mais um' },
      { rating: 6.5, yearsAgo: 0, name: 'Último' },
    ])
    const poucos = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(poucos.result.current.data).toBeDefined())
    expect(poucos.result.current.data).toEqual([]) // só 4 títulos distintos
    await db.categories.where('sourceId').equals(SOURCE_ID).delete()
    await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()

    await seed('series', [9, 8, 7, 6.5, 6].map((rating) => ({ rating, yearsAgo: 1 })))
    const series = renderHook(() => useTopRated(SOURCE_ID, 'series'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(series.result.current.data).toBeDefined())
    expect(series.result.current.data!.map((item) => item.kind)).toEqual(['series', 'series', 'series', 'series', 'series'])
  })

  it('só 12 viram item de tela; com mais de 36 recentes só os melhores entram; duas leituras no mesmo dia dão o mesmo resultado', async () => {
    // 60 filmes recentes, notas de 9,9 a 6,0 em passos de ~0,066 — os 36 melhores vão de 9,9 a ~7,5.
    await seed('movie', Array.from({ length: 60 }, (_, index) => ({ rating: Math.round((9.9 - index * 0.065) * 10) / 10, yearsAgo: index % 5 })))
    const first = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(first.result.current.data).toBeDefined())
    const data = first.result.current.data!
    expect(data).toHaveLength(12)
    expect(data.every((item) => (item.provider_rating ?? 0) >= 7.5)).toBe(true)

    const second = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(second.result.current.data).toBeDefined())
    expect(second.result.current.data!.map((item) => item.id)).toEqual(data.map((item) => item.id))
  })

  it('uma categoria obtida depois (pré-carga invalida o índice) muda a fileira e a cobertura sem recarregar', async () => {
    const ids = await seed('movie', [6, 6.5, 7, 7.5, 8].map((rating) => ({ rating, yearsAgo: 1 })), 1)
    const client = newClient()
    const { result } = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(ratings(result.current.data)).toEqual([8, 7.5, 7, 6.5, 6])
    expect(result.current.coveredCategories).toBe(1)

    // A categoria pendente chega com notas maiores (como a pré-carga da 038 faz) e invalida o índice do tipo.
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: ids[1], groupOrder: 1 },
      [9.8, 9.1].map((rating, index) => recordOf('movie', { rating, yearsAgo: 0 }, 100 + index, 1, 'Nova')),
      2,
    )
    await client.invalidateQueries({ queryKey: ['catalog-search-index', SOURCE_ID] })

    await waitFor(() => expect(result.current.data![0].provider_rating).toBe(9.8))
    expect(ratings(result.current.data)).toEqual([9.8, 9.1, 8, 7.5, 7, 6.5, 6])
    expect(result.current.coveredCategories).toBe(2)
    expect(result.current.totalCategories).toBe(2)
  })

  it('fonte sem nota nenhuma (ex.: M3U): lista vazia, sem erro', async () => {
    await seed('movie', [{}, {}, {}, {}, {}, {}])
    const { result } = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([])
  })

  it('canal ou fonte ausente: query desabilitada, sem dado', () => {
    const channel = renderHook(() => useTopRated(SOURCE_ID, 'channel'), { wrapper: wrapperOf(newClient()) })
    expect(channel.result.current.data).toBeUndefined()
    const none = renderHook(() => useTopRated(null, 'movie'), { wrapper: wrapperOf(newClient()) })
    expect(none.result.current.data).toBeUndefined()
    expect(none.result.current.isLoading).toBe(false)
  })
})
