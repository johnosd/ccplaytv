/**
 * "Ver tudo" de "Bem avaliados" (feature 056, US2): "Todos" abre ordenado por nota SÓ nesta abertura; "Nota" não vira
 * opção do modal de Ordenar (FR-008). Complementa os contratos travados da 056.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCategoryScreen } from './VodCategoryScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import type { VodTarget } from './vodTarget'
import { db } from '../../lib/catalog/db'

let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreOffsetWidth: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreScrollHeight: PropertyDescriptor | undefined
let restoreScrollTo: PropertyDescriptor | undefined
let restoreResizeObserver: typeof globalThis.ResizeObserver | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  restoreScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
  restoreResizeObserver = globalThis.ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' && options !== null ? options.top : undefined
      if (typeof top === 'number') this.scrollTop = top
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })
  class FakeResizeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback([{ contentRect: { width: 1200 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
})

afterAll(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', restoreScrollHeight)
  if (restoreScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', restoreScrollTo)
  globalThis.ResizeObserver = restoreResizeObserver as typeof ResizeObserver
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useAggregatedItems: vi.fn(),
    resolveCatalogItemId: vi.fn(async (itemId: string) => itemId),
  }
})

const SOURCE_ID = 'source-vod-bem-avaliados'

function movie(name: string, rating: number | null, addedAt?: number, year?: number): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    year: year ?? null,
    added_at: addedAt ?? null,
    provider_rating: rating,
  }
}

const ITEMS = [
  movie('Sem nota', null, 99),
  movie('Sete', 7, 5, 2001),
  movie('Nove antigo', 9, 5, 2002),
  movie('Nove novo', 9, 20, 2003),
]

function mockAggregated(items: CatalogItemOut[]) {
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items, coveredCategories: 1, totalCategories: 1, isLoading: false })
}

function renderAll(target: VodTarget) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return render(
    <Wrapper>
      <VodCategoryScreen section="movies" sourceId={SOURCE_ID} target={target} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const gridTitles = () => [...document.querySelectorAll('.vod-grid .content-card-title')].map((el) => el.textContent ?? '')
const sortButton = () => document.querySelector('.vod-toolbar-sort-button')?.textContent
const sortModalLabels = () => [...document.querySelectorAll('.vod-sort-modal-item')].map((el) => el.textContent ?? '')

function openSortFromGrid() {
  press('ArrowUp') // 1ª linha da grade -> "Pesquisar"
  press('ArrowRight') // "Pesquisar" -> "Ordenar"
  press('Enter') // abre o modal
}

beforeEach(async () => {
  resetVodSessionMemory()
  await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } satisfies CatalogCategory],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [], totalCount: 0, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  mockAggregated(ITEMS)
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('"Ver tudo" de Bem avaliados — grade ordenada por nota (feature 056)', () => {
  it('abre "Todos" em Nota: nota desc., empate pelo mais recente, sem nota no fim; lê o tipo inteiro (não progressivo)', () => {
    renderAll({ kind: 'all', sort: 'rating' })

    expect(gridTitles()).toEqual(['Nove novo', 'Nove antigo', 'Sete', 'Sem nota'])
    expect(sortButton()).toBe('Ordenar · Nota ▾')
    expect(vi.mocked(catalogApi.useAggregatedItems)).toHaveBeenLastCalledWith(SOURCE_ID, 'movie', true, { progressive: false })
  })

  it('"Nota" não é opção do modal de Ordenar; escolher outra opção sai da nota e o foco do modal começa na primeira', () => {
    renderAll({ kind: 'all', sort: 'rating' })
    openSortFromGrid()

    const labels = sortModalLabels()
    expect(labels.some((label) => label.includes('Nota'))).toBe(false)
    expect(labels.map((label) => label.replace('✓ ', ''))).toEqual(['Ordem da fonte', 'A–Z', 'Ano', 'Recém-adicionados'])
    expect(document.querySelector('.vod-sort-modal-item.tv-focus')?.textContent).toContain('Ordem da fonte')

    press('ArrowDown') // A–Z
    press('Enter')
    expect(sortButton()).toBe('Ordenar · A–Z ▾')
    expect(gridTitles()).toEqual(['Nove antigo', 'Nove novo', 'Sem nota', 'Sete'])
  })

  it('vale só nesta abertura: "Todos" aberto de novo, sem `sort`, volta à ordem da fonte', () => {
    const first = renderAll({ kind: 'all', sort: 'rating' })
    expect(sortButton()).toBe('Ordenar · Nota ▾')
    first.unmount()

    renderAll({ kind: 'all' })
    expect(sortButton()).toBe('Ordenar · Ordem da fonte ▾')
    expect(gridTitles()).toEqual(['Sem nota', 'Sete', 'Nove antigo', 'Nove novo'])
  })
})
