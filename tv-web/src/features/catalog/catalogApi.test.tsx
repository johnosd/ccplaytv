import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stableIdOf, useCatalogCounts, useCategoryFocusPrefetch, type CatalogCategory } from './catalogApi'
import * as categoryLoader from '../../lib/catalog/categoryLoader'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { db, type CategoryRecord } from '../../lib/catalog/db'

vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn() }
})

function category(id: number, overrides: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id,
    kind: 'channel',
    name: `Categoria ${id}`,
    order: id,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: String(id),
    ...overrides,
  }
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useCategoryFocusPrefetch (feature 010 — desvio deliberado de FR-004)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fresh' })
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    await db.channels.clear()
    await db.categories.clear()
  })

  it('não busca antes de o cursor parar na categoria (amortecido — R-002)', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )

    // Cursor sobrevoa três categorias rápido, sem parar em nenhuma.
    rerender({ cat: category(2) })
    rerender({ cat: category(3) })
    vi.advanceTimersByTime(200) // menos que o amortecimento

    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
  })

  it('busca só a categoria onde o cursor de fato ficou, depois do amortecimento', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )

    rerender({ cat: category(2) })
    vi.advanceTimersByTime(400) // além do amortecimento, parado em "2"

    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(1)
    expect(categoryLoader.ensureCategory).toHaveBeenCalledWith('source-1', category(2))
  })

  it('sem categoria em foco (undefined), não agenda nada', () => {
    renderHook(({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat), {
      wrapper: wrapper(),
      initialProps: { cat: undefined },
    })

    vi.advanceTimersByTime(1000)

    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
  })
})

describe('useCatalogCounts — canais seguem a mesma regra honesta de filmes/séries (sdd-converge C-001)', () => {
  const SOURCE_ID = 'source-counts'

  async function seedCategories(categories: Omit<CategoryRecord, 'id' | 'sourceId' | 'generation'>[]) {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte de teste',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.categories.bulkAdd(
      categories.map((category) => ({ ...category, sourceId: SOURCE_ID, generation: 1 })),
    )
  }

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.categories.clear()
  })

  it('canal eager soma os itens reais gravados, como filme/série eager já somava', async () => {
    await seedCategories([
      { kind: 'channel', fetchMode: 'eager', order: 0, name: 'Notícias', itemsCount: 12 },
      { kind: 'channel', fetchMode: 'eager', order: 1, name: 'Esportes', itemsCount: 8 },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: 20, categories: 2 })
  })

  it('canal on_demand sem contagem declarada mostra o piso de categorias, nunca "0" (FR-014)', async () => {
    await seedCategories([
      { kind: 'channel', fetchMode: 'on_demand', order: 0, name: 'Filmes 24h', providerCategoryId: '1' },
      { kind: 'channel', fetchMode: 'on_demand', order: 1, name: 'Documentários', providerCategoryId: '2' },
      { kind: 'channel', fetchMode: 'on_demand', order: 2, name: 'Infantil', providerCategoryId: '3' },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: undefined, categories: 3 })
  })
})

describe('stableIdOf (feature 012, D-006)', () => {
  it('episódio inclui temporada e episódio na chave, igual a buildStableId direto', () => {
    const id = stableIdOf({
      source_id: 'src1',
      kind: 'episode',
      provider_stream_id: null,
      series_id: '7',
      season_number: 1,
      episode_number: 3,
      original_name: 'Piloto',
    })

    expect(id).toBe(
      buildStableId({ sourceId: 'src1', kind: 'episode', seriesId: '7', seasonNumber: 1, episodeNumber: 3 }),
    )
    expect(id).toBe('src1|episode|id:7|s1|e3')
  })

  it('filme dá o mesmo resultado que a identidade calculada hoje pelo PlayerLayer/MovieDetailScreen (nada muda para a 011)', () => {
    const id = stableIdOf({
      source_id: 'src1',
      kind: 'movie',
      provider_stream_id: '100',
      original_name: 'Die Hard',
    })

    expect(id).toBe(
      buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '100', originalName: 'Die Hard' }),
    )
    expect(id).toBe('src1|movie|id:100')
  })

  it('canal também bate com buildStableId direto', () => {
    const id = stableIdOf({ source_id: 'src1', kind: 'channel', provider_stream_id: '55', original_name: 'Canal' })

    expect(id).toBe(buildStableId({ sourceId: 'src1', kind: 'channel', providerStreamId: '55', originalName: 'Canal' }))
  })

  it('sem identificador de painel nem nome aproveitável, devolve null em vez de lançar (D-010 da 011)', () => {
    expect(
      stableIdOf({ source_id: 'src1', kind: 'episode', provider_stream_id: null, series_id: null, original_name: '' }),
    ).toBeNull()
  })
})
