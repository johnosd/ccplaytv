import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryContent, useRecentlyAdded, useTopRated } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { listCategories, renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import * as categoryLoader from '../../lib/catalog/categoryLoader'
import * as catalogSearch from '../../lib/catalog/catalogSearch'

/**
 * Bug `tela-principal-filmes-lenta-na-tv`: a vitrine de Filmes relia o índice inteiro do IndexedDB e refazia os `select`
 * ("Adicionados recentemente" mapeava todos os registros; "Bem avaliados" normalizava milhares de títulos) a cada montagem.
 * Aqui: com o índice em cache a 2ª montagem não relê nada, devolve as mesmas listas, e uma categoria nova (invalidação) atualiza.
 */

vi.mock('../../lib/catalog/catalogSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/catalogSearch')>()
  return { ...actual, loadSearchIndex: vi.fn(actual.loadSearchIndex) }
})

vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn(actual.ensureCategory) }
})

const SOURCE_ID = 'source-vitrine-cache'
const YEAR = new Date().getFullYear()

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}
const wrapperOf = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

const record = (name: string, index: number, over: Partial<CatalogRecord> = {}): CatalogRecord => ({
  sourceId: SOURCE_ID,
  generation: 1,
  kind: 'movie',
  name,
  originalName: name,
  groupOrder: 0,
  addedAt: 1000 + index,
  providerStreamId: `p${index}`,
  providerRating: 7 + (index % 3) * 0.5,
  year: YEAR - 1,
  ...over,
})

async function seed(count: number) {
  await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  const ids = await storeCategories([
    { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Cat', order: 0, providerCategoryId: '1' },
    { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Pendente', order: 1, providerCategoryId: '2' },
  ])
  await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: ids[0], groupOrder: 0 }, Array.from({ length: count }, (_, i) => record(`Filme ${i}`, i)), 1)
  return ids
}

const loadIndex = vi.mocked(catalogSearch.loadSearchIndex)

beforeEach(() => {
  loadIndex.mockClear()
})

afterEach(async () => {
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
})

describe('vitrine de Filmes — índice em cache (bug tela-principal-filmes-lenta-na-tv)', () => {
  it('"Adicionados recentemente": só as 12 mais novas, e uma 2ª montagem com o índice em cache não relê o banco e devolve a mesma lista', async () => {
    await seed(40)
    const client = newClient()
    const first = renderHook(() => useRecentlyAdded(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(first.result.current.data?.length).toBe(12))
    expect(first.result.current.data!.map((item) => item.name)).toEqual(Array.from({ length: 12 }, (_, i) => `Filme ${39 - i}`))
    const firstList = first.result.current.data
    first.unmount()

    const second = renderHook(() => useRecentlyAdded(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    expect(second.result.current.data).toBe(firstList) // já na 1ª renderização, sem esperar e sem recalcular
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(loadIndex).toHaveBeenCalledTimes(1) // o índice foi lido uma vez só
  })

  it('"Bem avaliados": a 2ª montagem reaproveita a seleção (mesma referência) sem reler o índice', async () => {
    await seed(40)
    const client = newClient()
    const first = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(first.result.current.data?.length).toBeGreaterThan(0))
    const firstList = first.result.current.data
    first.unmount()

    const second = renderHook(() => useTopRated(SOURCE_ID, 'movie'), { wrapper: wrapperOf(client) })
    expect(second.result.current.data).toBe(firstList)
    expect(second.result.current.coveredCategories).toBe(1)
    expect(second.result.current.totalCategories).toBe(2)
    expect(loadIndex).toHaveBeenCalledTimes(1)
  })

  it('render repetido com o índice em cache não recalcula (o select deixou de rodar a cada render)', async () => {
    await seed(40)
    const client = newClient()
    const { result, rerender } = renderHook(() => ({ added: useRecentlyAdded(SOURCE_ID, 'movie'), rated: useTopRated(SOURCE_ID, 'movie') }), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(result.current.added.data?.length).toBe(12))
    const added = result.current.added.data
    const rated = result.current.rated.data
    for (let i = 0; i < 5; i += 1) rerender()
    expect(result.current.added.data).toBe(added)
    expect(result.current.rated.data).toBe(rated)
  })

  it('entrar numa categoria que busca conteúdo novo invalida o índice (a vitrine não o relê mais a cada montagem); sem conteúdo novo, não', async () => {
    await seed(5)
    const [category] = await listCategories(SOURCE_ID, 'movie')
    const client = newClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const indexInvalidations = () => invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(['catalog-search-index', SOURCE_ID])).length

    vi.mocked(categoryLoader.ensureCategory).mockResolvedValueOnce({ outcome: 'fresh' })
    const quiet = renderHook(() => useCategoryContent(SOURCE_ID, category), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(quiet.result.current.data).toBeDefined())
    expect(indexInvalidations()).toBe(0)
    quiet.unmount()
    client.removeQueries({ queryKey: ['category-content'] })

    vi.mocked(categoryLoader.ensureCategory).mockResolvedValueOnce({ outcome: 'fetched' })
    const fetched = renderHook(() => useCategoryContent(SOURCE_ID, category), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(fetched.result.current.data).toBeDefined())
    expect(indexInvalidations()).toBe(1)
  })

  it('categoria nova (índice invalidado) atualiza as duas fileiras; uma releitura, não uma por hook', async () => {
    const ids = await seed(30)
    const client = newClient()
    const { result } = renderHook(() => ({ added: useRecentlyAdded(SOURCE_ID, 'movie'), rated: useTopRated(SOURCE_ID, 'movie') }), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(result.current.added.data?.length).toBe(12))
    expect(result.current.added.data![0].name).toBe('Filme 29')
    expect(result.current.rated.coveredCategories).toBe(1)

    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: ids[1], groupOrder: 1 }, [record('Chegou agora', 500, { addedAt: 99999 })], 1)
    loadIndex.mockClear()
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['catalog-search-index', SOURCE_ID] })
    })
    await waitFor(() => expect(result.current.added.data![0].name).toBe('Chegou agora'))
    await waitFor(() => expect(result.current.rated.coveredCategories).toBe(2))
    expect(loadIndex).toHaveBeenCalledTimes(1)
  })
})
