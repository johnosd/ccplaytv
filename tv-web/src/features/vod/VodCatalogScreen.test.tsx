/**
 * Hero band (FR-025/FR-026) e memória de foco entre montagens (feature 025,
 * T035) — testes que não fazem parte do contrato travado
 * (`MoviesScreen.filmes-series-ds-v14.contract.test.tsx`), mas cobrem o
 * mesmo mecanismo compartilhado por Filmes/Séries.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCatalogScreen } from './VodCatalogScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { updateProgress } from '../../lib/catalog/userStateRepository'

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
