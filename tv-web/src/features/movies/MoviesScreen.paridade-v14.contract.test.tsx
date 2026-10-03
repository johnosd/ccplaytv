/**
 * Teste de CONTRATO da feature 050 (paridade visual de Filmes e Séries com o
 * DS V14) — hero band e cromo da sidebar/toolbar. Travado em
 * `sdd/specs/050-filmes-series-paridade-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade):
 * - `.vod-hero-band`: a hero (não focável); dentro dela `.vod-hero-eyebrow`
 *   (rótulo), `.vod-hero-title` (nome do card focado) e `.vod-hero-art`
 *   (camada de fundo, sempre no DOM, com `<img>` só quando há capa real).
 * - `.vod-side-head`: cabeçalho do painel da sidebar ("Categorias").
 * - `.vod-toolbar-sort-label` / `.vod-toolbar-sort-value`: "Ordenar" e a
 *   opção atual, em elementos separados dentro do botão de ordenar.
 * - `.vod-toolbar-search-hint`: a dica "OK" do campo Pesquisar em repouso.
 * - `.content-card` / `.content-card-title` / `.tv-focus`: como na 025.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoviesScreen } from './MoviesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import type { VodShellProps } from '../vod/vodShell'
import { resetVodSessionMemory } from '../vod/vodSessionMemory'
import { db } from '../../lib/catalog/db'

// Mesmo bloco de layout de MoviesScreen.filmes-series-ds-v14.contract.test.tsx:
// jsdom não faz layout, e a grade é virtualizada (feature 009).
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
    // Favoritos/assistidos/histórico: reais, contra `db` (fake-indexeddb), vazios.
  }
})

const SOURCE_ID = 'source-1'
const COVER_A1 = 'https://img.test/a1.jpg'

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, streamId: string, group: string, iconUrl?: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: group,
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: streamId,
    original_name: name,
    icon_url: iconUrl ?? null,
  }
}

function mockCatalog() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Ação', 0), category(2, 'Drama', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items =
      cat?.id === 1
        ? [movie('Filme A1', 'a1', 'Ação', COVER_A1), movie('Filme A2', 'a2', 'Ação'), movie('Filme A3', 'a3', 'Ação')]
        : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items: [],
    coveredCategories: 0,
    totalCategories: 2,
    isLoading: false,
  })
}

function renderMovies() {
  const shell: VodShellProps = { sourceName: 'Sala', onGoHome: vi.fn(), onSwitchTop: vi.fn(), onOpenProfiles: vi.fn() }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <MoviesScreen sourceId={SOURCE_ID} onOpenMovie={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} shell={shell} />
    </Wrapper>,
  )
}

/** Toque rápido: keydown + keyup, como um pressionamento normal do controle. */
function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function text(selector: string): string | null {
  return document.querySelector(selector)?.textContent ?? null
}

describe('MoviesScreen — contrato da feature 050', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    mockCatalog()
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
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  // US1/AC1, US1/AC2, US1/AC4, FR-001, FR-002, FR-003, FR-004,
  // Constitution: "Foco Visível e Sem Becos Sem Saída" (a hero nunca é focável)
  it('hero: rótulo CCPLAY CINEMA, título do card focado, capa real só quando existe, sem nada focável', () => {
    renderMovies()
    tap('Enter') // entra em "Ação": foco no 1º card (com capa)

    const hero = document.querySelector('.vod-hero-band')
    expect(hero).not.toBeNull()
    expect(text('.vod-hero-eyebrow')).toBe('CCPLAY CINEMA')
    expect(text('.vod-hero-title')).toBe('Filme A1')
    expect(hero!.querySelector('.vod-hero-art')).not.toBeNull()
    expect(hero!.querySelector('.vod-hero-art img')?.getAttribute('src')).toBe(COVER_A1)
    expect(hero!.querySelectorAll('button, a, input, [tabindex]').length).toBe(0)

    tap('ArrowRight') // 2º card, sem capa
    expect(text('.vod-hero-title')).toBe('Filme A2')
    expect(document.querySelector('.vod-hero-art')).not.toBeNull()
    expect(document.querySelector('.vod-hero-art img')).toBeNull()
    expect(document.querySelectorAll('.vod-hero-band .tv-focus').length).toBe(0)
  })

  // US2/AC1, US3/AC1, US3/AC2, FR-005, FR-006, FR-011
  it('sidebar com cabeçalho "Categorias"; toolbar com "Ordenar" + opção atual e dica "OK" na busca', () => {
    renderMovies()
    expect(text('.vod-side-head')).toBe('Categorias')
    expect(document.querySelectorAll('.side-category-nav-item').length).toBeGreaterThan(0)

    tap('Enter') // entra em "Ação": toolbar com busca e ordenar
    expect(text('.vod-toolbar-sort-label')).toBe('Ordenar')
    expect(text('.vod-toolbar-sort-value')).toContain('Ordem da fonte')
    expect(text('.vod-toolbar-search-hint')).toBe('OK')
  })
})
