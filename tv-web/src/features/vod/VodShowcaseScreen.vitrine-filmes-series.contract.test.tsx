/**
 * Teste de CONTRATO da feature 052 (vitrine de Filmes e Séries) — fileiras reais, categorias e foco restaurado por
 * id. Travado em `sdd/specs/052-vitrine-filmes-series/contract-tests.lock`. O sdd-execute só pode fazê-lo passar,
 * nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade):
 * - `.vod-showcase`: raiz da vitrine; dentro dela, cada fileira é `section.vod-row[aria-label]` (rótulos exatos:
 *   "Continue assistindo", "★ Favoritos", "Adicionados recentemente", "Categorias").
 * - `.content-card` (item), `.vod-category-card` (cartão de categoria, texto = nome + contagem) e
 *   `.vod-see-all-card` (cartão "Ver tudo"): os três tipos de cartão; o focado contém um elemento `.tv-focus`.
 * - `.vod-hero-band`: a hero (não focável), como na 050.
 * Teclas: ← → andam na fileira, ↑ ↓ trocam de fileira, Enter seleciona (como a Home).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import type { VodShowcaseFocus, VodTarget } from './vodTarget'
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
    useCategoryContent: vi.fn(),
    useCategoryPreviews: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-1'

function movie(name: string, addedAt?: number): CatalogItemOut {
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
    added_at: addedAt ?? null,
  }
}

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

interface Data {
  history: CatalogItemOut[]
  favorites: CatalogItemOut[]
  added: CatalogItemOut[]
}

function mockData(data: Data) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Ação', 0), category(2, 'Drama', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: data.history, unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: data.favorites, unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: data.added, isLoading: false })
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [], totalCount: 0, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(new Map())
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 2, isLoading: false })
}

const FULL: Data = {
  history: [movie('H1'), movie('H2')],
  favorites: [movie('F1')],
  added: [movie('A1', 30), movie('A2', 20), movie('A3', 10)],
}

interface Calls {
  onOpenItem: Mock<(itemId: string, from: VodShowcaseFocus) => void>
  onOpenTarget: Mock<(target: VodTarget, from: VodShowcaseFocus) => void>
}

function renderShowcase(restore?: VodShowcaseFocus): Calls {
  const calls: Calls = {
    onOpenItem: vi.fn<(itemId: string, from: VodShowcaseFocus) => void>(),
    onOpenTarget: vi.fn<(target: VodTarget, from: VodShowcaseFocus) => void>(),
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <VodShowcaseScreen
        section="movies"
        sourceId={SOURCE_ID}
        onOpenItem={calls.onOpenItem}
        onOpenTarget={calls.onOpenTarget}
        restore={restore}
        onBack={vi.fn()}
        onResync={vi.fn()}
      />
    </Wrapper>,
  )
  return calls
}

function tap(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
}

/**
 * Rótulos das fileiras na ordem, percorridas pelo FOCO (↓ até não mudar) — emenda da 053 (R-017): a pilha de fileiras
 * passou a ser virtualizada e inclui os slots reservados e uma fileira por categoria; vazio se o foco não está numa fileira.
 */
function rowLabels(): string[] {
  const labels: string[] = []
  for (let i = 0; i < 16; i += 1) {
    const label = document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')?.getAttribute('aria-label') ?? null
    if (label === null || labels.at(-1) === label) break
    labels.push(label)
    tap('ArrowDown')
  }
  return labels
}

function categoryLabels(): string[] {
  return [...document.querySelectorAll('.vod-showcase .side-category-nav-item')].map((el) => el.textContent ?? '')
}

/** Texto do cartão que tem o foco de estado, ou `null`. */
function focusedCardText(): string | null {
  const focused = document.querySelector('.vod-showcase .tv-focus')
  return focused?.closest('.content-card, .side-category-nav-item, .vod-see-all-card')?.textContent ?? null
}

describe('VodShowcaseScreen — contrato da feature 052', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
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

  // US2/AC1..AC4+AC7, FR-001, FR-002, FR-005, FR-010, FR-014,
  // Constitution: "Foco Visível e Sem Becos Sem Saída" (sem dados, a fileira de Categorias leva o foco)
  it('mostra só as fileiras com dado real + lista lateral de categorias (★, ↺, Todos primeiro); sem dado, o foco fica na lista lateral', () => {
    mockData(FULL)
    renderShowcase()

    expect(categoryLabels().map((text) => ['Favoritos', 'Histórico', 'Todos', 'Ação', 'Drama'].findIndex((n) => text.includes(n)))).toEqual([0, 1, 2, 3, 4])
    // A hero existe, acompanha o foco (1º card de "Continue assistindo") e não tem nada focável.
    const hero = document.querySelector('.vod-hero-band')
    expect(hero).not.toBeNull()
    expect(hero!.textContent).toContain('H1')
    expect(hero!.querySelectorAll('button, a, input, [tabindex]').length).toBe(0)
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    expect(focusedCardText()).toContain('H1')
    // Só as fileiras de itens com dado entram (+ as categorias, emenda 053). Emenda 060 (2026-10-05, autorizada pelo
    // usuário): "Porque você assistiu" deixou de ser slot reservado — sem semente, não existe.
    expect(rowLabels()).toEqual(['Continue assistindo', '★ Favoritos', 'Adicionados recentemente', 'Ação', 'Drama'])
    cleanup()

    mockData({ history: [], favorites: [], added: [] })
    renderShowcase()
    expect(rowLabels()).toEqual([])
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    expect(focusedCardText()).toContain('Favoritos')
  })

  // US1/AC1+AC5, US2/AC6, FR-004, FR-005, FR-009,
  // Constitution: "Voltar Restaura Foco e Posição" (por id; id que sumiu cai num vizinho da mesma fileira)
  it('OK abre item, categoria e "Ver tudo" com o destino certo; o foco devolvido restaura o mesmo cartão por id', () => {
    mockData(FULL)
    const first = renderShowcase()

    tap('Enter') // 1º card de "Continue assistindo"
    expect(first.onOpenItem).toHaveBeenCalledTimes(1)
    expect(first.onOpenItem.mock.calls[0][0]).toBe('id-H1')

    tap('ArrowRight', 2) // H1 → H2 → "Ver tudo"
    tap('Enter')
    expect(first.onOpenTarget.mock.calls.at(-1)?.[0]).toEqual({ kind: 'history' } satisfies VodTarget)

    tap('ArrowDown') // → ★ Favoritos (o Top 10 só existe com dado do TMDB, feature 057)
    tap('ArrowRight') // F1 → "Ver tudo"
    tap('Enter')
    expect(first.onOpenTarget.mock.calls.at(-1)?.[0]).toEqual({ kind: 'favorites' } satisfies VodTarget)

    tap('ArrowDown') // Adicionados recentemente
    tap('ArrowRight', 3) // A1 → A2 → A3 → "Ver tudo"
    tap('Enter')
    expect(first.onOpenTarget.mock.calls.at(-1)?.[0]).toEqual({ kind: 'all', sort: 'added' } satisfies VodTarget)

    tap('ArrowLeft', 4) // A3 → A2 → A1 → lista lateral (★ Favoritos, ↺ Histórico, Todos, Ação, Drama)
    tap('ArrowDown', 3) // → "Ação"
    expect(focusedCardText()).toContain('Ação')
    tap('Enter')
    const [target, from] = first.onOpenTarget.mock.calls.at(-1)!
    expect(target).toEqual({ kind: 'category', name: 'Ação' } satisfies VodTarget)
    cleanup()

    // Voltar: remonta com o foco entregue → o mesmo cartão, por id.
    renderShowcase(from)
    expect(focusedCardText()).toContain('Ação')
    cleanup()

    // Id que sumiu (o item saiu do histórico): cai num cartão da MESMA fileira, nunca perde o foco.
    renderShowcase({ row: 'continue', id: 'id-sumiu' })
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    const fallback = document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')
    expect(fallback?.getAttribute('aria-label')).toBe('Continue assistindo')
  })
})

