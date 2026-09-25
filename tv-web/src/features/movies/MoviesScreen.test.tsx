import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoviesScreen } from './MoviesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryFetchOutcome } from '../catalog/catalogApi'

/**
 * jsdom não faz layout de verdade nem implementa `Element.scrollTo`
 * (feature 009, grade de pôsteres virtualizada por `@tanstack/react-virtual`
 * + `usePosterColumnWidth`). Mesmo bloco de `LiveScreen.test.tsx` — ver
 * `research.md` R0-4 para o porquê de cada mock (em especial
 * `clientHeight`/`scrollHeight`, sem os quais `scrollToIndex` fica
 * grampeado em 0).
 */
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
      // Assíncrono de propósito — ver o mesmo comentário em LiveScreen.test.tsx.
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })

  // `usePosterColumnWidth` só mede largura de verdade via `ResizeObserver` —
  // sem isto, `columnWidth` fica em 0 pra sempre e a grade nunca sai do
  // "estimateSize" mínimo (68px, só `POSTER_ROW_EXTRA_PX`).
  class FakeResizeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      this.callback(
        [{ contentRect: { width: 1200 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
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
    // Sem mock, tocaria IndexedDB/rede de verdade a cada movimento de
    // cursor — o pré-fetch em si tem teste próprio em catalogApi.test.tsx.
    useCategoryFocusPrefetch: vi.fn(),
  }
})

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, group: string | null): CatalogItemOut {
  return { id: `id-${name}`, kind: 'movie', name, original_group: group, published: true, playable: true }
}

function mockCategories(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockCategoriesState(state: { isLoading?: boolean; isError?: boolean }) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: undefined,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockContentByCategory(byId: Record<number, CatalogItemOut[]>, outcome: CategoryFetchOutcome = 'fresh') {
  const refetch = vi.fn()
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome },
      isLoading: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  return refetch
}

/**
 * Simula um toque rápido no controle. Para OK (feature 013), sem o
 * `keyup`, o gesto de "segurar" (agora possível sempre que um filme está
 * focado, `MoviesScreen.tsx`) nunca completaria como toque curto — o
 * `onSelect` só dispara no `keyup`.
 */
function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') {
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    }
  })
}

describe('MoviesScreen', () => {
  const onOpenMovie = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => {
    onOpenMovie.mockReset()
    onBack.mockReset()
    mockContentByCategory({})
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderMovies(onResync: () => void = vi.fn()) {
    // `useCategoryFocusPrefetch` usa o QueryClient real (não é algo a
    // mockar) — precisa de um provider de verdade, mesmo com
    // useCategoryList/useCategoryContent mockados.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    function buildUi() {
      return (
        <QueryClientProvider client={queryClient}>
          <MoviesScreen sourceId="source-1" onOpenMovie={onOpenMovie} onBack={onBack} onResync={onResync} />
        </QueryClientProvider>
      )
    }
    const result = render(buildUi())
    return { ...result, rerenderMovies: () => result.rerender(buildUi()) }
  }

  it('mostra carregando com um elemento focável', () => {
    mockCategoriesState({ isLoading: true })
    const { container } = renderMovies()

    expect(screen.getByText(/Carregando filmes/)).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mostra erro com saída focável', () => {
    mockCategoriesState({ isError: true })
    const { container } = renderMovies()

    expect(screen.getByText(/Não foi possível carregar os filmes/)).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('nenhuma categoria: estado próprio, com saída focável', () => {
    mockCategories([])
    const { container } = renderMovies()

    expect(screen.getByText('Nenhum filme nesta lista')).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mover o foco entre categorias não consulta o conteúdo — só entrar consulta (T028)', () => {
    mockCategories([category(1, 'Ação', 0), category(2, 'Comédia', 1)])
    renderMovies()

    press('ArrowDown')
    press('ArrowUp')

    const calls = vi.mocked(catalogApi.useCategoryContent).mock.calls
    expect(calls.every(([, cat]) => cat === undefined)).toBe(true)
  })

  it('categoria com milhares de filmes monta só uma fração deles no DOM, distribuída em GRID_COLS colunas (T013)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => movie(`Filme ${i}`, 'Ação'))
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: many })
    renderMovies()

    press('ArrowRight')

    const rendered = document.querySelectorAll('.poster-grid .poster-card-title')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(many.length)

    const lefts = new Set(
      [...document.querySelectorAll('.poster-grid .poster-cell')].map((el) => (el as HTMLElement).style.left),
    )
    expect(lefts.size).toBe(6)
  })

  it('entrar na categoria mostra os filmes dela, e selecionar um abre o detalhe', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'Ação'), movie('Filme B', 'Ação')] })
    renderMovies()

    press('ArrowRight') // entra
    expect(screen.getByText('Filme A')).toBeInTheDocument()
    expect(screen.getByText('Filme B')).toBeInTheDocument()

    press('Enter')
    expect(onOpenMovie).toHaveBeenCalledWith('id-Filme A')
  })

  it('filme com icon_url mostra a capa real; sem icon_url continua no placeholder (feature 015)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({
      1: [
        { ...movie('Com Capa', 'Ação'), icon_url: 'http://exemplo.test/capa.png' },
        movie('Sem Capa', 'Ação'),
      ],
    })
    const { container } = renderMovies()

    press('ArrowRight')

    const cards = [...container.querySelectorAll('.poster-cell')]
    const comCapa = cards.find((c) => c.textContent?.includes('Com Capa'))
    const semCapa = cards.find((c) => c.textContent?.includes('Sem Capa'))

    expect(comCapa?.querySelector('img.poster-box-art')).toHaveAttribute('src', 'http://exemplo.test/capa.png')
    expect(semCapa?.querySelector('img.poster-box-art')).not.toBeInTheDocument()
  })

  it('categoria que nunca obteve itens e falhou mostra erro com "Tentar de novo"', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({}, 'failed')
    renderMovies()

    press('ArrowRight')

    expect(screen.getByText('Não foi possível carregar esta categoria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('SELECT em "Tentar de novo" aciona a nova tentativa (achado corrigido junto com a feature 014)', () => {
    mockCategories([category(1, 'Ação', 0)])
    const refetch = mockContentByCategory({}, 'failed')
    renderMovies()

    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    press('Enter')

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('categoria stored sem arquivo guardado mostra "Ressincronizar lista", e SELECT aciona onResync (feature 014, D-008)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({}, 'source_missing')
    const onResync = vi.fn()
    renderMovies(onResync)

    press('ArrowRight')

    expect(screen.getByText('O conteúdo desta lista não está mais no aparelho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ressincronizar lista' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()

    press('Enter')
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('foco por identidade: item que sumir do catálogo novo não estoura, cai no início', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'Ação'), movie('Filme B', 'Ação')] })
    const { rerenderMovies } = renderMovies()

    press('ArrowRight')
    press('ArrowRight') // move dentro da grade para o segundo item

    mockContentByCategory({ 1: [movie('Filme A', 'Ação')] })
    rerenderMovies()

    press('Enter')
    // Não estourou, e abriu o que sobrou — não um índice fantasma.
    expect(onOpenMovie).toHaveBeenCalledWith('id-Filme A')
  })
})
