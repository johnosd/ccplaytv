/**
 * Tela hero de Filmes/Séries (feature 053) — casos além do contrato travado
 * (`VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx`): pré-carga por proximidade, preenchimento de uma
 * categoria pendente, foco inicial sem dado, categorias de nome repetido e ausência de rede/TMDB.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import * as prefetchApi from '../catalog/prefetchApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview } from '../catalog/catalogApi'
import { resetVodSessionMemory, type VodSection } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'

const restore: Array<() => void> = []
function define(target: object, key: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
  restore.push(() => {
    if (previous) Object.defineProperty(target, key, previous)
    else delete (target as Record<string, unknown>)[key]
  })
}

beforeAll(() => {
  define(HTMLElement.prototype, 'offsetHeight', 640)
  define(HTMLElement.prototype, 'offsetWidth', 1200)
  define(Element.prototype, 'clientHeight', 640)
  define(Element.prototype, 'clientWidth', 1200)
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
  define(globalThis, 'ResizeObserver', FakeResizeObserver)
})

afterAll(() => {
  for (const undo of restore.reverse()) undo()
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useHistoryContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useRecentlyAdded: vi.fn(),
    useCategoryPreviews: vi.fn(),
    useCachedBackdrops: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
  }
})
vi.mock('../catalog/prefetchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/prefetchApi')>()
  return { ...actual, prioritizeCategory: vi.fn() }
})

const SOURCE_ID = 'source-053'

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

function category(id: number, name: string): CatalogCategory {
  return { id, kind: 'movie', name, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

let previews: Map<number, CategoryPreview>
let backdrops: Map<string, string>

function mockData(opts: { categories?: CatalogCategory[]; history?: CatalogItemOut[]; favorites?: CatalogItemOut[]; added?: CatalogItemOut[] } = {}) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: opts.categories ?? [category(1, 'Ação'), category(2, 'Drama')],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: opts.history ?? [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: opts.favorites ?? [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: opts.added ?? [], isLoading: false })
  vi.mocked(catalogApi.useCategoryPreviews).mockImplementation(() => previews)
  vi.mocked(catalogApi.useCachedBackdrops).mockImplementation(() => backdrops)
}

function renderShowcase(section: VodSection = 'movies') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const ui = (): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <VodShowcaseScreen
        section={section}
        sourceId={SOURCE_ID}
        onOpenItem={vi.fn()}
        onOpenTarget={vi.fn()}
        onBack={vi.fn()}
        onResync={vi.fn()}
      />
    </QueryClientProvider>
  )
  const view = render(ui())
  return { ...view, rerenderShowcase: () => view.rerender(ui() as never) }
}

function tap(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
}

const focusedRowLabel = () =>
  document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')?.getAttribute('aria-label') ?? null

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  resetVodSessionMemory()
  previews = new Map()
  backdrops = new Map()
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
  vi.useRealTimers()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('VodShowcaseScreen — carrosséis de categoria (feature 053)', () => {
  it('categoria pendente na janela pede prioridade à pré-carga uma vez, só depois da pausa; ao chegar, o carrossel se preenche', () => {
    previews = new Map([[1, { status: 'pending', items: [] }]])
    // Continue, Favoritos e Adicionados vêm antes (a 056 tirou o slot "Bem avaliados", a 057 o do Top 10 e a 060 o de "Porque você
    // assistiu"): a categoria é a 4ª fileira e, com o foco no alto, já cai na janela (−1 … +3) — o pedido nasce da PAUSA, não do foco.
    mockData({ history: [movie('H1')], favorites: [movie('F1')], added: [movie('A1')] })
    const view = renderShowcase()

    // Antes da pausa, nada é pedido; passada a pausa, a categoria pendente da janela é pedida UMA vez.
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(prefetchApi.prioritizeCategory).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(prefetchApi.prioritizeCategory).toHaveBeenCalledTimes(1)
    expect(prefetchApi.prioritizeCategory).toHaveBeenCalledWith(1)
    tap('ArrowDown', 2) // Favoritos → Adicionados: a mesma categoria segue na janela, sem novo pedido
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(prefetchApi.prioritizeCategory).toHaveBeenCalledTimes(1)

    // A pré-carga trouxe a categoria: a prévia vira `ready` e o carrossel mostra os itens (sem novo pedido).
    previews = new Map([[1, { status: 'ready', items: [movie('X1')] }]])
    view.rerenderShowcase()
    tap('ArrowDown') // Adicionados → Ação
    expect(focusedRowLabel()).toBe('Ação')
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.content-card')?.textContent).toContain('X1')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(prefetchApi.prioritizeCategory).toHaveBeenCalledTimes(1)
  })

  it('passar o foco rápido pelas fileiras não pede prioridade antes da pausa', () => {
    previews = new Map([
      [1, { status: 'pending', items: [] }],
      [2, { status: 'pending', items: [] }],
    ])
    mockData({ history: [movie('H1')] })
    renderShowcase()
    tap('ArrowDown', 5)
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(prefetchApi.prioritizeCategory).not.toHaveBeenCalled()
  })

  it('sem fileiras de itens o foco inicial é a lista lateral; → leva à fileira da categoria (com "Ver tudo" focável), nunca a um beco', () => {
    mockData()
    renderShowcase()
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.side-category-nav-item')).not.toBeNull()
    tap('ArrowRight') // pagina a lista (cabe numa página): vai à última entrada
    expect(focusedRowLabel()).toBeNull()
    tap('ArrowRight') // fim da lista: entra nos cards (feature 060: não há mais slot — a 1ª fileira é a da categoria)
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
    expect(focusedRowLabel()).toBe('Ação')
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.vod-see-all-card')).not.toBeNull()
  })

  it('com o foco na lista lateral, dados que chegam depois (uma fileira nova) não roubam o foco', () => {
    mockData()
    const view = renderShowcase()
    tap('ArrowDown') // mexeu na lista: o foco fica nela
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.side-category-nav-item')).not.toBeNull()
    mockData({ history: [movie('H1')] }) // o histórico carregou depois
    view.rerenderShowcase()
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.side-category-nav-item')).not.toBeNull()
    tap('ArrowRight', 2) // → pagina até o fim da lista e entra nas fileiras: agora sim a 1ª com itens
    expect(focusedRowLabel()).toBe('Continue assistindo')
  })

  it('passada a janela inicial, uma fileira lenta que chega depois ("Adicionados recentemente") não rouba o foco da lista lateral', () => {
    mockData()
    const view = renderShowcase()
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.side-category-nav-item')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [movie('N1')], isLoading: false })
    view.rerenderShowcase()
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.side-category-nav-item')).not.toBeNull()
  })
  it('duas categorias com o mesmo nome declarado viram uma só fileira', () => {
    mockData({ categories: [category(1, 'Ação'), category(2, 'Ação'), category(3, 'Drama')] })
    renderShowcase()
    tap('ArrowRight', 2) // lista lateral (pagina até o fim) → 1ª fileira (feature 060: sem slot, é a "Ação")
    expect(focusedRowLabel()).toBe('Ação')
    tap('ArrowDown', 8)
    expect(focusedRowLabel()).toBe('Drama')
    tap('ArrowUp')
    expect(focusedRowLabel()).toBe('Ação')
    tap('ArrowUp')
    expect(focusedRowLabel()).toBe('Ação') // não há segunda "Ação" nem fileira acima: o foco fica na única "Ação"
  })

  it('← → paginam a lista lateral em páginas inteiras; no fim da lista → entra nos cards e só então ela recolhe', () => {
    const many = Array.from({ length: 30 }, (_, i) => category(i + 1, `C${String(i + 1).padStart(2, '0')}`))
    mockData({ categories: many })
    renderShowcase()
    const panel = () => document.querySelector('.vod-showcase .vod-side-panel')!
    const focusedSide = () => document.querySelector('.vod-showcase .side-category-nav-item.tv-focus .side-category-nav-label')?.textContent
    expect(focusedSide()).toBe('Favoritos')
    expect(panel().classList.contains('is-collapsed')).toBe(false)
    tap('ArrowRight') // uma página (640 / 56 = 11 itens): 0 → 11 (3 fixos + C01…C08 → C09)
    expect(focusedSide()).toBe('C09')
    tap('ArrowRight')
    expect(focusedSide()).toBe('C20')
    tap('ArrowRight') // última página, presa na última entrada
    expect(focusedSide()).toBe('C30')
    expect(panel().classList.contains('is-collapsed')).toBe(false)
    tap('ArrowLeft') // página anterior
    expect(focusedSide()).toBe('C19')
    tap('ArrowRight', 2) // de novo até o fim e, na última entrada, → entra nos cards
    expect(focusedSide()).toBeUndefined()
    expect(focusedRowLabel()).toBe('C01') // feature 060: sem slot, a 1ª fileira é a 1ª categoria
    expect(panel().classList.contains('is-collapsed')).toBe(true)
  })
  it('Continue assistindo vira card largo só com backdrop real de TODOS os itens; senão pôster alto', () => {
    mockData({ history: [movie('H1'), movie('H2')] })
    backdrops = new Map([['id-H1', 'https://img/h1.jpg']])
    const partial = renderShowcase()
    expect(document.querySelector('section[aria-label=\"Continue assistindo\"] .content-card--wide')).toBeNull()
    expect(document.querySelector('section[aria-label=\"Continue assistindo\"] .content-card--portrait')).not.toBeNull()
    partial.unmount()

    backdrops = new Map([['id-H1', 'https://img/h1.jpg'], ['id-H2', 'https://img/h2.jpg']])
    renderShowcase()
    expect(document.querySelector('section[aria-label=\"Continue assistindo\"] .content-card--wide')).not.toBeNull()
    expect(document.querySelector('section[aria-label=\"Continue assistindo\"] .content-card--portrait')).toBeNull()
  })

  it('quando os fundos chegam depois da 1ª abertura, os cards de "Continue assistindo" viram largos SEM ficar sobrepostos', () => {
    mockData({ history: [movie('H1'), movie('H2'), movie('H3')] })
    backdrops = new Map()
    const view = renderShowcase()
    const row = () => document.querySelector('section[aria-label="Continue assistindo"]')!
    const lefts = () => [...row().querySelectorAll<HTMLElement>('.rail-item')].map((item) => parseInt(item.style.transform.replace(/[^0-9-]/g, ''), 10))
    const widths = () => [...row().querySelectorAll<HTMLElement>('.rail-item')].map((item) => parseInt(item.style.width, 10))
    expect(row().querySelector('.content-card--wide')).toBeNull()
    expect(lefts().slice(0, 3)).toEqual([0, 324, 648]) // pôster alto: 324 px por item

    backdrops = new Map([['id-H1', 'https://img/h1.jpg'], ['id-H2', 'https://img/h2.jpg'], ['id-H3', 'https://img/h3.jpg']])
    view.rerenderShowcase()
    expect(row().querySelector('.content-card--wide')).not.toBeNull()
    expect(widths().slice(0, 3)).toEqual([424, 424, 424])
    expect(lefts().slice(0, 3)).toEqual([0, 424, 848]) // cada item começa onde o anterior termina
  })
  it('a rede nunca é tocada (nem TMDB) ao percorrer a tela, inclusive sem chave TMDB (Top 10 e Dica ausentes)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockData({ history: [movie('H1')] })
    renderShowcase('series')
    tap('ArrowDown')
    expect(focusedRowLabel()).toBe('Ação') // feature 060: sem slot, depois do histórico vem a 1ª categoria
    tap('ArrowDown', 4)
    tap('Enter')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
