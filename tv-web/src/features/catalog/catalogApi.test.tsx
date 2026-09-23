import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryFocusPrefetch, type CatalogCategory } from './catalogApi'
import * as categoryLoader from '../../lib/catalog/categoryLoader'
import { db } from '../../lib/catalog/db'

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
