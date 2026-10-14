import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRecentlyAdded, useTopRated } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import * as tmdbKeyRepository from '../../lib/metadata/tmdbKeyRepository'

/**
 * Feature 065, T061 (convergência, FR-003): as fileiras locais da vitrine esperam o estado da chave TMDB só para decidir se
 * trazem o índice compacto do Top 10/Dica. Se essa leitura local falhar, contam como "sem chave" — nunca ficam sem aparecer.
 */

vi.mock('../../lib/metadata/tmdbKeyRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/metadata/tmdbKeyRepository')>()
  return { ...actual, getTmdbStatus: vi.fn(actual.getTmdbStatus) }
})

const SOURCE_ID = 'source-showcase-status'
const YEAR = new Date().getFullYear()

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const movie = (index: number): CatalogRecord => ({
  sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: `Filme ${index}`, originalName: `Filme ${index}`, groupOrder: 0,
  addedAt: 1000 + index, providerStreamId: `p${index}`, providerRating: 7 + (index % 3) * 0.5, year: YEAR - 1,
})

afterEach(async () => {
  vi.mocked(tmdbKeyRepository.getTmdbStatus).mockReset()
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
})

describe('vitrine com o estado do TMDB ilegível (065, T061)', () => {
  it('Recém-adicionados e Bem avaliados aparecem mesmo quando a leitura do estado da chave falha', async () => {
    await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
    const [categoryId] = await storeCategories([{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Cat', order: 0, providerCategoryId: '1' }])
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, Array.from({ length: 20 }, (_, i) => movie(i)), 1)
    vi.mocked(tmdbKeyRepository.getTmdbStatus).mockRejectedValue(new Error('leitura local falhou'))

    const { result } = renderHook(() => ({ added: useRecentlyAdded(SOURCE_ID, 'movie'), rated: useTopRated(SOURCE_ID, 'movie') }), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.added.data?.length).toBe(12))
    expect(result.current.added.data?.[0].name).toBe('Filme 19')
    expect(result.current.rated.data?.length).toBeGreaterThan(0)
  })
})
