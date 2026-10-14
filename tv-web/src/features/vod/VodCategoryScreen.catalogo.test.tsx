/**
 * Tela de categoria (feature 052) — casos de catálogo migrados de `MoviesScreen.test.tsx`/`SeriesScreen.test.tsx`
 * (015/017/018/019/042): capa real, erros, restauração por id, busca e selo agregado de Séries.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCategoryScreen } from './VodCategoryScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryFetchOutcome } from '../catalog/catalogApi'
import { resetVodSessionMemory, type VodSection } from './vodSessionMemory'
import type { VodCategoryRestore, VodTarget } from './vodTarget'
import { db } from '../../lib/catalog/db'
import { buildStableId } from '../../lib/catalog/userStateRepository'

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
  }
})

const SOURCE_ID = 'source-1'

function category(id: number, name: string, order: number, kind: 'movie' | 'series' = 'movie'): CatalogCategory {
  return { id, kind, name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, group: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: group,
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
  }
}

function serie(name: string, group: string, seriesId?: string): CatalogItemOut {
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
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items, coveredCategories, totalCategories, isLoading: false })
}

/** Toque rápido: OK precisa do `keyup` (feature 013) para o `onSelect` disparar como toque curto. */
function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function gridTitles(): string[] {
  return [...document.querySelectorAll('.vod-grid .content-card-title')].map((el) => el.textContent ?? '')
}

function focusedTitle(): string | undefined {
  const cell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
  return cell?.querySelector('.content-card-title')?.textContent ?? undefined
}

const onOpenItem = vi.fn<(itemId: string, restore: VodCategoryRestore) => void>()
const onBack = vi.fn<() => void>()

function renderCategory(target: VodTarget, section: VodSection = 'movies', restore?: VodCategoryRestore) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function buildUi(): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <VodCategoryScreen
          section={section}
          sourceId={SOURCE_ID}
          target={target}
          onOpenItem={onOpenItem}
          restore={restore}
          onBack={onBack}
          onResync={vi.fn()}
        />
      </QueryClientProvider>
    )
  }
  const result = render(buildUi())
  return { ...result, rerenderScreen: () => result.rerender(buildUi() as never) }
}

beforeEach(() => {
  resetVodSessionMemory()
  onOpenItem.mockReset()
  onBack.mockReset()
  mockContentByCategory({})
  mockAggregated([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VodCategoryScreen — Filmes', () => {
  const ACAO: VodTarget = { kind: 'category', name: 'Ação' }

  it('mostra os filmes da categoria, e OK abre o detalhe do focado', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'Ação'), movie('Filme B', 'Ação')] })
    renderCategory(ACAO)
    expect(gridTitles()).toEqual(['Filme A', 'Filme B'])
    press('Enter')
    expect(onOpenItem).toHaveBeenCalledWith('id-Filme A', expect.objectContaining({ focusedItemId: 'id-Filme A' }))
  })

  it('filme com icon_url mostra a capa real; sem icon_url continua no placeholder (feature 015)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({
      1: [{ ...movie('Com Capa', 'Ação'), icon_url: 'http://exemplo.test/capa.png' }, movie('Sem Capa', 'Ação')],
    })
    const { container } = renderCategory(ACAO)
    const cards = [...container.querySelectorAll('.vod-grid-cell')]
    const comCapa = cards.find((c) => c.textContent?.includes('Com Capa'))
    const semCapa = cards.find((c) => c.textContent?.includes('Sem Capa'))
    expect(comCapa?.querySelector('img.poster-box-art')).toHaveAttribute('src', 'http://exemplo.test/capa.png')
    expect(semCapa?.querySelector('img.poster-box-art')).not.toBeInTheDocument()
  })

  it('falha de categoria mostra o erro com o código da tabela, sem erro cru (feature 042, FR-011)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({}, 'failed')
    const base = vi.mocked(catalogApi.useCategoryContent).getMockImplementation()!
    vi.mocked(catalogApi.useCategoryContent).mockImplementation((...args) => {
      const result = base(...args)
      return { ...result, data: { ...result.data, errorCode: 'NET-02' } } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
    })
    renderCategory(ACAO)
    expect(screen.getByText('Não foi possível carregar esta categoria')).toBeInTheDocument()
    expect(screen.getByTestId('error-state-code')).toHaveTextContent('NET-02')
    expect(screen.getByText('O servidor não respondeu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('foco por identidade: item que sumir do catálogo novo não estoura, cai no que sobrou', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Filme A', 'Ação'), movie('Filme B', 'Ação')] })
    const { rerenderScreen } = renderCategory(ACAO)
    press('ArrowRight') // 2º item
    mockContentByCategory({ 1: [movie('Filme A', 'Ação')] })
    rerenderScreen()
    press('Enter')
    expect(onOpenItem).toHaveBeenCalledWith('id-Filme A', expect.any(Object))
  })

  it('abrir um filme e remontar com o estado devolvido restaura a categoria e o foco nele (T024)', () => {
    mockCategories([category(1, 'Ação', 0), category(2, 'Comédia', 1)])
    mockContentByCategory({ 1: [movie('Filme A', 'Ação')], 2: [movie('Filme C', 'Comédia'), movie('Filme D', 'Comédia')] })
    const target: VodTarget = { kind: 'category', name: 'Comédia' }
    renderCategory(target)
    press('ArrowRight')
    press('Enter')
    const [openedId, restore] = onOpenItem.mock.calls[0]
    expect(openedId).toBe('id-Filme D')

    cleanup()
    resetVodSessionMemory() // a restauração vem do estado devolvido, não da memória da sessão
    mockCategories([category(1, 'Ação', 0), category(2, 'Comédia', 1)])
    renderCategory(target, 'movies', restore)
    expect(focusedTitle()).toBe('Filme D')
  })

  // FR-014 da 017: sem resultado, o campo continua com foco DOM real, e RETURN a partir dele sai sem beco sem saída.
  it('busca sem resultado: o campo mantém foco e RETURN a partir dele devolve o foco ao botão de busca (T029)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Duna', 'Ação')] })
    renderCategory(ACAO)
    press('ArrowUp')
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(document.activeElement).toBe(field)
    act(() => fireEvent.change(field!, { target: { value: 'xyz' } }))
    expect(screen.getByText('Nenhum resultado para "xyz"')).toBeInTheDocument()
    expect(document.activeElement).toBe(field)

    act(() => fireEvent.keyDown(field!, { keyCode: 10009, bubbles: true }))
    expect(onBack).not.toHaveBeenCalled()
    expect(document.querySelector('.vod-toolbar-search-button.tv-focus')).not.toBeNull()
  })

  it('o botão de busca não aparece com itens obsoletos quando o conteúdo está indisponível', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockContentByCategory({ 1: [movie('Duna', 'Ação')] }, 'source_missing')
    renderCategory(ACAO)
    expect(document.querySelector('.vod-toolbar-search-button')).toBeNull()
  })

  it('dentro de "Todos": cobertura total não mostra aviso de cobertura (T029)', () => {
    mockCategories([category(1, 'Ação', 0)])
    mockAggregated([movie('Duna', 'Ação')], 1, 1)
    renderCategory({ kind: 'all' })
    press('ArrowUp')
    press('Enter')
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'duna' } }))
    expect(gridTitles()).toEqual(['Duna'])
    expect(screen.queryByText(/Busca em \d+ de \d+ categorias/)).not.toBeInTheDocument()
  })
})

describe('VodCategoryScreen — Séries', () => {
  const DRAMA: VodTarget = { kind: 'category', name: 'Drama' }

  it('busca dentro da categoria: abrir um resultado devolve um estado que restaura termo, resultados e foco (T023)', () => {
    mockCategories([category(1, 'Drama', 0, 'series')])
    mockContentByCategory({ 1: [serie('Breaking Bad', 'Drama'), serie('Better Call Saul', 'Drama')] })
    renderCategory(DRAMA, 'series')
    press('ArrowUp')
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(field!.value).toBe('')
    act(() => {
      fireEvent.change(field!, { target: { value: 'break' } })
    })
    press('ArrowDown') // do campo para o primeiro resultado
    press('Enter')

    expect(onOpenItem).toHaveBeenCalledTimes(1)
    const [openedId, restore] = onOpenItem.mock.calls[0]
    expect(openedId).toBe('id-Breaking Bad')

    cleanup()
    mockCategories([category(1, 'Drama', 0, 'series')])
    mockContentByCategory({ 1: [serie('Breaking Bad', 'Drama'), serie('Better Call Saul', 'Drama')] })
    renderCategory(DRAMA, 'series', restore)
    expect(document.querySelector<HTMLInputElement>('input.search-field')?.value).toBe('break')
    expect(focusedTitle()).toBe('Breaking Bad')
  })

  it('"Todos" lista séries de mais de uma categoria, mostra cobertura parcial, e a busca dentro dela funciona', () => {
    mockCategories([category(1, 'Drama', 0, 'series'), category(2, 'Comédia', 1, 'series')])
    mockAggregated([serie('Breaking Bad', 'Drama'), serie('Better Call Saul', 'Drama')], 1, 2)
    renderCategory({ kind: 'all' }, 'series')
    expect([...gridTitles()].sort()).toEqual(['Better Call Saul', 'Breaking Bad'])
    expect(document.body.textContent).toContain('Busca em 1 de 2 categorias')
    press('ArrowUp')
    press('Enter')
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'saul' } }))
    expect(gridTitles()).toEqual(['Better Call Saul'])
  })

  // Feature 019 (US3): selo agregado "Em dia"/contagem — `useSeriesWatchedSummary` roda de verdade (fake-indexeddb).
  describe('selo agregado "Em dia" (feature 019, D-007/D-008)', () => {
    afterEach(async () => {
      await db.sources.delete(SOURCE_ID)
      await db.channels.where('sourceId').equals(SOURCE_ID).delete()
      await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
    })

    async function seedEpisode(seriesId: string, providerStreamId: string, watched: boolean): Promise<void> {
      await db.sources.put({
        id: SOURCE_ID,
        type: 'provider_credentials',
        displayName: 'Fonte de teste',
        connectionState: 'synced',
        activeGeneration: 1,
        createdAt: 0,
        updatedAt: 0,
      })
      await db.channels.add({
        sourceId: SOURCE_ID,
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
          sourceId: SOURCE_ID,
          kind: 'episode',
          providerStreamId,
          seasonNumber: 1,
          episodeNumber: Number(providerStreamId),
        })
        await db.userStates.put({
          stableId,
          sourceId: SOURCE_ID,
          isFavorite: false,
          completedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
    }

    it('cobertura completa e tudo assistido mostra "Em dia"; parcial mostra contagem; nunca aberta não mostra selo', async () => {
      await seedEpisode('s-em-dia', '101', true)
      await seedEpisode('s-em-dia', '102', true)
      await seedEpisode('s-parcial', '201', true)
      await seedEpisode('s-parcial', '202', false)
      mockCategories([category(1, 'Drama', 0, 'series')])
      mockContentByCategory({
        1: [serie('Em Dia', 'Drama', 's-em-dia'), serie('Parcial', 'Drama', 's-parcial'), serie('Nunca Aberta', 'Drama', 's-nunca-aberta')],
      })
      renderCategory(DRAMA, 'series')

      await waitFor(() => expect(document.querySelector('.watched-badge')).toBeInTheDocument())
      const cards = [...document.querySelectorAll('.vod-grid-cell')]
      const badge = (name: string) => cards.find((c) => c.textContent?.includes(name))?.querySelector('.watched-badge')
      expect(badge('Em Dia')?.textContent).toBe('Em dia')
      expect(badge('Parcial')?.textContent).toBe('1/2')
      expect(badge('Nunca Aberta')).toBeFalsy()
    })
  })
})
