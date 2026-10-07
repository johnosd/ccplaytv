import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview } from '../catalog/catalogApi'
import type { VodSection } from './vodSessionMemory'
import { resetVodSessionMemory } from './vodSessionMemory'
import { SEE_ALL_ID } from './vodShowcaseRows'
import type { VodShowcaseFocus } from './vodTarget'
import { db } from '../../lib/catalog/db'

// Feature 056 (T014, T021): comportamentos além dos contratos — cobertura completa, Séries, rótulo de origem e a fileira
// que some com o foco nela.
let restore: Array<() => void> = []

beforeAll(() => {
  const defs: Array<[object, string, PropertyDescriptor | undefined]> = [
    [HTMLElement.prototype, 'offsetHeight', Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')],
    [HTMLElement.prototype, 'offsetWidth', Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')],
    [Element.prototype, 'clientHeight', Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')],
    [Element.prototype, 'clientWidth', Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')],
  ]
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, value: 1200 })
  const originalObserver = globalThis.ResizeObserver
  class FakeResizeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback([{ contentRect: { width: 1200, height: 640 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  restore = [
    ...defs.map(([target, key, descriptor]) => () => {
      if (descriptor) Object.defineProperty(target, key, descriptor)
    }),
    () => {
      globalThis.ResizeObserver = originalObserver
    },
  ]
})

afterAll(() => {
  for (const undo of restore) undo()
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useHistoryContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useRecentlyAdded: vi.fn(),
    useTopRated: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-1'

function title(name: string, kind: 'movie' | 'series', rating: number | null): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
    name,
    original_group: 'Grupo',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    added_at: null,
    provider_rating: rating,
  }
}

interface Rated {
  items: CatalogItemOut[]
  covered: number
  total: number
}

function mockData(kind: 'movie' | 'series', rated: Rated) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind, name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } satisfies CatalogCategory],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [title('Fav', kind, null)], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [], isLoading: false })
  vi.mocked(catalogApi.useTopRated).mockReturnValue({
    data: rated.items,
    coveredCategories: rated.covered,
    totalCategories: rated.total,
    isLoading: false,
  })
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [], totalCount: 0, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(new Map<number, CategoryPreview>([[1, { status: 'pending', items: [] }]]))
}

function screenOf(section: VodSection, restoreFocus?: VodShowcaseFocus): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VodShowcaseScreen
        section={section}
        sourceId={SOURCE_ID}
        onOpenItem={vi.fn()}
        onOpenTarget={vi.fn()}
        restore={restoreFocus}
        onBack={vi.fn()}
        onResync={vi.fn()}
      />
    </QueryClientProvider>
  )
}

function tap(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
}

const focusedRowLabel = () => document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')?.getAttribute('aria-label') ?? null

describe('VodShowcaseScreen — Bem avaliados (feature 056)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('cobertura completa: sem aviso de escopo; parcial: com o aviso', () => {
    const items = [title('A', 'movie', 9), title('B', 'movie', 8)]
    mockData('movie', { items, covered: 2, total: 2 })
    render(screenOf('movies'))
    expect(document.querySelector('.vod-row-coverage')).toBeNull()
    cleanup()

    mockData('movie', { items, covered: 1, total: 2 })
    render(screenOf('movies'))
    const coverage = document.querySelector('section.vod-row[aria-label="Bem avaliados"] .vod-row-coverage')
    expect(coverage?.textContent).toBe('Com base em 1 de 2 categorias')
    expect(coverage?.hasAttribute('tabindex')).toBe(false)
  })

  it('Séries: usa o tipo série; o card mostra a nota real e a tela nunca cita IMDb/TMDB nem consulta a rede', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockData('series', { items: [title('Série A', 'series', 9.2), title('Série B', 'series', 8.1)], covered: 1, total: 1 })
    render(screenOf('series'))

    expect(vi.mocked(catalogApi.useTopRated)).toHaveBeenCalledWith(SOURCE_ID, 'series')
    tap('ArrowDown') // Favoritos → Bem avaliados
    expect(focusedRowLabel()).toBe('Bem avaliados')
    const meta = document.querySelector('.content-card:has(.tv-focus) .rating-badge')?.textContent ?? ''
    expect(meta).toContain('★ 9,2')
    expect(document.querySelector('.vod-hero-band')).toBeNull()
    // O slot "Top 10 … com dados do TMDB" é outro assunto: a nota só pode vir rotulada como do provedor (SC-006).
    const ratedRow = document.querySelector('section.vod-row[aria-label="Bem avaliados"]')?.textContent ?? ''
    expect(`${meta} ${ratedRow}`).not.toMatch(/IMDb|TMDB/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('voltar da grade (Ver tudo) ou do detalhe restaura o foco em "Bem avaliados" por id; id que sumiu cai num vizinho da mesma fileira', () => {
    const items = [title('A', 'movie', 9), title('B', 'movie', 8), title('C', 'movie', 7)]
    mockData('movie', { items, covered: 1, total: 1 })

    render(screenOf('movies', { row: 'rated', id: SEE_ALL_ID }))
    expect(focusedRowLabel()).toBe('Bem avaliados')
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.vod-see-all-card')).not.toBeNull()
    cleanup()

    render(screenOf('movies', { row: 'rated', id: 'id-B' }))
    expect(focusedRowLabel()).toBe('Bem avaliados')
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.content-card')?.textContent).toContain('B')
    cleanup()

    render(screenOf('movies', { row: 'rated', id: 'id-removido' }))
    expect(focusedRowLabel()).toBe('Bem avaliados')
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
  })

  it('a fileira some com o foco nela: o foco vai para uma fileira vizinha e continua único', () => {
    mockData('movie', { items: [title('A', 'movie', 9), title('B', 'movie', 8)], covered: 1, total: 1 })
    const view = render(screenOf('movies'))
    tap('ArrowDown')
    expect(focusedRowLabel()).toBe('Bem avaliados')

    mockData('movie', { items: [], covered: 1, total: 1 })
    view.rerender(screenOf('movies'))

    expect(document.querySelector('section.vod-row[aria-label="Bem avaliados"]')).toBeNull()
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    expect(focusedRowLabel()).not.toBeNull()
  })
})
