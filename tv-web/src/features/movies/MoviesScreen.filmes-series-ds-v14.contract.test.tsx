/**
 * Teste de CONTRATO da feature 025 (Filmes e Séries no DS V14) — grade de
 * Filmes sob a topbar, side nav V14 e memória de foco por entrada. Travado em
 * `sdd/specs/025-filmes-series-ds-v14/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade):
 * - `.side-category-nav-item`: cada entrada da side nav (`SideCategoryNav`,
 *   feature 022), incluindo "★ Favoritos", "↺ Histórico" e "Todos".
 * - `.topbar-item`: destinos da topbar (feature 023); o atual tem
 *   `aria-current="page"`.
 * - `.content-card` / `.content-card-title`: o card da grade (`ContentCard`,
 *   feature 022); o card focado contém um elemento `.tv-focus`.
 * - `.tv-focus`: foco de estado (ADR-009).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoviesScreen } from './MoviesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import type { VodShellProps } from '../vod/vodShell'
import { resetVodSessionMemory } from '../vod/vodSessionMemory'
import { db } from '../../lib/catalog/db'

// Mesmo bloco de layout de MoviesScreen.test.tsx: jsdom não faz layout, e a
// grade é virtualizada (feature 009).
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
    observe(target: Element) {
      this.callback([{ contentRect: { width: 1200 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      void target
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
    // Favoritos/assistidos/histórico: reais, contra `db` (fake-indexeddb), vazios.
  }
})

const SOURCE_ID = 'source-1'

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, streamId: string, group: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: group,
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: streamId,
    original_name: name,
  }
}

function mockCatalog() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Ação', 0), category(2, 'Drama', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items =
      cat?.id === 1
        ? [movie('Filme A1', 'a1', 'Ação'), movie('Filme A2', 'a2', 'Ação'), movie('Filme A3', 'a3', 'Ação')]
        : cat?.id === 2
          ? [movie('Filme D1', 'd1', 'Drama'), movie('Filme D2', 'd2', 'Drama')]
          : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items: [],
    coveredCategories: 0,
    totalCategories: 2,
    isLoading: false,
  })
}

function renderMovies(shell: VodShellProps, onBack = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <MoviesScreen sourceId={SOURCE_ID} onOpenMovie={vi.fn()} onBack={onBack} onResync={vi.fn()} shell={shell} />
    </Wrapper>,
  )
  return { onBack }
}

/** Toque rápido: keydown + keyup, como um pressionamento normal do controle. */
function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function navEntries(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.side-category-nav-item')]
}

function navEntry(label: string): HTMLElement | undefined {
  return navEntries().find((el) => el.textContent?.includes(label))
}

function topbarItem(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.topbar-item')].find((el) => el.textContent?.includes(label))
}

/** Título do card com o foco de estado, ou `null`. */
function focusedCardTitle(): string | null {
  const card = [...document.querySelectorAll('.content-card')].find(
    (el) => el.classList.contains('tv-focus') || el.querySelector('.tv-focus') !== null,
  )
  return card?.querySelector('.content-card-title')?.textContent ?? null
}

describe('MoviesScreen — contrato da feature 025', () => {
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

  // US1/AC1-AC3, US1/AC6, FR-001, FR-002, FR-003, FR-006, FR-027, FR-030, SC-007,
  // Constitution: "Voltar Restaura Foco e Posição" (reconciliação por id, não índice)
  it('sob a topbar, side nav V14 na ordem certa, e cada entrada lembra o último card focado', () => {
    const shell: VodShellProps = { sourceName: 'Sala', onGoHome: vi.fn(), onSwitchTop: vi.fn(), onOpenProfiles: vi.fn() }
    const { onBack } = renderMovies(shell)

    const filmes = topbarItem('Filmes')
    expect(filmes).toBeDefined()
    expect(filmes!.getAttribute('aria-current')).toBe('page')

    // Ordem: Sua biblioteca (★ Favoritos, ↺ Histórico), depois Catálogo (Todos + fonte).
    const order = ['Favoritos', 'Histórico', 'Todos', 'Ação', 'Drama'].map((label) =>
      navEntries().findIndex((el) => el.textContent?.includes(label)),
    )
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)

    // Sem navegação prévia: a primeira categoria real da fonte.
    expect(navEntry('Ação')?.classList.contains('tv-focus')).toBe(true)

    tap('ArrowRight') // entra em "Ação"
    expect(focusedCardTitle()).toBe('Filme A1')
    tap('ArrowRight')
    tap('ArrowRight')
    expect(focusedCardTitle()).toBe('Filme A3')

    tap('Escape') // RETURN na grade → side nav
    expect(navEntry('Ação')?.classList.contains('tv-focus')).toBe(true)
    tap('ArrowDown')
    tap('ArrowRight') // entra em "Drama": começa no primeiro card
    expect(focusedCardTitle()).toBe('Filme D1')

    tap('Escape')
    tap('ArrowUp')
    tap('ArrowRight') // volta a "Ação": restaura o último card focado ali
    expect(focusedCardTitle()).toBe('Filme A3')

    tap('Escape')
    tap('ArrowUp') // Todos
    tap('ArrowUp') // ↺ Histórico
    tap('ArrowUp') // ★ Favoritos
    expect(navEntry('Favoritos')?.classList.contains('tv-focus')).toBe(true)
    tap('ArrowUp') // sobe para a topbar, no destino atual
    expect(topbarItem('Filmes')?.classList.contains('tv-focus')).toBe(true)
    expect(document.querySelector('.side-category-nav-item.tv-focus')).toBeNull()
    tap('ArrowDown') // volta ao mesmo item
    expect(navEntry('Favoritos')?.classList.contains('tv-focus')).toBe(true)

    tap('Escape') // RETURN na side nav → Início
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
