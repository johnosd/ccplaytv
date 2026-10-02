/**
 * Trilha de Filmes e Séries por página (feature 049, US4) — complementar ao contrato
 * `VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`: as duas seções, trilhas
 * virtuais (Favoritos/Todos) e a toolbar com ←/→ próprios, que não muda.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCatalogScreen } from './VodCatalogScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'

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
      this.callback([{ contentRect: { width: 1200 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
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
    resolveCatalogItemId: vi.fn(async (itemId: string) => itemId),
  }
})

const SOURCE_ID = 'source-049-vod-paginacao'

function category(id: number, kind: 'movie' | 'series'): CatalogCategory {
  return { id, kind, name: `Cat ${String(id).padStart(2, '0')}`, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function item(name: string, kind: 'movie' | 'series'): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
    name,
    original_group: 'G',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    year: null,
  }
}

const labels = () => [...document.querySelectorAll('.side-category-nav-label')].map((el) => el.textContent ?? '')
const focused = () => document.querySelector('.side-category-nav-item.tv-focus .side-category-nav-label')?.textContent ?? null

function tap(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function renderSection(section: 'movies' | 'series') {
  const kind = section === 'movies' ? 'movie' : 'series'
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: Array.from({ length: 20 }, (_, i) => category(i + 1, kind)),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? [item(`T${cat.id}A`, kind), item(`T${cat.id}B`, kind)] : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 0, isLoading: false })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  render(
    <Wrapper>
      <VodCatalogScreen section={section} sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
}

describe('VodCatalogScreen — paginação da trilha (feature 049)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte 049 vod paginação',
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

  it.each(['movies', 'series'] as const)('%s: → anda uma página da trilha e para no fim; ← volta e para no começo', async (section) => {
    renderSection(section)
    const all = labels()
    const start = all.indexOf(focused() ?? '')
    expect(start).toBeGreaterThanOrEqual(0)

    tap('ArrowRight')
    await waitFor(() => expect(focused()).toBe(all[Math.min(start + 11, all.length - 1)]))
    tap('ArrowRight')
    tap('ArrowRight')
    await waitFor(() => expect(focused()).toBe(all[all.length - 1]))
    tap('ArrowRight')
    expect(focused()).toBe(all[all.length - 1])

    tap('ArrowLeft')
    tap('ArrowLeft')
    tap('ArrowLeft')
    await waitFor(() => expect(focused()).toBe(all[0]))
    expect(document.querySelectorAll('.content-card')).toHaveLength(0) // nada foi aberto
  })

  it('OK entra na categoria focada pela paginação e RETURN volta à trilha na mesma entrada', async () => {
    renderSection('movies')
    const all = labels()
    tap('ArrowRight')
    await waitFor(() => expect(focused()).not.toBeNull())
    const landed = focused()
    tap('Enter')
    await waitFor(() => expect(document.querySelectorAll('.content-card').length).toBeGreaterThan(0))
    tap('Escape')
    await waitFor(() => expect(focused()).toBe(landed))
    expect(all.includes(landed ?? '')).toBe(true)
  })
})
