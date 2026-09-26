/**
 * Cenários de favoritos (feature 013) em Séries — arquivo separado de
 * `SeriesScreen.test.tsx`, mesmo motivo de `LiveScreen.favorites.test.tsx`
 * e `MoviesScreen.favorites.test.tsx`: `useFavoriteIds`/`useFavoritesContent`/
 * `useToggleFavorite` reais contra `fake-indexeddb`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesScreen } from './SeriesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
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
    // useFavoriteIds / useFavoritesContent / useToggleFavorite: reais.
  }
})

const SOURCE_ID = 'source-1'

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'series', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function series(name: string, providerStreamId: string, group: string | null = 'G1'): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'series',
    name,
    original_group: group,
    published: true,
    playable: false, // série é agrupador — nunca "reproduzível" (D-006 da 012)
    source_id: SOURCE_ID,
    provider_stream_id: providerStreamId,
    original_name: name,
  }
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

/** Série é o nível de favorito (D-009) — o registro real também é `kind: 'series'`, com `seriesId` próprio (mesmo modelo da feature 012). */
async function seedRealSeries(name: string, seriesId: string, groupOrder = 0): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'series',
        name,
        originalName: name,
        groupOrder,
        seriesId,
      },
    ],
    { allKeys: true },
  )
  return id as number
}

async function favoriteSeries(seriesId: string, favoritedAt: number): Promise<void> {
  const stableId = `${SOURCE_ID}|series|id:${seriesId}`
  await db.userStates.put({
    stableId,
    sourceId: SOURCE_ID,
    isFavorite: true,
    favoritedAt,
    createdAt: favoritedAt,
    updatedAt: favoritedAt,
  })
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

function renderSeries() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenSeries = vi.fn()
  const onBack = vi.fn()
  function buildUi() {
    return (
      <QueryClientProvider client={queryClient}>
        <SeriesScreen sourceId={SOURCE_ID} onOpenSeries={onOpenSeries} onBack={onBack} onResync={() => {}} />
      </QueryClientProvider>
    )
  }
  const result = render(buildUi())
  return { ...result, onOpenSeries, onBack }
}

function keydown(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function keyup(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function tap(key: string) {
  keydown(key)
  keyup(key)
}

async function holdEnter(ms = 850): Promise<void> {
  keydown('Enter')
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)))
}

describe('SeriesScreen — favoritos (feature 013)', () => {
  beforeEach(() => {
    mockContentByCategory({})
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('OK curto abre o detalhe no keyup; OK demorado favorita sem abrir nada', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({ 1: [series('Breaking Bad', 'srv-1')] })
    const { onOpenSeries } = renderSeries()

    keydown('ArrowRight')
    keyup('ArrowRight')

    await holdEnter()
    expect(screen.getByText('Adicionado aos favoritos')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.fav-star')).toBeInTheDocument())
    expect(onOpenSeries).not.toHaveBeenCalled()

    keyup('Enter')
    tap('Enter')
    expect(onOpenSeries).toHaveBeenCalledWith('id-Breaking Bad', expect.any(Object))
  }, 10000)

  it('"★ Favoritos" é a primeira entrada da trilha (antes de "Todos", feature 018), lista o cartão da série (nunca episódio) e abre o detalhe por OK', async () => {
    await seedSource()
    const seriesRecordId = await seedRealSeries('Breaking Bad', 'srv-1')
    // Um episódio da mesma série no catálogo — nunca deve aparecer em "Favoritos".
    await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'episode',
      name: 'Pilot',
      originalName: 'Pilot',
      groupOrder: 0,
      seriesId: 'srv-1',
      seasonNumber: 1,
      episodeNumber: 1,
    })
    await favoriteSeries('srv-1', 100)
    mockCategories([category(1, 'G1', 0)])
    const { onOpenSeries } = renderSeries()

    const groups = document.querySelectorAll('.live-column-groups .live-item')
    expect([...groups].map((g) => g.textContent)).toEqual(['★Favoritos', 'Todos', 'G1'])

    keydown('ArrowUp') // "Todos"
    keyup('ArrowUp')
    keydown('ArrowUp') // "★ Favoritos"
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => {
      const titles = document.querySelectorAll('.poster-card-title')
      expect([...titles].map((t) => t.textContent)).toEqual(['Breaking Bad'])
    })

    tap('Enter')
    expect(onOpenSeries).toHaveBeenCalledWith(String(seriesRecordId), expect.any(Object))
  })

  it('"Favoritos" vazia: OK no botão devolve o foco à trilha (ativação por tecla)', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    renderSeries()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => expect(screen.getByText('Nenhum favorito ainda')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')

    tap('Enter')

    expect(screen.queryByText('Nenhum favorito ainda')).not.toBeInTheDocument()
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('★Favoritos')
  })
})
