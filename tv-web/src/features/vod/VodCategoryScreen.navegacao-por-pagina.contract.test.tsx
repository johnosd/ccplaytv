/**
 * Contrato da feature 049 (navegação por página), parte de Filmes/Séries — travado em
 * `sdd/specs/049-navegacao-por-pagina/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 * EMENDADO pela feature 052: a trilha de categorias (que a 049 paginava) deixou de existir em Filmes/Séries; o que
 * resta do contrato é a grade da tela de categoria — cartão a cartão, linha a linha (6 colunas), sem salto de página
 * por ← → e sem trilha à esquerda (← na 1ª coluna não faz nada; ↑ da 1ª linha vai à toolbar).
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

const SOURCE_ID = 'source-049-vod'

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

describe('VodCategoryScreen — contrato da feature 049 (emendado pela 052)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await seedSource()
    mockBase(Array.from({ length: 14 }, (_, i) => movie(`Filme ${String(i + 1).padStart(2, '0')}`)))
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await cleanSource()
  })

  // US4/FR-011 (a grade segue cartão a cartão), Constitution: Foco Visível e Sem Becos Sem Saída (↑ sai pela toolbar)
  it('grade: → anda cartão a cartão, ↓ desce uma linha de 6, ← na 1ª coluna não faz nada e ↑ da 1ª linha vai à toolbar', () => {
    const onBack = vi.fn()
    render(
      wrap(
        <VodCategoryScreen section="movies" sourceId={SOURCE_ID} target={{ kind: 'category', name: 'Ação' }} onOpenItem={vi.fn()} onBack={onBack} onResync={vi.fn()} />,
      ),
    )
    expect(focusedTitle()).toBe('Filme 01')
    tap('ArrowRight')
    expect(focusedTitle()).toBe('Filme 02')
    tap('ArrowDown') // +6
    expect(focusedTitle()).toBe('Filme 08')
    tap('ArrowLeft')
    expect(focusedTitle()).toBe('Filme 07') // 1ª coluna da 2ª linha
    tap('ArrowLeft') // 1ª coluna: sem trilha, não faz nada
    expect(focusedTitle()).toBe('Filme 07')
    expect(onBack).not.toHaveBeenCalled()
    tap('ArrowUp')
    expect(focusedTitle()).toBe('Filme 01')
    tap('ArrowUp') // 1ª linha: sai pela toolbar
    expect(document.querySelector('.vod-toolbar-search-button')).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.vod-grid .tv-focus')).toHaveLength(0)
    tap('ArrowDown') // volta à grade
    expect(focusedTitle()).toBe('Filme 01')
  })
})
