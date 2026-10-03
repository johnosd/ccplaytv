/**
 * Teste de CONTRATO da feature 053 (carrosséis na tela hero de Filmes e Séries) — carrosséis por categoria com "Ver tudo",
 * slots reservados "Em breve" e lista lateral recolhível. Travado em
 * `sdd/specs/053-carrosseis-filmes-series/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade):
 * - `.vod-showcase`: raiz; cada fileira é `section.vod-row[aria-label]` (a ordem é verificada pelo FOCO ao descer, porque
 *   a pilha vertical pode ser virtualizada e só monta as fileiras próximas).
 * - `.content-card` (item), `.vod-see-all-card` ("Ver tudo" final de cada fileira), `.vod-slot-card` (único cartão
 *   focável de um slot reservado: `aria-disabled="true"`, texto com "Em breve").
 * - `.vod-side-panel` ganha a classe `is-collapsed` enquanto o foco está nas fileiras; as entradas `.side-category-nav-item`\n *   continuam no DOM (e focáveis) nos dois estados. Não há alternância manual nem preferência salva.\n * Teclas: setas e Enter (como a Home); ← no 1º cartão vai à lista lateral (expande); na lista, ← → paginam e → depois da\n *   última entrada entra nos cards (recolhe).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview } from '../catalog/catalogApi'
import type { VodShowcaseFocus, VodTarget } from './vodTarget'
import type { VodSection } from './vodSessionMemory'
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
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
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

function mockData() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Ação', 0), category(2, 'Drama', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: [movie('H1'), movie('H2')], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [movie('F1')], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: [movie('A1', 30), movie('A2', 20)], isLoading: false })
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [], totalCount: 0, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 2, isLoading: false })
  // "Ação" já está no aparelho; "Drama" ainda não foi obtida (pendente: só o cabeçalho e o "Ver tudo").
  const previews = new Map<number, CategoryPreview>([
    [1, { status: 'ready', items: [movie('X1'), movie('X2')] }],
    [2, { status: 'pending', items: [] }],
  ])
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(previews)
}

interface Calls {
  onOpenItem: Mock<(itemId: string, from: VodShowcaseFocus) => void>
  onOpenTarget: Mock<(target: VodTarget, from: VodShowcaseFocus) => void>
}

function renderShowcase(restore?: VodShowcaseFocus, section: VodSection = 'movies'): Calls {
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

/** Rótulo da fileira que contém o foco de estado, ou `null`. */
function focusedRowLabel(): string | null {
  return document.querySelector('.vod-showcase .tv-focus')?.closest('section.vod-row')?.getAttribute('aria-label') ?? null
}

function focusedCardText(): string | null {
  const focused = document.querySelector('.vod-showcase .tv-focus')
  return focused?.closest('.content-card, .side-category-nav-item, .vod-see-all-card, .vod-slot-card')?.textContent ?? null
}

describe('VodShowcaseScreen — contrato da feature 053', () => {
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

  // US1/AC1..AC4, FR-001, FR-002, FR-003, FR-007, FR-013, Constitution: "Voltar Restaura Foco e Posição"
  it('um carrossel por categoria depois das fileiras fixas; "Ver tudo" abre a categoria; categoria pendente não inventa cards; voltar restaura por id', () => {
    mockData()
    const first = renderShowcase()

    const seen: string[] = []
    for (let i = 0; i < 8; i += 1) {
      seen.push(focusedRowLabel() ?? '(sem foco)')
      if (i < 7) tap('ArrowDown')
    }
    expect(seen).toEqual([
      'Continue assistindo',
      'Top 10 filmes da semana',
      '★ Favoritos',
      'Adicionados recentemente',
      'Bem avaliados',
      'Porque você assistiu',
      'Ação',
      'Drama',
    ])
    tap('ArrowDown') // última fileira: nada a fazer, o foco não some
    expect(focusedRowLabel()).toBe('Drama')

    // Categoria obtida: itens reais (na ordem da fonte); OK abre o item; "Ver tudo" abre a categoria.
    tap('ArrowUp')
    expect(focusedRowLabel()).toBe('Ação')
    expect(focusedCardText()).toContain('X1')
    tap('Enter')
    expect(first.onOpenItem.mock.calls.at(-1)?.[0]).toBe('id-X1')
    tap('ArrowRight', 2) // X1 → X2 → "Ver tudo"
    tap('Enter')
    expect(first.onOpenTarget.mock.calls.at(-1)?.[0]).toEqual({ kind: 'category', name: 'Ação' } satisfies VodTarget)

    // Categoria pendente: sem cards inventados, mas com "Ver tudo" focável que abre a categoria.
    tap('ArrowDown')
    expect(focusedRowLabel()).toBe('Drama')
    expect(document.querySelectorAll('section.vod-row[aria-label="Drama"] .content-card').length).toBe(0)
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('.vod-see-all-card')).not.toBeNull()
    tap('Enter')
    const [target, from] = first.onOpenTarget.mock.calls.at(-1)!
    expect(target).toEqual({ kind: 'category', name: 'Drama' } satisfies VodTarget)
    cleanup()

    // Voltar: remonta com o foco entregue → a mesma fileira e o mesmo cartão, por id.
    renderShowcase(from)
    expect(focusedRowLabel()).toBe('Drama')
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)
  })

  // US4/AC1..AC4, FR-008, FR-009, FR-011, Constitution: "Foco Visível…" + "Trailers e Metadados Não Alteram…" (nada externo ao focar)
  it('slots reservados são focáveis e "Em breve", não navegam, não consultam a rede e não prendem o foco; o Top 10 acompanha a seção', () => {
    mockData()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const calls = renderShowcase()

    tap('ArrowDown') // Continue → Top 10 (slot)
    expect(focusedRowLabel()).toBe('Top 10 filmes da semana')
    const slot = document.querySelector('.vod-showcase .tv-focus')?.closest('.vod-slot-card')
    expect(slot).not.toBeNull()
    expect(slot!.getAttribute('aria-disabled')).toBe('true')
    expect(slot!.textContent).toContain('Em breve')
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)

    tap('Enter') // soft-disabled: só anuncia "Em breve"
    tap('ArrowRight')
    expect(calls.onOpenItem).not.toHaveBeenCalled()
    expect(calls.onOpenTarget).not.toHaveBeenCalled()
    expect(focusedRowLabel()).toBe('Top 10 filmes da semana')

    tap('ArrowDown', 3) // Favoritos → Recentes → Bem avaliados (outro slot)
    expect(focusedRowLabel()).toBe('Bem avaliados')
    tap('ArrowDown')
    tap('ArrowUp', 5) // Porque você assistiu → … → Continue
    expect(focusedRowLabel()).toBe('Continue assistindo')
    expect(fetchSpy).not.toHaveBeenCalled()
    cleanup()

    mockData()
    renderShowcase(undefined, 'series')
    tap('ArrowDown')
    expect(focusedRowLabel()).toBe('Top 10 séries da semana')
  })

  // US2/AC1..AC5, FR-004, FR-005, FR-013 (EMENDADO a pedido do usuário em 2026-10-03, R-016: ← → paginam a lista; ela
  // só recolhe ao entrar nos cards), Constitution: "Toda Ação Essencial Tem Caminho Completo por Controle Remoto"
  it('← → paginam a lista lateral; ela só recolhe quando → a termina e entra nos cards, e expande ao voltar a ela', () => {
    mockData()
    const first = renderShowcase()
    const panel = () => document.querySelector('.vod-showcase .vod-side-panel')
    const collapsed = () => panel()!.classList.contains('is-collapsed')
    expect(panel()).not.toBeNull()
    expect(collapsed()).toBe(true) // o foco começa nas fileiras: lista recolhida
    expect(document.querySelectorAll('.vod-showcase .side-category-nav-item').length).toBe(5)

    tap('ArrowLeft') // 1º cartão → lista lateral: expande
    expect(focusedCardText()).toContain('Favoritos')
    expect(collapsed()).toBe(false)

    // ← → paginam a lista (uma página cabe a lista toda) e NÃO recolhem nem entram nos cards.
    tap('ArrowRight')
    expect(focusedCardText()).toContain('Drama') // última entrada
    expect(collapsed()).toBe(false)
    expect(focusedRowLabel()).toBeNull()
    tap('ArrowLeft')
    expect(focusedCardText()).toContain('Favoritos') // primeira entrada
    expect(collapsed()).toBe(false)
    tap('ArrowLeft') // já na primeira: nada acontece, nada recolhe
    expect(focusedCardText()).toContain('Favoritos')
    expect(collapsed()).toBe(false)

    // Terminada a lista, → entra nos cards e só então ela recolhe.
    tap('ArrowRight')
    tap('ArrowRight')
    expect(focusedRowLabel()).toBe('Continue assistindo')
    expect(collapsed()).toBe(true)
    expect(document.querySelectorAll('.vod-showcase .tv-focus').length).toBe(1)

    // Voltando (←), expande de novo e a entrada continua navegável: ↑↓ andam e OK abre o destino.
    tap('ArrowLeft')
    expect(collapsed()).toBe(false)
    tap('ArrowUp', 5) // sobe até a primeira
    tap('ArrowDown', 3)
    expect(focusedCardText()).toContain('Ação')
    tap('Enter')
    expect(first.onOpenTarget.mock.calls.at(-1)?.[0]).toEqual({ kind: 'category', name: 'Ação' } satisfies VodTarget)
  })})
