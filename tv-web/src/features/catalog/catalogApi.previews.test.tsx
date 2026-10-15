import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_LIMIT, useCategoryPreviews, type CatalogCategory } from './catalogApi'
import * as repository from '../../lib/catalog/catalogRepository'
import * as loader from '../../lib/catalog/categoryLoader'

vi.mock('../../lib/catalog/catalogRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/catalogRepository')>()
  return { ...actual, getActiveCategoryBlock: vi.fn(), listChannels: vi.fn() }
})
vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn() }
})

function category(id: number): CatalogCategory {
  return { id, kind: 'movie', name: `Cat ${id}`, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useCategoryPreviews (feature 053, D-008)', () => {
  it('bloco → ready limitado a PREVIEW_LIMIT na ordem da fonte; sem nada gravado → pending; nunca rede nem ensureCategory', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const items = Array.from({ length: PREVIEW_LIMIT + 5 }, (_, i) => ({ id: i + 1, name: `Filme ${i}`, providerStreamId: String(i) }))
    vi.mocked(repository.getActiveCategoryBlock).mockImplementation(async (_source, categoryId) =>
      categoryId === 1
        ? ({ categoryId: 1, sourceId: 's', generation: 1, kind: 'movie', groupOrder: 1, items } as unknown as Awaited<ReturnType<typeof repository.getActiveCategoryBlock>>)
        : undefined,
    )
    vi.mocked(repository.listChannels).mockResolvedValue([])

    const { result } = renderHook(() => useCategoryPreviews('s', [category(1), category(2)]), { wrapper })
    await waitFor(() => expect(result.current.size).toBe(2))

    const ready = result.current.get(1)!
    expect(ready.status).toBe('ready')
    expect(ready.items).toHaveLength(PREVIEW_LIMIT)
    expect(ready.items.map((item) => item.name)).toEqual(items.slice(0, PREVIEW_LIMIT).map((item) => item.name))
    expect(result.current.get(2)).toEqual({ status: 'pending', items: [] })
    expect(loader.ensureCategory).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('bloco vazio → empty; sem fonte, nada é consultado', async () => {
    vi.mocked(repository.getActiveCategoryBlock).mockResolvedValue({
      categoryId: 3,
      sourceId: 's',
      generation: 1,
      kind: 'movie',
      groupOrder: 3,
      items: [],
    } as unknown as Awaited<ReturnType<typeof repository.getActiveCategoryBlock>>)
    const { result } = renderHook(() => useCategoryPreviews('s', [category(3)]), { wrapper })
    await waitFor(() => expect(result.current.get(3)?.status).toBe('empty'))

    vi.clearAllMocks()
    renderHook(() => useCategoryPreviews(null, [category(4)]), { wrapper })
    expect(repository.getActiveCategoryBlock).not.toHaveBeenCalled()
  })
})
