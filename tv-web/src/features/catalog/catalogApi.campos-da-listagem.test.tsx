import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCategoryContent, type CatalogCategory } from './catalogApi'
import * as categoryLoader from '../../lib/catalog/categoryLoader'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'

vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn() }
})

const SOURCE_ID = 'source-campos-055'

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
})

// Feature 055 (T009): campos da listagem saem em CatalogItemOut; item antigo (sem eles) sai com null, sem erro.
describe('useCategoryContent — campos da listagem (feature 055)', () => {
  it('mapeia provider_rating/genres/backdrop_url do bloco e devolve null quando o registro não os tem', async () => {
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fresh' })
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    const [categoryId] = await storeCategories([
      { sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', name: 'Séries', order: 3, providerCategoryId: '3' },
    ])
    const serie = (name: string, extra: Partial<CatalogRecord> = {}): CatalogRecord => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'series',
      name,
      originalName: name,
      groupOrder: 3,
      seriesId: name,
      ...extra,
    })
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'series', categoryId, groupOrder: 3 },
      [
        serie('Nova', { providerRating: 7.4, providerGenres: 'Drama', providerBackdropUrl: 'http://a.test/fundo.jpg' }),
        serie('Antiga'),
      ],
      1,
    )
    const cat: CatalogCategory = {
      id: categoryId,
      kind: 'series',
      name: 'Séries',
      order: 3,
      count: 2,
      fetchMode: 'on_demand',
      providerCategoryId: '3',
      itemsFetchedAt: 1,
    }

    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, cat), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [nova, antiga] = result.current.data?.items ?? []
    expect(nova).toMatchObject({ provider_rating: 7.4, provider_genres: 'Drama', provider_backdrop_url: 'http://a.test/fundo.jpg' })
    expect(antiga).toMatchObject({ provider_rating: null, provider_genres: null, provider_backdrop_url: null })
  })
})
