/**
 * Cenários de favoritos (feature 013) em Filmes — arquivo separado de
 * `MoviesScreen.test.tsx`, mesmo motivo de `LiveScreen.favorites.test.tsx`:
 * aquele mocka `useCategoryList`/`useCategoryContent`, este também deixa
 * `useFavoriteIds`/`useFavoritesContent`/`useToggleFavorite` reais rodarem
 * contra `fake-indexeddb`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoviesScreen } from './MoviesScreen'
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
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, providerStreamId: string, group: string | null = 'G1'): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: group,
    published: true,
    playable: true,
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

async function seedRealMovie(name: string, providerStreamId: string, groupOrder = 0): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        name,
        originalName: name,
        groupOrder,
        providerStreamId,
      },
    ],
    { allKeys: true },
  )
  return id as number
}

async function favoriteMovie(providerStreamId: string, favoritedAt: number): Promise<void> {
  const stableId = `${SOURCE_ID}|movie|id:${providerStreamId}`
  await db.userStates.put({
    stableId,
    sourceId: SOURCE_ID,
    isFavorite: true,
    favoritedAt,
    createdAt: favoritedAt,
    updatedAt: favoritedAt,
  })
}

/** Feature 019, D-006 — mesmo espírito de `favoriteMovie`, mas grava `completedAt`. */
async function watchMovie(providerStreamId: string, completedAt: number): Promise<void> {
  const stableId = `${SOURCE_ID}|movie|id:${providerStreamId}`
  await db.userStates.put({
    stableId,
    sourceId: SOURCE_ID,
    isFavorite: false,
    completedAt,
    createdAt: completedAt,
    updatedAt: completedAt,
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

function renderMovies() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenMovie = vi.fn()
  const onBack = vi.fn()
  function buildUi() {
    return (
      <QueryClientProvider client={queryClient}>
        <MoviesScreen sourceId={SOURCE_ID} onOpenMovie={onOpenMovie} onBack={onBack} onResync={() => {}} />
      </QueryClientProvider>
    )
  }
  const result = render(buildUi())
  return { ...result, onOpenMovie, onBack }
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

/** Mesmo motivo de `LiveScreen.favorites.test.tsx`: tempo real, não fake timers (misturar com `waitFor` trava). */
async function holdEnter(ms = 850): Promise<void> {
  keydown('Enter')
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)))
}

describe('MoviesScreen — favoritos (feature 013)', () => {
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
    mockContentByCategory({ 1: [movie('Duna', '1')] })
    const { onOpenMovie } = renderMovies()

    keydown('ArrowRight')
    keyup('ArrowRight')

    await holdEnter()
    expect(screen.getByText('Adicionado aos favoritos')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.fav-star')).toBeInTheDocument())
    expect(onOpenMovie).not.toHaveBeenCalled()

    keyup('Enter')
    tap('Enter')
    expect(onOpenMovie).toHaveBeenCalledWith('id-Duna', expect.any(Object))
  }, 10000)

  it('"★ Favoritos" é a primeira entrada da trilha (antes de "Todos", feature 018), lista os filmes carregados e abre o detalhe por OK', async () => {
    await seedSource()
    const dunaId = await seedRealMovie('Duna', '1')
    await favoriteMovie('1', 100)
    mockCategories([category(1, 'G1', 0)])
    const { onOpenMovie } = renderMovies()

    const groups = document.querySelectorAll('.live-column-groups .live-item')
    expect([...groups].map((g) => g.textContent)).toEqual(['★Favoritos', 'Todos', 'G1'])

    keydown('ArrowUp') // "Todos"
    keyup('ArrowUp')
    keydown('ArrowUp') // "★ Favoritos"
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => expect(screen.getByText('Duna')).toBeInTheDocument())
    tap('Enter')
    expect(onOpenMovie).toHaveBeenCalledWith(String(dunaId), expect.any(Object))
  })

  it('"Favoritos" vazia: OK no botão devolve o foco à trilha (ativação por tecla)', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    renderMovies()

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

  it('selo "Assistido" (feature 019) aparece só para o filme com completedAt, nunca para os demais', async () => {
    await seedSource()
    await watchMovie('1', 100)
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({ 1: [movie('Duna', '1'), movie('Arrival', '2')] })
    renderMovies()

    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => expect(screen.getByText('Duna')).toBeInTheDocument())
    await waitFor(() => expect(document.querySelector('.watched-badge')).toBeInTheDocument())

    const cards = [...document.querySelectorAll('.poster-cell')]
    const duna = cards.find((c) => c.textContent?.includes('Duna'))
    const arrival = cards.find((c) => c.textContent?.includes('Arrival'))

    expect(duna?.querySelector('.watched-badge')).toBeInTheDocument()
    expect(arrival?.querySelector('.watched-badge')).not.toBeInTheDocument()
  })

  it('desfavoritar o focado dentro de "Favoritos" move o foco ao vizinho da grade', async () => {
    await seedSource()
    await seedRealMovie('A', '1', 0)
    await seedRealMovie('B', '2', 1)
    await favoriteMovie('1', 100)
    await favoriteMovie('2', 200) // ordem exibida: B, A
    mockCategories([category(1, 'G1', 0)])
    renderMovies()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => {
      const titles = document.querySelectorAll('.poster-card-title')
      expect([...titles].map((t) => t.textContent)).toEqual(['B', 'A'])
    })
    expect(document.querySelector('.poster-box.tv-focus')).toBeTruthy()

    await holdEnter() // desfavorita "B" (primeiro, focado por padrão)
    keyup('Enter')

    await waitFor(() => {
      const titles = document.querySelectorAll('.poster-card-title')
      expect([...titles].map((t) => t.textContent)).toEqual(['A'])
    })
  }, 10000)
})
