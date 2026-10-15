/**
 * Contrato da feature 025 (Filmes e Séries no DS V14) — memória de foco por entrada (§41 da Spec). Travado em
 * `sdd/specs/025-filmes-series-ds-v14/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 * EMENDADO pela feature 052: a ordem da side nav (★ Favoritos, ↺ Histórico, Todos, categorias) passou para a fileira de
 * Categorias da vitrine (contrato da 052, `VodShowcaseScreen.vitrine-filmes-series`); aqui fica o que a 025 prometia
 * sobre cada entrada lembrar o último card focado, agora na tela de categoria (`vodSessionMemory`, inalterada).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { VodCategoryScreen } from './VodCategoryScreen'
import type { VodTarget } from './vodTarget'

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

const SOURCE_ID = 'source-025-vod'

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

const focusedTitle = () => {
  const cell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
  return cell?.querySelector('.content-card-title')?.textContent ?? null
}

function mount(target: VodTarget) {
  return render(
    wrap(
      <VodCategoryScreen section="movies" sourceId={SOURCE_ID} target={target} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />,
    ),
  )
}

describe('VodCategoryScreen — contrato da feature 025 (emendado pela 052)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockBase([movie('Filme A1'), movie('Filme A2'), movie('Filme A3')])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await cleanSource()
  })

  // US1/AC6, FR-027, FR-030, SC-007, Constitution: "Voltar Restaura Foco e Posição" (reconciliação por id, não índice)
  it('cada entrada lembra o último card focado ao voltar a ela, sem misturar com as outras', () => {
    const acao: VodTarget = { kind: 'category', name: 'Ação' }
    const drama: VodTarget = { kind: 'category', name: 'Drama' }

    const first = mount(acao)
    expect(focusedTitle()).toBe('Filme A1') // entrada nova: começa no 1º card
    tap('ArrowRight')
    tap('ArrowRight')
    expect(focusedTitle()).toBe('Filme A3')
    first.unmount() // RETURN: vai embora (para a vitrine)

    const second = mount(drama)
    expect(focusedTitle()).toBe('Drama 1') // outra entrada: não herda o foco de "Ação"
    tap('ArrowRight')
    expect(focusedTitle()).toBe('Drama 2')
    second.unmount()

    const third = mount(acao)
    expect(focusedTitle()).toBe('Filme A3') // volta a "Ação": o último card focado ali
    third.unmount()

    mount(drama)
    expect(focusedTitle()).toBe('Drama 2')
  })
})
