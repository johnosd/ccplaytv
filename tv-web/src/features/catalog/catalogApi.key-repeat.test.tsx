import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryFocusPrefetch, type CatalogCategory } from './catalogApi'
import * as categoryLoader from '../../lib/catalog/categoryLoader'

vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn() }
})

function category(id: number): CatalogCategory {
  return { id, kind: 'channel', name: `Categoria ${id}`, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function repeat() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true, bubbles: true }))
  })
}

describe('useCategoryFocusPrefetch — rajada de tecla (feature 046)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // FR-004: a rajada nunca aborta a busca em andamento da categoria já entrada.
  it('uma rajada não aborta a busca em andamento já disparada', () => {
    const signals: AbortSignal[] = []
    vi.mocked(categoryLoader.ensureCategory).mockImplementation(async (_sourceId, _category, options) => {
      if (options?.signal) signals.push(options.signal)
      return { outcome: 'fresh' }
    })

    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )
    vi.advanceTimersByTime(400) // foco parado na categoria 1: a busca dispara
    expect(signals).toHaveLength(1)

    for (let id = 2; id <= 6; id += 1) {
      rerender({ cat: category(id) })
      repeat()
    }

    expect(signals[0]!.aborted).toBe(false)
    expect(signals).toHaveLength(1)
  })
})
