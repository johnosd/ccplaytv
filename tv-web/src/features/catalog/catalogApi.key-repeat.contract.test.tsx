import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryFocusPrefetch, type CatalogCategory } from './catalogApi'
import * as categoryLoader from '../../lib/catalog/categoryLoader'
import { resetKeyRepeatTracker } from '../../lib/focus/keyRepeat'

// Contrato da feature 046 (US1 / 14a): segurar a seta não dispara prefetch por categoria.

vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn() }
})

function category(id: number): CatalogCategory {
  return {
    id,
    kind: 'channel',
    name: `Categoria ${id}`,
    order: id,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: String(id),
  }
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function keydown(repeat: boolean) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat, bubbles: true }))
  })
}

function keyup() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }))
  })
}

describe('useCategoryFocusPrefetch — segurar a seta (feature 046)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fresh' })
  })

  afterEach(() => {
    resetKeyRepeatTracker()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // FR-002 + FR-003 + US1/AC1+AC2 + SC-001
  it('rajada com repeat não prefetcha nada; ao soltar, só a categoria final, após o debounce', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )

    keydown(false) // primeiro toque: ainda não é rajada
    for (let id = 2; id <= 30; id += 1) {
      rerender({ cat: category(id) })
      keydown(true) // auto-repetição da tecla segurada
      vi.advanceTimersByTime(60) // bem abaixo do debounce, e do tempo de silêncio
    }
    vi.advanceTimersByTime(250) // ainda segurando: nada pode ter disparado em 29 categorias
    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()

    keyup()
    vi.advanceTimersByTime(400) // debounce normal (300 ms) a partir de soltar

    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(1)
    expect(vi.mocked(categoryLoader.ensureCategory).mock.calls[0]![1]).toEqual(category(30))
  })

  // FR-005: um `keyup` perdido (troca de app, tela apagada) não deixa a rajada presa.
  it('sem keyup, a rajada acaba sozinha após o silêncio e a categoria parada é prefetchada', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )

    keydown(true)
    rerender({ cat: category(2) })
    keydown(true)
    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()

    // Nenhum evento novo, nenhum keyup: a rajada só acaba após o silêncio (300 ms), e só então
    // o debounce normal (300 ms) corre — antes disso, nada.
    vi.advanceTimersByTime(450)
    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)

    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(1)
    expect(vi.mocked(categoryLoader.ensureCategory).mock.calls[0]![1]).toEqual(category(2))
  })
})
