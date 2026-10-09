import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCategoryWindow } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { listCategories, renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { prepareMissingReadModels, READ_WINDOW_MIN_ITEMS } from '../../lib/catalog/categoryWindow'

/**
 * Feature 065 (T055, SC-007): a grade de uma categoria grande na ordem da fonte lê janelas da projeção compacta — o primeiro
 * recorte nunca materializa a categoria inteira, rolar até o fim lê só o que falta, e sem projeção a tela volta à leitura
 * integral de sempre. O backfill prepara, em segundo plano, só as categorias grandes, a maior primeiro.
 */

const SOURCE_ID = 'source-category-window'
const BIG = READ_WINDOW_MIN_ITEMS + 200

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const movie = (index: number, groupOrder: number): CatalogRecord => ({
  sourceId: SOURCE_ID,
  generation: 1,
  kind: 'movie',
  name: `Filme ${index}`,
  originalName: `Filme ${index}`,
  groupOrder,
  providerStreamId: `p${groupOrder}-${index}`,
  directUrl: `https://play.invalid/${groupOrder}/${index}`,
})

async function seed(sizes: number[]): Promise<number[]> {
  await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  const ids = await storeCategories(sizes.map((_, order) => ({ sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, fetchMode: 'eager' as const, name: `Cat ${order}`, order })))
  for (const [order, size] of sizes.entries()) {
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: ids[order], groupOrder: order }, Array.from({ length: size }, (_, index) => movie(index, order)), 1)
  }
  return ids
}

afterEach(async () => {
  vi.restoreAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
  await db.catalogReadManifests.clear()
  await db.catalogReadChunks.clear()
})

describe('useCategoryWindow (feature 065, SC-007)', () => {
  it('lê o primeiro recorte da projeção sem ler o bloco e, ao rolar até o fim, só o que falta, na ordem da fonte', async () => {
    await seed([BIG])
    const [category] = await listCategories(SOURCE_ID, 'movie')
    const blockGet = vi.spyOn(db.categoryBlocks, 'get')
    const { result } = renderHook(() => useCategoryWindow(SOURCE_ID, category, true), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.items.length).toBeGreaterThan(0))
    expect(result.current.windowed).toBe(true)
    expect(result.current.data?.totalCount).toBe(BIG)
    expect(result.current.data!.items.length).toBeLessThan(BIG)
    expect(result.current.data!.items.slice(0, 3).map((item) => item.name)).toEqual(['Filme 0', 'Filme 1', 'Filme 2'])
    expect(blockGet).not.toHaveBeenCalled()

    act(() => result.current.loadMore(BIG - 1))
    await waitFor(() => expect(result.current.data?.items.length).toBe(BIG))
    expect(result.current.data!.items.at(-1)?.name).toBe(`Filme ${BIG - 1}`)
    expect(new Set(result.current.data!.items.map((item) => item.id)).size).toBe(BIG)
    expect(result.current.hasMore).toBe(false)
    expect(blockGet).not.toHaveBeenCalled()
  })

  it('sem projeção da contagem atual, categoria pequena ou fora da ordem da fonte: windowed=false (a tela lê a categoria inteira)', async () => {
    const ids = await seed([BIG, 20])
    await db.catalogReadManifests.delete(ids[0])
    const [big, small] = await listCategories(SOURCE_ID, 'movie')
    const noProjection = renderHook(() => useCategoryWindow(SOURCE_ID, big, true), { wrapper: wrapper() })
    await waitFor(() => expect(noProjection.result.current.isLoading).toBe(false))
    expect(noProjection.result.current.windowed).toBe(false)
    const smallOne = renderHook(() => useCategoryWindow(SOURCE_ID, small, true), { wrapper: wrapper() })
    expect(smallOne.result.current.windowed).toBe(false)
    const sorted = renderHook(() => useCategoryWindow(SOURCE_ID, big, false), { wrapper: wrapper() })
    expect(sorted.result.current.windowed).toBe(false)
  })
})

describe('prepareMissingReadModels (feature 065, backfill)', () => {
  it('prepara só categorias grandes sem projeção, a maior primeiro, uma por chamada', async () => {
    const ids = await seed([BIG, 20, BIG + 50])
    await db.catalogReadManifests.bulkDelete(ids)
    await db.catalogReadChunks.clear()
    expect(await prepareMissingReadModels(SOURCE_ID)).toBe(true)
    expect(await db.catalogReadManifests.get(ids[2])).toMatchObject({ count: BIG + 50 })
    expect(await db.catalogReadManifests.get(ids[0])).toBeUndefined()
    expect(await prepareMissingReadModels(SOURCE_ID)).toBe(false)
    expect(await db.catalogReadManifests.get(ids[0])).toMatchObject({ count: BIG })
    expect(await db.catalogReadManifests.get(ids[1])).toBeUndefined()
    expect(await prepareMissingReadModels(SOURCE_ID)).toBe(false)
  })
})
