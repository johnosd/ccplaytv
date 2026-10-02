/**
 * Hero band (FR-025/FR-026) e memória de foco entre montagens (feature 025,
 * T035) — testes que não fazem parte do contrato travado
 * (`MoviesScreen.filmes-series-ds-v14.contract.test.tsx`), mas cobrem o
 * mesmo mecanismo compartilhado por Filmes/Séries.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCatalogScreen } from './VodCatalogScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { updateProgress } from '../../lib/catalog/userStateRepository'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

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
    resolveCatalogItemId: vi.fn(async (itemId: string) => itemId),
    // Favoritos/assistidos/histórico/retomada: reais, contra fake-indexeddb.
  }
})

const SOURCE_ID = 'source-vod-catalog'

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, streamId: string, year?: number): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: streamId,
    original_name: name,
    year: year ?? null,
  }
}

function mockCategories(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockContentByCategory(byId: Record<number, CatalogItemOut[]>) {
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
}

function mockAggregated(items: CatalogItemOut[]) {
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items,
    coveredCategories: 0,
    totalCategories: 0,
    isLoading: false,
  })
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

async function seedSource(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte de teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
}

describe('VodCatalogScreen — hero band (FR-025/FR-026) e memória entre montagens (feature 025, T035)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockAggregated([])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  function renderMovies() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    return render(
      <Wrapper>
        <VodCatalogScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )
  }

  it('acompanha o foco: mostra capa, título e metadados reais do card focado, sem sinopse', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2019), movie('Filme B', 'b', 2020)] })
    renderMovies()

    press('ArrowRight') // entra em "Ação", foco no 1º card

    const hero = document.querySelector('.vod-hero-band')
    expect(hero).not.toBeNull()
    expect(hero?.querySelector('.vod-hero-title')?.textContent).toBe('Filme A')
    expect(hero?.textContent).toContain('2019')
    expect(hero?.textContent).not.toContain('2020')

    press('ArrowRight') // move o foco para "Filme B"
    expect(document.querySelector('.vod-hero-band .vod-hero-title')?.textContent).toBe('Filme B')
    expect(document.querySelector('.vod-hero-band')?.textContent).toContain('2020')
  })

  // Feature 028, FR-007/FR-009: SELECT em "Voltar" devolve o foco à trilha (achado real — não roteava, T021).
  it('carregando: SELECT em "Voltar" devolve o foco à trilha', () => {
    mockCategories([category(1, 'Ação', 0)])
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    renderMovies()

    press('ArrowRight') // entra em "Ação" — conteúdo ainda carregando
    press('Enter')
    expect(document.querySelector('.side-category-nav-item.tv-focus')).not.toBeNull()
  })

  it('categoria vazia (sem falha): SELECT em "Voltar" devolve o foco à trilha', () => {
    mockCategories([category(1, 'Vazia', 0)])
    mockContentByCategory({ 1: [] })
    renderMovies()

    press('ArrowRight') // entra em "Vazia"
    expect(screen.getByText('Esta categoria está vazia.')).toBeInTheDocument()
    press('Enter')
    expect(document.querySelector('.side-category-nav-item.tv-focus')).not.toBeNull()
  })

  it('"Todos" vazio: SELECT em "Voltar" devolve o foco à trilha', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockAggregated([]) // "Todos" sem nenhum item agregado
    renderMovies()

    press('ArrowUp') // trilha: Ação (3) -> Todos (2)
    press('ArrowRight') // entra em "Todos" (vazio)
    press('Enter')
    expect(document.querySelector('.side-category-nav-item.tv-focus')).not.toBeNull()
  })

  // Feature 039 (T022): "Todos" aos poucos — a tela pede a próxima página perto do fim.
  it('"Todos" na ordem da fonte lê aos poucos e pede mais quando o foco chega a 10 fileiras do fim', () => {
    mockCategories([category(1, 'Ação', 0)])
    const loadMore = vi.fn()
    const loaded = Array.from({ length: 120 }, (_, i) => movie(`Filme ${i}`, `m${i}`))
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: loaded,
      coveredCategories: 1,
      totalCategories: 1,
      isLoading: false,
      hasMore: true,
      loadMore,
    })
    renderMovies()

    press('ArrowUp') // trilha: Ação -> Todos
    press('ArrowRight') // entra em "Todos"
    expect(vi.mocked(catalogApi.useAggregatedItems)).toHaveBeenLastCalledWith(SOURCE_ID, 'movie', true, { progressive: true })
    expect(loadMore).not.toHaveBeenCalled() // 1º card, longe do fim (120 lidos)

    for (let row = 0; row < 9; row += 1) press('ArrowDown')
    expect(loadMore).not.toHaveBeenCalled() // fileira 10: índice 54 < 120 − 60
    press('ArrowDown') // fileira 11: índice 60 = 120 − 60
    expect(loadMore).toHaveBeenCalled()
  })

  it('"Todos" com a busca aberta lê o tipo inteiro (sem aos poucos)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockAggregated([movie('Filme A', 'a')])
    renderMovies()

    press('ArrowUp') // Todos
    press('ArrowRight') // entra
    press('ArrowUp') // grade -> "Pesquisar"
    press('Enter') // abre a busca
    expect(vi.mocked(catalogApi.useAggregatedItems)).toHaveBeenLastCalledWith(SOURCE_ID, 'movie', true, { progressive: false })
  })

  function renderAllRestoringFocus(focusedItemId: string, loadMore: () => void) {
    mockCategories([category(1, 'Ação', 0)])
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: Array.from({ length: 300 }, (_, i) => movie(`Filme ${i}`, `m${i}`)),
      coveredCategories: 1,
      totalCategories: 1,
      isLoading: false,
      hasMore: true,
      loadMore,
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <VodCatalogScreen
          section="movies"
          sourceId={SOURCE_ID}
          onOpenItem={vi.fn()}
          onBack={vi.fn()}
          onResync={vi.fn()}
          restore={{
            trailKey: { kind: 'all' },
            entered: { kind: 'all' },
            col: 1,
            focusedItemId,
            searchTerm: '',
            searchActive: false,
          }}
        />
      </QueryClientProvider>,
    )
  }

  it('voltar a "Todos" com um item focado que saiu da lista não lê o tipo inteiro atrás dele', async () => {
    vi.mocked(catalogApi.resolveCatalogItemId).mockResolvedValueOnce(null)
    const loadMore = vi.fn()
    renderAllRestoringFocus('id-Saiu', loadMore)
    await waitFor(() => expect(catalogApi.resolveCatalogItemId).toHaveBeenCalledWith('id-Saiu'))
    await act(async () => {})
    expect(loadMore).not.toHaveBeenCalled()
  })

  it('voltar a "Todos" com o item focado ainda não lido continua lendo páginas até ele aparecer', async () => {
    const loadMore = vi.fn()
    renderAllRestoringFocus('id-Filme 5000', loadMore)
    await waitFor(() => expect(loadMore).toHaveBeenCalled())
  })

  it('erro de conteúdo: SELECT em "Tentar de novo" chama o refetch', () => {
    mockCategories([category(1, 'Ação', 0)])
    const refetch = vi.fn()
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [], totalCount: 0, outcome: 'failed' },
      isLoading: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    renderMovies()

    press('ArrowRight') // entra em "Ação" — conteúdo falhou
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass('tv-focus')
    press('Enter')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  // Feature 028, FR-001: barra nativa escondida na trilha e na grade, sem trocar overflow por hidden.
  it('trilha e grade têm .no-scrollbar', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a')] })
    renderMovies()

    press('ArrowRight') // entra em "Ação", grade renderiza

    expect(document.querySelector('.vod-side-nav')).toHaveClass('no-scrollbar')
    expect(document.querySelector('.vod-grid')).toHaveClass('no-scrollbar')
  })

  it('some quando a entrada não tem itens (carregando/vazio)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [] })
    renderMovies()

    press('ArrowRight') // entra em "Ação", vazia

    expect(document.querySelector('.vod-hero-band')).toBeNull()
  })

  it('mostra "Continuar de mm:ss" para filme com retomada, nunca uma barra sem duração', async () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a')] })
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 125)
    renderMovies()

    press('ArrowRight')

    expect(await screen.findByText('Continuar de 2:05')).toBeInTheDocument()
    expect(document.querySelector('.vod-hero-band progress')).toBeNull()
  })

  it('nunca dispara leitura ao mudar o foco — hero band vem só de dados já carregados (D-014)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b')] })
    renderMovies()

    press('ArrowRight') // entra em "Ação"
    press('ArrowRight') // move o foco dentro da grade já carregada
    press('ArrowLeft')

    // `useCategoryContent` nunca é chamado com outra categoria/id além da
    // que foi de fato ENTRADA — mover o foco na grade não pede conteúdo
    // novo, só troca o que a hero band (e o card) já tinham em memória.
    const categoriesRequested = vi
      .mocked(catalogApi.useCategoryContent)
      .mock.calls.map(([, cat]) => cat?.id)
      .filter((id) => id !== undefined)
    expect(new Set(categoriesRequested)).toEqual(new Set([1]))
  })

  it('memória de foco por entrada sobrevive a desmontar e remontar a tela (ida ao Início e volta)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b'), movie('Filme C', 'c')] })
    const { unmount } = renderMovies()

    press('ArrowRight') // entra em "Ação", foco em "Filme A"
    press('ArrowRight') // "Filme B"
    press('ArrowRight') // "Filme C"
    expect(document.querySelector('.vod-hero-band .vod-hero-title')?.textContent).toBe('Filme C')

    unmount() // sair da tela (ida ao Início) — vodSessionMemory é módulo, sobrevive

    renderMovies()
    press('ArrowRight') // volta a "Ação": restaura o último card focado ali

    expect(document.querySelector('.vod-hero-band .vod-hero-title')?.textContent).toBe('Filme C')
  })
})

describe('VodCatalogScreen — nomes acessíveis (feature 028, FR-015/FR-017)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockAggregated([])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  function renderMovies() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    return render(
      <Wrapper>
        <VodCatalogScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )
  }

  it('grade com itens', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b')] })
    const { container } = renderMovies()
    press('ArrowRight')
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('busca aberta dentro da categoria', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a')] })
    const { container } = renderMovies()
    press('ArrowRight')
    press('ArrowUp') // grade -> "Pesquisar"
    press('Enter') // abre o campo
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('categoria vazia', () => {
    mockCategories([category(1, 'Vazia', 0)])
    mockContentByCategory({ 1: [] })
    const { container } = renderMovies()
    press('ArrowRight')
    expect(screen.getByText('Esta categoria está vazia.')).toBeInTheDocument()
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('erro de conteúdo', () => {
    mockCategories([category(1, 'Ação', 0)])
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [], totalCount: 0, outcome: 'failed' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    const { container } = renderMovies()
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})

/** Títulos na grade (mesmo cuidado do `gridTitles` dos testes de tela — hero band duplica o texto do item focado). */
function gridTitles(): string[] {
  return [...document.querySelectorAll('.vod-grid .content-card-title')].map((el) => el.textContent ?? '')
}

function navEntryText(label: string): string | undefined {
  return [...document.querySelectorAll<HTMLElement>('.side-category-nav-item')]
    .find((el) => el.textContent?.includes(label))
    ?.textContent
}

describe('VodCatalogScreen — "↺ Histórico" (feature 025, US2, T041)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({})
    mockAggregated([])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  function renderMovies(onOpenItem: (id: string, snapshot?: unknown) => void = vi.fn(), restore?: never) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    return render(
      <Wrapper>
        <VodCatalogScreen
          section="movies"
          sourceId={SOURCE_ID}
          onOpenItem={onOpenItem}
          onBack={vi.fn()}
          onResync={vi.fn()}
          restore={restore}
        />
      </Wrapper>,
    )
  }

  /** Sobe da categoria padrão (Todos, Histórico) e entra em "↺ Histórico". */
  function navigateToHistory() {
    press('ArrowUp') // "Todos"
    press('ArrowUp') // "↺ Histórico"
    press('ArrowRight') // entra
  }

  async function seedMovie(name: string, streamId: string): Promise<number> {
    const id = await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name,
      originalName: name,
      groupOrder: 0,
      providerStreamId: streamId,
    })
    return id as number
  }

  it('lista os reproduzidos do mais recente pro mais antigo, com concluídos; a contagem só aparece depois da 1ª entrada', async () => {
    await seedMovie('Filme A', 'a')
    await seedMovie('Filme B', 'b')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100) // reproduzido primeiro
    await updateProgress(`${SOURCE_ID}|movie|id:b`, SOURCE_ID, 50)
    await db.userStates.update(`${SOURCE_ID}|movie|id:b`, { completedAt: Date.now() }) // concluído, mais recente

    renderMovies()

    // Antes de entrar: nenhuma contagem (FR-007) — "Histórico" sozinho.
    expect(navEntryText('Histórico')).toBe('Histórico')

    navigateToHistory()

    await waitFor(() => expect(gridTitles()).toEqual(['Filme B', 'Filme A'])) // aguarda a consulta resolver
    expect(navEntryText('Histórico')).toBe('Histórico2')
  })

  it('vazio: estado instrutivo com "Voltar" focável, sem beco sem saída', async () => {
    renderMovies()
    navigateToHistory()

    expect(await screen.findByText('Seu histórico está vazio')).toBeInTheDocument()
    expect(screen.getByText(/reproduzidos neste perfil aparecerão aqui/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
  })

  it('reprodução sem correspondência no catálogo atual não vira card — nota diz quantas, nunca inventa título/capa', async () => {
    await seedMovie('Filme A', 'a')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    await updateProgress(`${SOURCE_ID}|movie|id:removido`, SOURCE_ID, 200) // sem registro correspondente

    renderMovies()
    navigateToHistory()

    await waitFor(() => expect(gridTitles()).toEqual(['Filme A']))
    expect(screen.getByText('1 filme assistido não está mais nesta lista.')).toBeInTheDocument()
  })

  it('sem "Ordenar" dentro de "↺ Histórico" (FR-022 — ordem própria, mais recente primeiro)', async () => {
    await seedMovie('Filme A', 'a')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    renderMovies()
    navigateToHistory()

    await waitFor(() => expect(gridTitles()).toEqual(['Filme A']))
    expect(document.querySelector('[class*="sort"]')).toBeNull()
    expect(screen.queryByText('Ordenar')).not.toBeInTheDocument()
  })

  it('OK abre o detalhe com snapshot {kind:"history"}; devolvido ao remontar, restaura a entrada e o card', async () => {
    await seedMovie('Filme A', 'a')
    const idB = await seedMovie('Filme B', 'b')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    await updateProgress(`${SOURCE_ID}|movie|id:b`, SOURCE_ID, 200)

    const onOpenItem = vi.fn()
    renderMovies(onOpenItem)
    navigateToHistory()
    await waitFor(() => expect(gridTitles()).toEqual(['Filme B', 'Filme A']))

    press('Enter') // hero/card focado por padrão: "Filme B" (mais recente)
    // `press` não dispara `keyup`; OK real precisa do gesto completo (feature 013).
    act(() => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })))

    expect(onOpenItem).toHaveBeenCalledTimes(1)
    const [openedId, snapshot] = onOpenItem.mock.calls[0]
    expect(openedId).toBe(String(idB))
    expect(snapshot).toMatchObject({
      trailKey: { kind: 'history' },
      entered: { kind: 'history' },
      focusedItemId: String(idB),
    })

    cleanup()
    renderMovies(vi.fn(), snapshot)
    await waitFor(() => expect(gridTitles().length).toBeGreaterThan(0))
    const focusedCell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
    expect(focusedCell?.querySelector('.content-card-title')?.textContent).toBe('Filme B')
  })
})

describe('VodCatalogScreen — Ordenar (feature 025, US4, T050)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockAggregated([])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  function renderMovies() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    return render(
      <Wrapper>
        <VodCatalogScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )
  }

  /** Sobe da grade até o botão "Ordenar" (Pesquisar → Ordenar) e abre o modal. */
  function openSortFromGrid() {
    press('ArrowUp') // 1ª linha da grade -> "Pesquisar"
    press('ArrowRight') // "Pesquisar" -> "Ordenar"
    press('Enter') // abre o modal
  }

  function sortModalLabels(): string[] {
    return [...document.querySelectorAll('.vod-sort-modal-item')].map((el) => el.textContent ?? '')
  }

  it('só oferece opções com dado real na entrada; escolher "Ano" reordena e itens sem ano vão ao fim', async () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b'), movie('Filme C', 'c', 2020)] })
    renderMovies()

    press('ArrowRight') // entra em "Ação"
    openSortFromGrid()

    // Sem `added_at` em nenhum item: "Recém-adicionados" não aparece.
    // "✓" marca a opção atual (padrão: "Ordem da fonte").
    expect(sortModalLabels()).toEqual(['✓ Ordem da fonte', 'A–Z', 'Ano'])

    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter') // escolhe

    expect(document.querySelector('.vod-toolbar-sort-button')?.textContent).toBe('Ordenar · Ano ▾')
    expect(gridTitles()).toEqual(['Filme C', 'Filme A', 'Filme B']) // mais novo primeiro; sem ano no fim
  })

  // Feature 039, T033: "Todos" aos poucos só tem parte do tipo lida — "Ano" vem do tipo inteiro.
  it('"Todos" aos poucos: o modal oferece "Ano" mesmo se só uma categoria ainda não lida declara ano', async () => {
    const [categoryId] = await storeCategories([
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Lá embaixo', order: 9, providerCategoryId: '9' },
    ])
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 9 },
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Com ano', originalName: 'Com ano', groupOrder: 9, providerStreamId: 'y', year: 1999 }],
      1,
    )
    mockCategories([category(1, 'Ação', 0)])
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: [movie('Filme A', 'a'), movie('Filme B', 'b')], // sem ano: só a 1ª página lida
      coveredCategories: 1,
      totalCategories: 2,
      isLoading: false,
      hasMore: true,
      loadMore: vi.fn(),
    })
    renderMovies()

    press('ArrowUp') // Ação -> Todos
    press('ArrowRight') // entra em "Todos"
    openSortFromGrid()

    await waitFor(() => expect(sortModalLabels()).toEqual(['✓ Ordem da fonte', 'A–Z', 'Ano']))
    await db.categoryBlocks.delete(categoryId)
    await db.categories.delete(categoryId)
  })

  it('o foco segue o mesmo item (por identidade) depois de reordenar, visível na nova posição', async () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b', 2020)] })
    renderMovies()

    press('ArrowRight') // entra na grade (índice 0)
    // Estabelece o foco por IDENTIDADE em "Filme A" (ida e volta) — sem
    // isso, `focusedItemId` continua `null` (o índice 0 é só fallback de
    // `locate()`, não identidade real) e o teste não provaria FR-024.
    press('ArrowRight')
    press('ArrowLeft')
    openSortFromGrid()
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter') // escolhe — o foco (de estado) volta ao botão "Ordenar", nunca à grade (FR-018)

    // "Filme A" (2001) foi para a 2ª posição — a ordem já reflete isso.
    expect(gridTitles()).toEqual(['Filme B', 'Filme A'])
    expect(document.querySelector('.vod-toolbar-sort-button')).toHaveClass('tv-focus')

    // O item lembrado (por identidade, nunca índice) sobrevive: sair da
    // grade e voltar à MESMA categoria devolve o foco a "Filme A", agora na
    // 2ª posição (FR-024) — sem reabrir "Ordenar" nem tocar `focusedItemId`.
    press('Escape') // "Ordenar" -> side nav (a mesma tecla, quando não há busca em camada)
    press('ArrowRight') // reentra em "Ação" — a mesma categoria, foco preservado
    const focusedCell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
    expect(focusedCell?.querySelector('.content-card-title')?.textContent).toBe('Filme A')
  })

  it('a ordenação escolhida vale para outra categoria da mesma seção e sobrevive a desmontar/remontar', async () => {
    mockCategories([category(1, 'Ação', 0), category(2, 'Drama', 1)])
    mockContentByCategory({
      1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b', 2020)],
      2: [movie('Filme D', 'd', 1999), movie('Filme E', 'e', 2015)],
    })
    const { unmount } = renderMovies()

    press('ArrowRight') // entra em "Ação"
    openSortFromGrid()
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter')
    expect(gridTitles()).toEqual(['Filme B', 'Filme A'])

    press('Escape') // volta à side nav
    press('ArrowDown')
    press('ArrowRight') // entra em "Drama" — mesma seção, mesma ordenação
    expect(gridTitles()).toEqual(['Filme E', 'Filme D'])

    unmount() // ida ao Início — vodSessionMemory sobrevive (só reseta ao reabrir o app)
    renderMovies()
    press('ArrowRight') // entra em "Ação" de novo
    expect(gridTitles()).toEqual(['Filme B', 'Filme A'])
  })

  it('RETURN no modal fecha sem mudar nada, e o foco volta ao botão "Ordenar"', async () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b', 2020)] })
    renderMovies()

    press('ArrowRight')
    openSortFromGrid()
    press('ArrowDown') // foca "Ano", sem escolher
    press('Escape') // RETURN no modal

    expect(document.querySelector('.modal-overlay')).toBeNull()
    expect(document.querySelector('.vod-toolbar-sort-button')?.textContent).toBe('Ordenar · Ordem da fonte ▾')
    expect(document.querySelector('.vod-toolbar-sort-button')).toHaveClass('tv-focus')
    expect(gridTitles()).toEqual(['Filme A', 'Filme B']) // ordem da fonte, inalterada
  })

  it('nunca oferece "Ordenar" em "★ Favoritos" (FR-022)', async () => {
    await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme Favorito',
      originalName: 'Filme Favorito',
      groupOrder: 0,
      providerStreamId: 'fav1',
    })
    await db.userStates.put({
      stableId: `${SOURCE_ID}|movie|id:fav1`,
      sourceId: SOURCE_ID,
      isFavorite: true,
      favoritedAt: 100,
      createdAt: 100,
      updatedAt: 100,
    })
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [] })
    renderMovies()

    press('ArrowUp') // "Todos"
    press('ArrowUp') // "↺ Histórico"
    press('ArrowUp') // "★ Favoritos"
    press('ArrowRight') // entra

    await waitFor(() => expect(gridTitles()).toEqual(['Filme Favorito']))
    expect(document.querySelector('.vod-toolbar-sort-button')).toBeNull()
  })

  it('nunca oferece "Ordenar" em "↺ Histórico" (FR-022)', async () => {
    await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme Visto',
      originalName: 'Filme Visto',
      groupOrder: 0,
      providerStreamId: 'watched1',
    })
    await updateProgress(`${SOURCE_ID}|movie|id:watched1`, SOURCE_ID, 30)
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [] })
    renderMovies()

    press('ArrowUp') // "Todos"
    press('ArrowUp') // "↺ Histórico"
    press('ArrowRight') // entra

    await waitFor(() => expect(gridTitles()).toEqual(['Filme Visto']))
    expect(document.querySelector('.vod-toolbar-sort-button')).toBeNull()
  })

  it('busca e ordenação ativas juntas: o resultado filtrado aparece na ordem escolhida (FR-023)', async () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({
      1: [movie('Filme Alfa', 'a', 2001), movie('Filme Beta', 'b', 2020), movie('Filme Gama', 'c', 2010)],
    })
    renderMovies()

    press('ArrowRight')
    openSortFromGrid()
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter')
    expect(gridTitles()).toEqual(['Filme Beta', 'Filme Gama', 'Filme Alfa'])

    press('ArrowLeft') // "Ordenar" -> "Pesquisar"
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'filme' } }))
    // Os três têm "filme" no nome — o resultado (idêntico à base) segue "Ano".
    await waitFor(() => expect(gridTitles()).toEqual(['Filme Beta', 'Filme Gama', 'Filme Alfa']))
  })
})

describe('VodCatalogScreen — initialTopbarItem (feature 026, FR-034/FR-044)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({})
    mockAggregated([])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
  })

  function renderWithShell(initialTopbarItem?: 'search' | 'settings') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    return render(
      <Wrapper>
        <VodCatalogScreen
          section="movies"
          sourceId={SOURCE_ID}
          onOpenItem={vi.fn()}
          onBack={vi.fn()}
          onResync={vi.fn()}
          initialTopbarItem={initialTopbarItem}
          shell={{
            sourceName: 'Sala',
            onGoHome: vi.fn(),
            onSwitchTop: vi.fn(),
            onOpenProfiles: vi.fn(),
          }}
        />
      </Wrapper>,
    )
  }

  it('sem initialTopbarItem, começa com o foco no conteúdo (comportamento de sempre)', () => {
    renderWithShell()
    expect(document.querySelectorAll('.topbar .tv-focus')).toHaveLength(0)
  })

  it('com initialTopbarItem, remonta com a topbar já ativa nesse item (volta de Busca/Configurações)', () => {
    renderWithShell('search')
    expect(screen.getByRole('button', { name: 'Buscar' })).toHaveClass('tv-focus')
  })
})
