/**
 * Contrato da feature 050 (paridade visual de Filmes e Séries) — travado em
 * `sdd/specs/050-filmes-series-paridade-v14/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 * EMENDADO pela feature 052: a hero deixou de ficar sobre a grade (agora é a hero da VITRINE) e a sidebar deixou de
 * existir; o cromo da toolbar (Ordenar com rótulo+valor, Pesquisar com "OK") vive na tela de categoria.
 *
 * EMENDADO ad-hoc (2026-10-07): hero removido por pedido do usuário; foco permanece nos cards.
 * Seletores fixados: `.vod-hero-band` (ausente), `.content-card`, `.vod-toolbar-sort-label`,
 * `.vod-toolbar-sort-value`, `.vod-toolbar-search-hint`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import { VodCategoryScreen } from './VodCategoryScreen'

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
  define(Element.prototype, 'scrollHeight', 1_000_000)
  define(HTMLElement.prototype, 'scrollTo', function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
    const top = typeof options === 'object' && options !== null ? options.top : undefined
    if (typeof top === 'number') this.scrollTop = top
    queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
  })
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
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useAggregatedItems: vi.fn(),
    useHistoryContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useRecentlyAdded: vi.fn(),
  }
})

const SOURCE_ID = 'source-050-vod'
const COVER = 'https://img.test/a1.jpg'

function movie(name: string, iconUrl?: string): CatalogItemOut {
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
    year: null,
    icon_url: iconUrl ?? null,
  }
}

function tap(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function wrap(ui: ReactNode): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

async function seedSource() {
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

async function cleanSource() {
  await db.sources.delete(SOURCE_ID)
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
}

function mockBase(items: CatalogItemOut[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }, { id: 2, kind: 'movie', name: 'Drama', order: 1, count: 0, fetchMode: 'on_demand', providerCategoryId: '2' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const list = cat?.id === 1 ? items : cat?.id === 2 ? [movie('Drama 1'), movie('Drama 2'), movie('Drama 3')] : []
    return {
      data: { items: list, totalCount: list.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 2, isLoading: false })
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [], isLoading: false })
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null

describe('Filmes e Séries — contrato da feature 050 (emendado pela 052)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockBase([movie('Filme A1', COVER), movie('Filme A2'), movie('Filme A3')])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await cleanSource()
  })

  // US1/AC1+AC2+AC4, FR-001..FR-004, Constitution: Foco Visível e Sem Becos Sem Saída (a hero nunca é focável)
  it('vitrine sem hero: foco nos cards com e sem capa', () => {
    // Sem histórico nem favoritos, a 1ª fileira com itens é "Adicionados recentemente" (rótulo da seção na hero).
    vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [movie('Filme A1', COVER), movie('Filme A2')], isLoading: false })
    render(
      wrap(
        <VodShowcaseScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onOpenTarget={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />,
      ),
    )
    // Sem histórico nem favoritos, a 1ª fileira com itens é "Adicionados recentemente"; o foco inicial cai nela.
    // Emenda ad-hoc (2026-10-07): hero removido por pedido do usuário; foco nos cards.
    expect(document.querySelector('.vod-hero-band')).toBeNull()
    expect(text('.content-card:has(.tv-focus)')).toContain('Filme A1')
    tap('ArrowRight')
    expect(text('.content-card:has(.tv-focus)')).toContain('Filme A2')
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
  })

  // US2/AC1, US3/AC1+AC2, FR-005, FR-006, FR-011
  it('toolbar da categoria: "Ordenar" com a opção atual e dica "OK" na busca', () => {
    render(
      wrap(
        <VodCategoryScreen section="movies" sourceId={SOURCE_ID} target={{ kind: 'category', name: 'Ação' }} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />,
      ),
    )
    expect(text('.vod-toolbar-sort-label')).toBe('Ordenar')
    expect(text('.vod-toolbar-sort-value')).toContain('Ordem da fonte')
    expect(text('.vod-toolbar-search-hint')).toBe('OK')
  })
})

