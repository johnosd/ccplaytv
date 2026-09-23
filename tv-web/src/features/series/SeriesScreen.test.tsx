import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesScreen } from './SeriesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryFetchOutcome } from '../catalog/catalogApi'

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
  return { id, kind: 'series', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function series(name: string, group: string | null): CatalogItemOut {
  return { id: `id-${name}`, kind: 'series', name, original_group: group, published: true, playable: false }
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
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('SeriesScreen', () => {
  const onOpenSeries = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => {
    onOpenSeries.mockReset()
    onBack.mockReset()
    mockContentByCategory({})
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderSeries() {
    // `useCategoryFocusPrefetch` usa o QueryClient real (não é algo a
    // mockar) — precisa de um provider de verdade, mesmo com
    // useCategoryList/useCategoryContent mockados.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    function buildUi() {
      return (
        <QueryClientProvider client={queryClient}>
          <SeriesScreen sourceId="source-1" onOpenSeries={onOpenSeries} onBack={onBack} />
        </QueryClientProvider>
      )
    }
    const result = render(buildUi())
    return { ...result, rerenderSeries: () => result.rerender(buildUi()) }
  }

  it('mostra carregando com um elemento focável', () => {
    mockCategoriesState({ isLoading: true })
    const { container } = renderSeries()

    expect(screen.getByText(/Carregando séries/)).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mostra erro com saída focável', () => {
    mockCategoriesState({ isError: true })
    const { container } = renderSeries()

    expect(screen.getByText(/Não foi possível carregar as séries/)).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('nenhuma categoria: estado próprio, com saída focável', () => {
    mockCategories([])
    const { container } = renderSeries()

    expect(screen.getByText('Nenhuma série nesta lista')).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mover o foco entre categorias não consulta o conteúdo — só entrar consulta (T028)', () => {
    mockCategories([category(1, 'Comédia', 0), category(2, 'Drama', 1)])
    renderSeries()

    press('ArrowDown')
    press('ArrowUp')

    const calls = vi.mocked(catalogApi.useCategoryContent).mock.calls
    expect(calls.every(([, cat]) => cat === undefined)).toBe(true)
  })

  it('entrar na categoria mostra as séries dela, e selecionar uma abre o detalhe', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({ 1: [series('Série A', 'Comédia'), series('Série B', 'Comédia')] })
    renderSeries()

    press('ArrowRight')
    expect(screen.getByText('Série A')).toBeInTheDocument()
    expect(screen.getByText('Série B')).toBeInTheDocument()

    press('Enter')
    expect(onOpenSeries).toHaveBeenCalledWith('id-Série A')
  })

  it('categoria que nunca obteve itens e falhou mostra erro com "Tentar de novo"', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({}, 'failed')
    renderSeries()

    press('ArrowRight')

    expect(screen.getByText('Não foi possível carregar esta categoria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('foco por identidade: item que sumir do catálogo novo não estoura, cai no início', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({ 1: [series('Série A', 'Comédia'), series('Série B', 'Comédia')] })
    const { rerenderSeries } = renderSeries()

    press('ArrowRight')
    press('ArrowRight') // move dentro da grade para o segundo item

    mockContentByCategory({ 1: [series('Série A', 'Comédia')] })
    rerenderSeries()

    press('Enter')
    expect(onOpenSeries).toHaveBeenCalledWith('id-Série A')
  })
})
