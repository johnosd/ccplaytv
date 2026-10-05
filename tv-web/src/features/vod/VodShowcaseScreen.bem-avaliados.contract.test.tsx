/**
 * Teste de CONTRATO da feature 056 (fileira "Bem avaliados") — a fileira na tela hero de Filmes: cards na ordem recebida
 * com o selo da nota, aviso de cobertura parcial, "Ver tudo" que abre "Todos" ordenado por nota, e a fileira ausente (sem
 * slot "Em breve" e sem prender o foco) quando não há nota suficiente. Travado em
 * `sdd/specs/056-bem-avaliados/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados: `section.vod-row[aria-label="Bem avaliados"]`, `.content-card`, `.vod-see-all-card`, `.vod-slot-card`
 * e `.vod-row-coverage` (texto de escopo parcial no cabeçalho da fileira, só enquanto cobertas < total).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview } from '../catalog/catalogApi'
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
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-1'

function movie(name: string, rating: number | null): CatalogItemOut {
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

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

/**
 * Sem histórico/recentes e com 1 favorito (um card elegível, para o foco entrar nas fileiras):
 * ★ Favoritos, Bem avaliados (se houver) e "Ação". (Emenda 060, 2026-10-05: sem semente não há "Porque você assistiu".)
 */
function mockData(rated: { items: CatalogItemOut[]; covered: number; total: number }) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Ação', 0)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [movie('Fav', null)], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [], isLoading: false })
  vi.mocked(catalogApi.useTopRated).mockReturnValue({
    data: rated.items,
    coveredCategories: rated.covered,
    totalCategories: rated.total,
    isLoading: false,
  })
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

function renderShowcase(): Calls {
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

describe('VodShowcaseScreen — contrato da feature 056', () => {
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

  // US1/AC1, US1/AC3, US1/AC5, US2/AC1, FR-001, FR-004, FR-005, FR-006, FR-007, FR-014, Constitution: "Progresso e Capacidades São Reais" (escopo parcial)
  it('mostra os cards na ordem recebida com o selo da nota, avisa a cobertura parcial, abre o item no OK e o "Ver tudo" abre Todos ordenado por nota', () => {
    mockData({ items: [movie('Filme A', 9.2), movie('Filme B', 8.5), movie('Filme C', 7.4)], covered: 1, total: 2 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const calls = renderShowcase()

    goToRow('Bem avaliados')
    expect(focusedRowLabel()).toBe('Bem avaliados')
    const section = document.querySelector('section.vod-row[aria-label="Bem avaliados"]')!
    expect(section.querySelector('.vod-slot-card')).toBeNull() // fileira real: sem "Em breve"
    const cards = [...section.querySelectorAll('.content-card')].map((card) => card.textContent ?? '')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toContain('Filme A')
    expect(cards[0]).toContain('★ 9,2')
    expect(cards[1]).toContain('Filme B')
    expect(cards[2]).toContain('Filme C')
    expect(cards[2]).toContain('★ 7,4')
    // Escopo parcial (1 de 2 categorias obtidas): o texto aparece no cabeçalho da fileira.
    expect(section.querySelector('.vod-row-coverage')?.textContent).toContain('Com base em 1 de 2 categorias')

    // OK no card abre o item; o foco fica no card, nunca no selo.
    tap('Enter')
    expect(calls.onOpenItem.mock.calls.at(-1)?.[0]).toBe('id-Filme A')
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
    expect(document.querySelector('.vod-showcase .rating-badge.tv-focus')).toBeNull()

    // 3 cards → "Ver tudo": abre a grade de todos já ordenada por nota.
    tap('ArrowRight', 3)
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.vod-see-all-card')).not.toBeNull()
    tap('Enter')
    expect(calls.onOpenTarget.mock.calls.at(-1)?.[0]).toEqual({ kind: 'all', sort: 'rating' } satisfies VodTarget)
    expect(fetchSpy).not.toHaveBeenCalled() // nenhuma consulta externa
  })

  // US3/AC1, FR-003, FR-013, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('sem nota suficiente a fileira não existe (nem slot "Em breve") e o foco percorre as demais fileiras sem se perder', () => {
    mockData({ items: [], covered: 0, total: 1 })
    renderShowcase()

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
    expect(seen).toContain('★ Favoritos')
    expect(seen).toContain('Ação') // emenda 060: era "Porque você assistiu" (slot), que sem semente não existe mais
    expect(seen).not.toContain('Bem avaliados')
    expect(document.querySelector('section.vod-row[aria-label="Bem avaliados"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Títulos mais bem avaliados da sua lista')
  })
})
