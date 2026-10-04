import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, CategoryPreview, DiscoveryPick } from '../catalog/catalogApi'
import type { VodShowcaseFocus } from './vodTarget'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'

let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreOffsetWidth: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreClientWidth: PropertyDescriptor | undefined
let restoreResizeObserver: typeof globalThis.ResizeObserver | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
  restoreResizeObserver = globalThis.ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, value: 1200 })
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
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
})

afterAll(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', restoreClientWidth)
  globalThis.ResizeObserver = restoreResizeObserver as typeof ResizeObserver
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useHistoryContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useRecentlyAdded: vi.fn(),
    useTopRated: vi.fn(),
    useWeeklyTop10: vi.fn(),
    useDailyTip: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-057'

function movie(name: string, rating: number | null = null): CatalogItemOut {
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
    added_at: null,
    provider_rating: rating,
  }
}

interface Data {
  top10?: DiscoveryPick[]
  tip?: CatalogItemOut[]
  added?: CatalogItemOut[]
  rated?: CatalogItemOut[]
}

function mockData({ top10 = [], tip = [], added = [], rated = [] }: Data = {}) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: added, isLoading: false })
  vi.mocked(catalogApi.useTopRated).mockReturnValue({ data: rated, coveredCategories: 1, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useWeeklyTop10).mockReturnValue({ data: top10, coveredCategories: 1, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useDailyTip).mockReturnValue({ data: tip, coveredCategories: 1, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({ data: { items: [], totalCount: 0, outcome: 'fresh' }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(new Map<number, CategoryPreview>([[1, { status: 'pending', items: [] }]]))
}

function wrapper(restore?: VodShowcaseFocus) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const ui = (): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <VodShowcaseScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onOpenTarget={vi.fn()} restore={restore} onBack={vi.fn()} onResync={vi.fn()} />
    </QueryClientProvider>
  )
  const view = render(ui())
  return { rerender: () => view.rerender(ui() as never) }
}

function tap(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
}

const focusedRowLabel = () => document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')?.getAttribute('aria-label') ?? null
const focusedCardText = () => document.querySelector('.vod-showcase .tv-focus')?.closest('.content-card')?.textContent ?? null

const pick = (name: string, rank: number, rating: number | null = null): DiscoveryPick => ({ item: movie(name, rating), rank })

beforeEach(async () => {
  resetVodSessionMemory()
  await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('VodShowcaseScreen — Top 10 e Dica além do contrato (feature 057)', () => {
  it('o número do card é decorativo (aria-hidden), o selo de nota do provedor segue nos cards e a fileira não tem "Ver tudo"', () => {
    mockData({ top10: [pick('Um', 1, 8.1), pick('Dois', 2), pick('Quatro', 4)] })
    wrapper()
    const section = document.querySelector('section.vod-row[aria-label="Top 10 filmes da semana"]')!
    expect([...section.querySelectorAll('.content-card-rank')].every((rank) => rank.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(section.querySelector('.content-card')!.textContent).toContain('★ 8,1')
    expect(section.querySelector('.vod-see-all-card')).toBeNull()
    expect(section.querySelector('.vod-row-seeall')).toBeNull()
    expect(section.querySelectorAll('.content-card').length).toBe(3)
  })

  it('a Dica e as demais fileiras de itens nunca mostram número de posição', () => {
    mockData({ tip: [movie('T1'), movie('T2')], added: [movie('A1')] })
    wrapper()
    expect(document.querySelector('section.vod-row[aria-label="Dica de filme"] .content-card-rank')).toBeNull()
    expect(document.querySelector('section.vod-row[aria-label="Adicionados recentemente"] .content-card-rank')).toBeNull()
  })

  it('voltar do detalhe restaura o foco no mesmo card por id; id que sumiu cai no 1º card da mesma fileira', () => {
    const top10 = [pick('Um', 1), pick('Dois', 2), pick('Quatro', 4)]
    mockData({ top10 })
    wrapper({ row: 'top10', id: 'id-Dois' })
    expect(focusedRowLabel()).toBe('Top 10 filmes da semana')
    expect(focusedCardText()).toContain('Dois')
    cleanup()

    mockData({ top10 })
    wrapper({ row: 'top10', id: 'id-sumiu' })
    expect(focusedRowLabel()).toBe('Top 10 filmes da semana')
    expect(focusedCardText()).toContain('Um')
  })

  it('o mesmo título na Dica e em "Adicionados recentemente" restaura pela fileira certa (rowKey + id)', () => {
    mockData({ tip: [movie('Repetido'), movie('Outro')], added: [movie('Repetido')] })
    wrapper({ row: 'tip', id: 'id-Repetido' })
    expect(focusedRowLabel()).toBe('Dica de filme')
    cleanup()
    mockData({ tip: [movie('Repetido'), movie('Outro')], added: [movie('Repetido')] })
    wrapper({ row: 'added', id: 'id-Repetido' })
    expect(focusedRowLabel()).toBe('Adicionados recentemente')
  })

  it('a fileira some com o foco nela e o foco cai numa fileira vizinha, sem se perder', () => {
    mockData({ top10: [pick('Um', 1), pick('Dois', 2), pick('Três', 3)], added: [movie('A1')] })
    const view = wrapper()
    expect(focusedRowLabel()).toBe('Top 10 filmes da semana')
    mockData({ added: [movie('A1')] }) // o TMDB deixou de valer (ex.: a chave foi removida)
    view.rerender()
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    expect(focusedRowLabel()).toBe('Adicionados recentemente')
    tap('ArrowRight')
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
  })
})
