/**
 * Teste de CONTRATO da feature 057 (Top 10 da semana e Dica, TMDB) — as fileiras na tela hero de Filmes e de Séries: cards com a
 * posição real do TMDB (sem renumerar), fonte TMDB, aviso de cobertura parcial, OK abre o título da lista, e a fileira ausente
 * (sem slot "Em breve" e sem prender o foco) quando não há dado. Travado em
 * `sdd/specs/057-top10-dica-tmdb/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados: `section.vod-row[aria-label="<título>"]`, `.content-card`, `.content-card-rank` (posição), `.vod-slot-card`,
 * `.vod-row-source` (procedência "TMDB" no cabeçalho da fileira) e `.vod-row-coverage` (escopo parcial, só enquanto cobertas < total).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview, DiscoveryPick } from '../catalog/catalogApi'
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
    useTopRated: vi.fn(),
    useWeeklyTop10: vi.fn(),
    useDailyTip: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-1'
type Kind = 'movie' | 'series'

function title(kind: Kind, name: string, rating: number | null = null): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
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

const pick = (kind: Kind, name: string, rank: number): DiscoveryPick => ({ item: title(kind, name), rank })

interface Discovery<T> {
  data: T[]
  covered: number
  total: number
}
const EMPTY = { data: [], covered: 0, total: 1 }

/** Sem histórico/recentes/notas e com 1 favorito (um card elegível para o foco entrar nas fileiras): ★ Favoritos, Top 10/Dica (se houver), Porque você assistiu (slot) e "Ação". */
function mockData(kind: Kind, over: { top10?: Discovery<DiscoveryPick>; tip?: Discovery<CatalogItemOut> } = {}) {
  const top10 = over.top10 ?? EMPTY
  const tip = over.tip ?? EMPTY
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind, name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } satisfies CatalogCategory],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [title(kind, 'Fav')], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [], isLoading: false })
  vi.mocked(catalogApi.useTopRated).mockReturnValue({ data: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useWeeklyTop10).mockReturnValue({ data: top10.data, coveredCategories: top10.covered, totalCategories: top10.total, isLoading: false })
  vi.mocked(catalogApi.useDailyTip).mockReturnValue({ data: tip.data, coveredCategories: tip.covered, totalCategories: tip.total, isLoading: false })
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [], totalCount: 0, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(new Map<number, CategoryPreview>([[1, { status: 'pending', items: [] }]]))
}

interface Calls {
  onOpenItem: Mock<(itemId: string, from: VodShowcaseFocus) => void>
  onOpenTarget: Mock<(target: VodTarget, from: VodShowcaseFocus) => void>
}

function renderShowcase(section: 'movies' | 'series'): Calls {
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
        section={section}
        sourceId={SOURCE_ID}
        onOpenItem={calls.onOpenItem}
        onOpenTarget={calls.onOpenTarget}
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

function focusedRowLabel(): string | null {
  return document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')?.getAttribute('aria-label') ?? null
}

/** Anda pelas fileiras até a de `label` (a entrada inicial pode estar acima ou abaixo dela). */
function goToRow(label: string) {
  for (let i = 0; i < 6 && focusedRowLabel() !== label; i += 1) tap('ArrowDown')
  for (let i = 0; i < 6 && focusedRowLabel() !== label; i += 1) tap('ArrowUp')
}

const rowOf = (label: string) => document.querySelector(`section.vod-row[aria-label="${label}"]`)

/** Visita o foco pelas fileiras e devolve os rótulos vistos; em todo passo há exatamente um foco. */
function visitRows(): string[] {
  const seen: string[] = []
  const visit = () => {
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    const label = focusedRowLabel()
    if (label !== null && !seen.includes(label)) seen.push(label)
  }
  visit()
  tap('ArrowUp')
  visit()
  for (let i = 0; i < 5; i += 1) {
    tap('ArrowDown')
    visit()
  }
  return seen
}

describe('VodShowcaseScreen — contrato da feature 057', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    try {
      localStorage.clear()
    } catch {
      // armazenamento indisponível: o teste segue sem preferência salva
    }
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
    vi.restoreAllMocks()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  // US1/AC1, US1/AC2, US1/AC4..AC7, FR-001, FR-003, FR-012, FR-013, FR-014, FR-020, Constitution: "Progresso e Capacidades São Reais" / "Foco Visível e Sem Becos Sem Saída"
  it('Top 10 da semana: cards com a posição real do TMDB, fonte TMDB, aviso de cobertura parcial, OK abre o título; em Séries é o de séries; sem dado a fileira não existe (nem "Em breve") e o foco não se perde', () => {
    mockData('movie', { top10: { data: [pick('movie', 'Filme 1', 1), pick('movie', 'Filme 3', 3), pick('movie', 'Filme 4', 4)], covered: 1, total: 2 } })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const calls = renderShowcase('movies')

    goToRow('Top 10 filmes da semana')
    expect(focusedRowLabel()).toBe('Top 10 filmes da semana')
    const section = rowOf('Top 10 filmes da semana')
    expect(section).not.toBeNull()
    expect(section!.querySelector('.vod-slot-card')).toBeNull() // fileira real: sem "Em breve"
    const cards = [...section!.querySelectorAll('.content-card')]
    expect(cards.map((card) => card.querySelector('.content-card-rank')?.textContent)).toEqual(['1', '3', '4']) // posição real, sem renumerar
    expect(cards[0].textContent).toContain('Filme 1')
    expect(cards[2].textContent).toContain('Filme 4')
    expect(section!.querySelector('.vod-row-source')?.textContent).toContain('TMDB')
    expect(section!.querySelector('.vod-row-coverage')?.textContent).toContain('Com base em 1 de 2 categorias')

    // OK abre o título da lista; mover o foco só muda de card.
    tap('Enter')
    expect(calls.onOpenItem.mock.calls.at(-1)?.[0]).toBe('id-Filme 1')
    tap('ArrowRight')
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    tap('Enter')
    expect(calls.onOpenItem.mock.calls.at(-1)?.[0]).toBe('id-Filme 3')
    expect(fetchSpy).not.toHaveBeenCalled() // focar/abrir não consulta nada

    // Séries: o Top 10 é o de séries.
    cleanup()
    mockData('series', { top10: { data: [pick('series', 'Série 2', 2), pick('series', 'Série 5', 5), pick('series', 'Série 7', 7)], covered: 1, total: 1 } })
    renderShowcase('series')
    goToRow('Top 10 séries da semana')
    expect(focusedRowLabel()).toBe('Top 10 séries da semana')
    expect([...rowOf('Top 10 séries da semana')!.querySelectorAll('.content-card-rank')].map((rank) => rank.textContent)).toEqual(['2', '5', '7'])
    expect(rowOf('Top 10 séries da semana')!.querySelector('.vod-row-coverage')).toBeNull() // cobertura completa: sem aviso

    // Sem dado (sem chave, sem cache ou poucos títulos na lista): a fileira não existe, nem como slot "Em breve".
    cleanup()
    mockData('movie')
    renderShowcase('movies')
    const seen = visitRows()
    expect(seen).toContain('★ Favoritos')
    expect(seen).toContain('Porque você assistiu')
    expect(seen).not.toContain('Top 10 filmes da semana')
    expect(rowOf('Top 10 filmes da semana')).toBeNull()
    expect(document.body.textContent).not.toContain('Top 10 filmes da semana, com dados do TMDB.')
  })

  // US2/AC1, US2/AC5..AC7, FR-005, FR-012, FR-013, FR-014, FR-020, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('Dica: "Dica de filme"/"Dica de série" entre as fileiras de destaque e "Porque você assistiu", com fonte TMDB e OK abre o título; sem dado a fileira não existe', () => {
    mockData('movie', { tip: { data: [title('movie', 'Dica 1'), title('movie', 'Dica 2', 8.1)], covered: 2, total: 2 } })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const calls = renderShowcase('movies')

    goToRow('Dica de filme')
    expect(focusedRowLabel()).toBe('Dica de filme')
    const section = rowOf('Dica de filme')
    expect(section).not.toBeNull()
    const cards = [...section!.querySelectorAll('.content-card')].map((card) => card.textContent ?? '')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toContain('Dica 1')
    expect(cards[1]).toContain('Dica 2')
    expect(section!.querySelector('.vod-row-source')?.textContent).toContain('TMDB')
    expect(section!.querySelector('.vod-row-coverage')).toBeNull() // cobertura completa: sem aviso
    tap('Enter')
    expect(calls.onOpenItem.mock.calls.at(-1)?.[0]).toBe('id-Dica 1')

    // Posição: depois de ★ Favoritos (aqui não há "Adicionados"/"Bem avaliados") e antes de "Porque você assistiu".
    tap('ArrowDown')
    expect(focusedRowLabel()).toBe('Porque você assistiu')
    tap('ArrowUp')
    tap('ArrowUp')
    expect(focusedRowLabel()).toBe('★ Favoritos')
    expect(fetchSpy).not.toHaveBeenCalled()

    // Séries: a dica é de série.
    cleanup()
    mockData('series', { tip: { data: [title('series', 'Dica S1')], covered: 1, total: 1 } })
    renderShowcase('series')
    goToRow('Dica de série')
    expect(focusedRowLabel()).toBe('Dica de série')
    expect(rowOf('Dica de série')!.textContent).toContain('Dica S1')

    // Sem dado: a fileira não existe e o foco percorre as demais sem se perder.
    cleanup()
    mockData('movie')
    renderShowcase('movies')
    const seen = visitRows()
    expect(seen).toContain('Porque você assistiu')
    expect(seen).not.toContain('Dica de filme')
    expect(rowOf('Dica de filme')).toBeNull()
  })
})
