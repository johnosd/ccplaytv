/**
 * Teste de CONTRATO da feature 052 (tela de categoria) — só Pesquisar, Ordenar e a grade em tela cheia. Travado em
 * `sdd/specs/052-vitrine-filmes-series/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade):
 * - `.vod-grid` / `.vod-grid-cell` / `.content-card-title`: a grade e seus cards (como na 025/050).
 * - `.vod-toolbar-search-button` e `.vod-toolbar-sort-button`: Pesquisar e Ordenar (como na 025/050).
 * - AUSENTES nesta tela: `.vod-side-panel`, `.side-category-nav-item`, `.vod-hero-band`.
 * - `.tv-focus`: foco de estado (ADR-009). Teclas: Enter abre/seleciona, Escape = RETURN.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { VodCategoryScreen } from './VodCategoryScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import type { VodCategoryRestore, VodTarget } from './vodTarget'
import { resetVodSessionMemory } from './vodSessionMemory'
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
      this.callback([{ contentRect: { width: 1200, height: 640 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
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
    useFavoritesContent: vi.fn(),
    useHistoryContent: vi.fn(),
  }
})

const SOURCE_ID = 'source-1'

function movie(name: string): CatalogItemOut {
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
  }
}

function mockCatalog() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } as CatalogCategory],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [movie('Filme A1'), movie('Filme A2'), movie('Filme A3')], totalCount: 3, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
}

interface Calls {
  onOpenItem: Mock<(itemId: string, restore: VodCategoryRestore) => void>
  onBack: Mock<() => void>
}

function renderCategory(target: VodTarget): Calls {
  const calls: Calls = { onOpenItem: vi.fn<(itemId: string, restore: VodCategoryRestore) => void>(), onBack: vi.fn<() => void>() }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <VodCategoryScreen
        section="movies"
        sourceId={SOURCE_ID}
        target={target}
        onOpenItem={calls.onOpenItem}
        onBack={calls.onBack}
        onResync={vi.fn()}
      />
    </Wrapper>,
  )
  return calls
}

function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

describe('VodCategoryScreen — contrato da feature 052', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    mockCatalog()
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte de teste',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  // US1/AC1+AC3+AC4+AC5, FR-006, FR-008, FR-009, Constitution: "Voltar Restaura Foco e Posição"
  it('categoria: só toolbar + grade (sem sidebar nem hero); OK abre o item com o estado de volta; RETURN volta à vitrine', () => {
    const calls = renderCategory({ kind: 'category', name: 'Ação' })

    expect(document.querySelector('.vod-toolbar-search-button')).not.toBeNull()
    expect(document.querySelector('.vod-toolbar-sort-button')).not.toBeNull()
    expect(document.querySelector('.vod-grid')).not.toBeNull()
    expect(document.querySelectorAll('.vod-grid .content-card-title')).toHaveLength(3)
    expect(document.querySelector('.vod-side-panel')).toBeNull()
    expect(document.querySelector('.side-category-nav-item')).toBeNull()
    expect(document.querySelector('.vod-hero-band')).toBeNull()

    // O foco já está no 1º card (não há trilha para passar antes); → anda de card em card.
    tap('ArrowRight')
    tap('Enter')
    expect(calls.onOpenItem).toHaveBeenCalledTimes(1)
    const [itemId, restore] = calls.onOpenItem.mock.calls[0]
    expect(itemId).toBe('id-Filme A2')
    expect(restore.focusedItemId).toBe('id-Filme A2')
    expect(restore.searchActive).toBe(false)

    tap('Escape')
    expect(calls.onBack).toHaveBeenCalledTimes(1)
  })

  // US1/AC6, FR-008 (★ sem Ordenar), FR-013, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('★ Favoritos vazio: estado vazio com ação focável que volta à vitrine, e sem botão Ordenar', () => {
    const calls = renderCategory({ kind: 'favorites' })

    expect(document.querySelector('.vod-toolbar-sort-button')).toBeNull()
    expect(document.querySelector('.vod-grid')).toBeNull()
    expect(document.querySelectorAll('.tv-focus').length).toBe(1)

    tap('Enter')
    expect(calls.onBack).toHaveBeenCalledTimes(1)
  })
})

