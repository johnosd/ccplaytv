import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesScreen } from './SeriesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryFetchOutcome } from '../catalog/catalogApi'
import type { CategoryScreenSnapshot } from '../catalog/categoryScreenSnapshot'
import { db } from '../../lib/catalog/db'
import { buildStableId } from '../../lib/catalog/userStateRepository'

/**
 * jsdom não faz layout de verdade nem implementa `Element.scrollTo`
 * (feature 009, grade de pôsteres virtualizada por `@tanstack/react-virtual`
 * + `usePosterColumnWidth`). Mesmo bloco de `LiveScreen.test.tsx`/
 * `MoviesScreen.test.tsx` — ver `research.md` R0-4 para o porquê de cada
 * mock (em especial `clientHeight`/`scrollHeight`, sem os quais
 * `scrollToIndex` fica grampeado em 0).
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
    useAggregatedItems: vi.fn(),
  }
})

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'series', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function series(name: string, group: string | null, seriesId?: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'series',
    name,
    original_group: group,
    published: true,
    playable: false,
    series_id: seriesId ?? null,
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

function mockAggregated(items: CatalogItemOut[], coveredCategories = 1, totalCategories = 1) {
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items,
    coveredCategories,
    totalCategories,
    isLoading: false,
  })
}

/**
 * Simula um toque rápido no controle. Para OK (feature 013), sem o
 * `keyup`, o gesto de "segurar" (agora possível sempre que uma série está
 * focada, `SeriesScreen.tsx`) nunca completaria como toque curto — o
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

describe('SeriesScreen', () => {
  const onOpenSeries = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => {
    onOpenSeries.mockReset()
    onBack.mockReset()
    mockContentByCategory({})
    mockAggregated([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderSeries(onResync: () => void = vi.fn(), restore?: CategoryScreenSnapshot) {
    // `useCategoryFocusPrefetch` usa o QueryClient real (não é algo a
    // mockar) — precisa de um provider de verdade, mesmo com
    // useCategoryList/useCategoryContent mockados.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    function buildUi() {
      return (
        <QueryClientProvider client={queryClient}>
          <SeriesScreen
            sourceId="source-1"
            onOpenSeries={onOpenSeries}
            onBack={onBack}
            onResync={onResync}
            restore={restore}
          />
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

  it('categoria com milhares de séries monta só uma fração delas no DOM, distribuída em GRID_COLS colunas (T014)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => series(`Série ${i}`, 'Comédia'))
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({ 1: many })
    renderSeries()

    press('ArrowRight')

    const rendered = document.querySelectorAll('.poster-grid .poster-card-title')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(many.length)

    const lefts = new Set(
      [...document.querySelectorAll('.poster-grid .poster-cell')].map((el) => (el as HTMLElement).style.left),
    )
    expect(lefts.size).toBe(6)
  })

  it('entrar na categoria mostra as séries dela, e selecionar uma abre o detalhe', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({ 1: [series('Série A', 'Comédia'), series('Série B', 'Comédia')] })
    renderSeries()

    press('ArrowRight')
    expect(screen.getByText('Série A')).toBeInTheDocument()
    expect(screen.getByText('Série B')).toBeInTheDocument()

    press('Enter')
    expect(onOpenSeries).toHaveBeenCalledWith('id-Série A', expect.any(Object))
  })

  it('série com icon_url mostra a capa real; sem icon_url continua no placeholder (feature 015)', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({
      1: [
        { ...series('Com Capa', 'Comédia'), icon_url: 'http://exemplo.test/capa.png' },
        series('Sem Capa', 'Comédia'),
      ],
    })
    const { container } = renderSeries()

    press('ArrowRight')

    const cards = [...container.querySelectorAll('.poster-cell')]
    const comCapa = cards.find((c) => c.textContent?.includes('Com Capa'))
    const semCapa = cards.find((c) => c.textContent?.includes('Sem Capa'))

    expect(comCapa?.querySelector('img.poster-box-art')).toHaveAttribute('src', 'http://exemplo.test/capa.png')
    expect(semCapa?.querySelector('img.poster-box-art')).not.toBeInTheDocument()
  })

  it('categoria que nunca obteve itens e falhou mostra erro com "Tentar de novo"', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({}, 'failed')
    renderSeries()

    press('ArrowRight')

    expect(screen.getByText('Não foi possível carregar esta categoria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('SELECT em "Tentar de novo" aciona a nova tentativa (achado corrigido junto com a feature 014)', () => {
    mockCategories([category(1, 'Comédia', 0)])
    const refetch = mockContentByCategory({}, 'failed')
    renderSeries()

    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    press('Enter')

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('categoria stored sem arquivo guardado mostra "Ressincronizar lista", e SELECT aciona onResync (feature 014, D-008)', () => {
    mockCategories([category(1, 'Comédia', 0)])
    mockContentByCategory({}, 'source_missing')
    const onResync = vi.fn()
    renderSeries(onResync)

    press('ArrowRight')

    expect(screen.getByText('O conteúdo desta lista não está mais no aparelho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ressincronizar lista' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()

    press('Enter')
    expect(onResync).toHaveBeenCalledTimes(1)
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
    expect(onOpenSeries).toHaveBeenCalledWith('id-Série A', expect.any(Object))
  })

  // T023 (feature 018): mesmo ciclo abrir-resultado → snapshot → remontar do
  // contrato de Filmes (`MoviesScreen.busca-categoria.contract.test.tsx`
  // equivalente — feature 017 tinha renumerado este teste como T023, mesmo
  // papel aqui), aqui como teste adicional não-travado — Séries ficou fora
  // do orçamento de 5 contratos (D-007: reusa o mesmo mecanismo de
  // busca/snapshot de Filmes).
  it('busca dentro de categoria: abrir um resultado entrega um snapshot que, devolvido ao remontar, restaura termo, resultados e foco (T023)', () => {
    mockCategories([category(1, 'Drama', 0)])
    mockContentByCategory({ 1: [series('Breaking Bad', 'Drama'), series('Better Call Saul', 'Drama')] })
    renderSeries()

    press('ArrowRight') // entra em "Drama" (padrão: 1ª categoria real)
    press('ArrowUp') // 1º item -> ícone
    press('Enter') // abre o campo

    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(field).not.toBeNull()
    expect(field!.value).toBe('')
    act(() => {
      fireEvent.change(field!, { target: { value: 'break' } })
    })

    press('ArrowDown') // do campo para o primeiro resultado
    press('Enter')

    expect(onOpenSeries).toHaveBeenCalledTimes(1)
    const [openedId, snapshot] = onOpenSeries.mock.calls[0] as [string, CategoryScreenSnapshot | undefined]
    expect(openedId).toBe('id-Breaking Bad')
    expect(snapshot).toBeDefined()

    // Ida ao detalhe: o App desmonta a tela; na volta, remonta com o snapshot.
    cleanup()
    mockCategories([category(1, 'Drama', 0)])
    mockContentByCategory({ 1: [series('Breaking Bad', 'Drama'), series('Better Call Saul', 'Drama')] })
    renderSeries(vi.fn(), snapshot)

    expect(document.querySelector<HTMLInputElement>('input.search-field')?.value).toBe('break')
    const focusedCell = [...document.querySelectorAll('.poster-cell')].find((c) => c.querySelector('.tv-focus'))
    expect(focusedCell?.querySelector('.poster-card-title')?.textContent).toBe('Breaking Bad')
  })

  // T023 (feature 018, US2): "Todos" lista séries de mais de uma categoria
  // sem buscar, mostra cobertura parcial, e busca dentro dela funciona —
  // espelha o contrato de Live TV, fora do orçamento de 5 contratos.
  it('"Todos" lista séries de mais de uma categoria sem buscar, mostra cobertura parcial, e busca dentro dela funciona', () => {
    mockCategories([category(1, 'Drama', 0), category(2, 'Comédia', 1)])
    mockContentByCategory({ 1: [series('Breaking Bad', 'Drama')] })
    // "Comédia" nunca foi aberta — só 1 de 2 categorias cobertas.
    mockAggregated([series('Breaking Bad', 'Drama'), series('Better Call Saul', 'Drama')], 1, 2)
    renderSeries()

    press('ArrowUp') // de "Drama" (padrão) para "Todos"
    press('ArrowRight') // entra em "Todos"

    const titlesBeforeSearch = [...document.querySelectorAll('.poster-card-title')].map((t) => t.textContent)
    expect(titlesBeforeSearch.sort()).toEqual(['Better Call Saul', 'Breaking Bad'].sort())
    expect(document.body.textContent).toContain('Busca em 1 de 2 categorias')

    press('ArrowUp') // 1º item -> ícone
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'saul' } }))

    const titlesAfterSearch = [...document.querySelectorAll('.poster-card-title')].map((t) => t.textContent)
    expect(titlesAfterSearch).toEqual(['Better Call Saul'])
  })

  // Achado no gate final desta feature (T029): `loadCategoryContent` sempre
  // lê `channels`, que pode reter registros de uma geração anterior mesmo
  // com outcome `source_missing`/`failed` — o ícone não pode se guiar só
  // por `baseSeries.length`, tem que respeitar `contentUnavailable`.
  it('o ícone de busca não aparece com itens obsoletos quando o conteúdo está indisponível', () => {
    mockCategories([category(1, 'Drama', 0)])
    mockContentByCategory({ 1: [series('Breaking Bad', 'Drama')] }, 'source_missing')
    renderSeries()

    press('ArrowRight') // entra em "Drama" — item obsoleto, outcome indisponível
    expect(document.querySelector('.search-icon-button')).toBeNull()
  })

  // Feature 019 (US3): selo agregado "Em dia"/contagem — `useSeriesWatchedSummary`
  // não é mockado neste arquivo (roda de verdade contra fake-indexeddb).
  describe('selo agregado "Em dia" (feature 019, D-007/D-008)', () => {
    afterEach(async () => {
      await db.sources.delete('source-1')
      await db.channels.where('sourceId').equals('source-1').delete()
      await db.userStates.where('sourceId').equals('source-1').delete()
    })

    async function seedEpisode(seriesId: string, providerStreamId: string, watched: boolean): Promise<void> {
      await db.sources.put({
        id: 'source-1',
        type: 'provider_credentials',
        displayName: 'Fonte de teste',
        connectionState: 'synced',
        activeGeneration: 1,
        createdAt: 0,
        updatedAt: 0,
      })
      await db.channels.add({
        sourceId: 'source-1',
        generation: 1,
        kind: 'episode',
        name: `Ep ${providerStreamId}`,
        originalName: `Ep ${providerStreamId}`,
        groupOrder: 0,
        seriesId,
        providerStreamId,
        seasonNumber: 1,
        episodeNumber: Number(providerStreamId),
      })
      if (watched) {
        const stableId = buildStableId({
          sourceId: 'source-1',
          kind: 'episode',
          providerStreamId,
          seasonNumber: 1,
          episodeNumber: Number(providerStreamId),
        })
        await db.userStates.put({
          stableId,
          sourceId: 'source-1',
          isFavorite: false,
          completedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
    }

    it('cobertura completa e tudo assistido mostra "Em dia"; cobertura completa mas parcial mostra contagem; nunca aberta não mostra selo', async () => {
      await seedEpisode('s-em-dia', '101', true)
      await seedEpisode('s-em-dia', '102', true)
      await seedEpisode('s-parcial', '201', true)
      await seedEpisode('s-parcial', '202', false)

      mockCategories([category(1, 'Drama', 0)])
      mockContentByCategory({
        1: [
          series('Em Dia', 'Drama', 's-em-dia'),
          series('Parcial', 'Drama', 's-parcial'),
          series('Nunca Aberta', 'Drama', 's-nunca-aberta'),
        ],
      })
      renderSeries()

      press('ArrowRight') // entra em "Drama"

      await waitFor(() => expect(document.querySelector('.watched-badge')).toBeInTheDocument())
      const cards = [...document.querySelectorAll('.poster-cell')]
      const emDia = cards.find((c) => c.textContent?.includes('Em Dia'))
      const parcial = cards.find((c) => c.textContent?.includes('Parcial'))
      const nuncaAberta = cards.find((c) => c.textContent?.includes('Nunca Aberta'))

      expect(emDia?.querySelector('.watched-badge')?.textContent).toBe('Em dia')
      expect(parcial?.querySelector('.watched-badge')?.textContent).toBe('1/2')
      expect(nuncaAberta?.querySelector('.watched-badge')).not.toBeInTheDocument()
    })
  })
})
