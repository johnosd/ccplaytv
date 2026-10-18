/**
 * Teste de CONTRATO da feature 079 (Home, Filmes e Séries já montadas ao entrar) — Filmes/Séries: "Carregando" só depois de
 * 300 ms, teto de 2 s (era 3 s) e, depois do teto, fileira atrasada acima do que já está na tela fica para a próxima entrada.
 * Travado em `sdd/specs/079-home-carregamento-progressivo/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca
 * editá-lo.
 *
 * Seletores fixados: `section.vod-row[aria-label]`, o botão "Voltar" do estado de carregamento.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview, DiscoveryPick } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'

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
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
  }
})
vi.mock('../catalog/becauseApi', () => ({ useBecauseYouWatched: vi.fn(() => null) }))

const SOURCE_ID = 'source-079'

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
    added_at: null,
    provider_rating: null,
  }
}

/** "Adicionados" e "Em alta" ainda lendo; o resto já no aparelho (1 favorito, 1 categoria). */
const reads: { added?: CatalogItemOut[]; top10?: DiscoveryPick[] } = {}

function mockReads() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } satisfies CatalogCategory],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [movie('Fav')], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockImplementation(() => ({ data: reads.added, isLoading: reads.added === undefined }))
  vi.mocked(catalogApi.useTopRated).mockReturnValue({ data: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useWeeklyTop10).mockImplementation(() => ({
    data: reads.top10,
    coveredCategories: 1,
    totalCategories: 1,
    isLoading: reads.top10 === undefined,
  }))
  vi.mocked(catalogApi.useDailyTip).mockReturnValue({ data: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(new Map<number, CategoryPreview>([[1, { status: 'ready', items: [movie('A1')] }]]))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  delete reads.added
  delete reads.top10
})

const rowLabels = () => [...document.querySelectorAll('section.vod-row')].map((row) => row.getAttribute('aria-label'))

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('VodShowcaseScreen — contrato da feature 079', () => {
  // US2/AC2, US3/AC1, US3/AC3, FR-003, FR-004, FR-007, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('Filmes: sem "Carregando" antes de 300 ms; fileiras prontas e tardias entram na mesma visita em ordem', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    resetVodSessionMemory()
    mockReads()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    const element = (
      <VodShowcaseScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onOpenTarget={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
    )
    const { rerender } = render(element, { wrapper: Wrapper })

    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull() // não pisca
    expect(rowLabels()).toEqual([])
    advance(300)
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()

    advance(1) // 301 ms: janela curta
    expect(rowLabels()).toContain('★ Favoritos')
    expect(rowLabels()).toContain('Ação')
    expect(rowLabels()).not.toContain('Adicionados recentemente')
    expect(rowLabels()).not.toContain('Em alta esta semana')

    // Chegam depois, acima de "Ação" (já na tela): entram na mesma visita e reordenam a pilha.
    reads.added = [movie('Novo 1'), movie('Novo 2')]
    reads.top10 = [{ item: movie('Top 1'), rank: 1 }]
    rerender(
      <VodShowcaseScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onOpenTarget={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />,
    )
    advance(100)
    expect(rowLabels()).toContain('Adicionados recentemente')
    expect(rowLabels()).toContain('Em alta esta semana')
    expect(rowLabels()).toContain('★ Favoritos')
  })
})
