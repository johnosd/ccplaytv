/** Feature 050 (T006): hero de Séries — rótulo `CCPLAY SÉRIES` e capa que falha some, a camada fica. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesScreen } from './SeriesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from '../vod/vodSessionMemory'
import { db } from '../../lib/catalog/db'

const saved: Record<string, PropertyDescriptor | undefined> = {}
let restoreResizeObserver: typeof globalThis.ResizeObserver | undefined

beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  saved.scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  restoreResizeObserver = globalThis.ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
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
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
})

afterAll(() => {
  for (const [key, target] of [
    ['offsetHeight', HTMLElement.prototype],
    ['offsetWidth', HTMLElement.prototype],
    ['clientHeight', Element.prototype],
    ['scrollHeight', Element.prototype],
  ] as const) {
    if (saved[key]) Object.defineProperty(target, key, saved[key]!)
  }
  globalThis.ResizeObserver = restoreResizeObserver as typeof ResizeObserver
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-1'
const COVER = 'https://img.test/s1.jpg'

function serie(): CatalogItemOut {
  return {
    id: 'id-S1',
    kind: 'series',
    name: 'Série S1',
    original_group: 'Drama',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    series_id: 's1',
    original_name: 'Série S1',
    icon_url: COVER,
  } as CatalogItemOut
}

function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

describe('SeriesScreen — hero (feature 050)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: [{ id: 1, kind: 'series', name: 'Drama', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } as CatalogCategory],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [serie()], totalCount: 1, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
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
  })

  it('rótulo CCPLAY SÉRIES e capa que falha ao carregar some, mantendo a camada', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    render(
      <Wrapper>
        <SeriesScreen sourceId={SOURCE_ID} onOpenSeries={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )
    tap('Enter') // entra em "Drama"
    expect(document.querySelector('.vod-hero-eyebrow')?.textContent).toBe('CCPLAY SÉRIES')
    const img = document.querySelector('.vod-hero-art img')
    expect(img?.getAttribute('src')).toBe(COVER)
    fireEvent.error(img!)
    expect(document.querySelector('.vod-hero-art img')).toBeNull()
    expect(document.querySelector('.vod-hero-art')).not.toBeNull()
  })
})
