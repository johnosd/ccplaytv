import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoviesScreen } from './MoviesScreen'
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

  function renderMovies() {
    // `useCategoryFocusPrefetch` usa o QueryClient real (não é algo a
    // mockar) — precisa de um provider de verdade, mesmo com
    // useCategoryList/useCategoryContent mockados.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    function buildUi() {
      return (
        <QueryClientProvider client={queryClient}>
          <MoviesScreen sourceId="source-1" onOpenMovie={onOpenMovie} onBack={onBack} />
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

  it('categoria que nunca obteve itens e falhou mostra erro com "Tentar de novo"', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({}, 'failed')
    renderMovies()

    press('ArrowRight')

    expect(screen.getByText('Não foi possível carregar esta categoria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
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
