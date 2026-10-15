import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCategoryScreen } from './VodCategoryScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import type { VodCategoryRestore, VodTarget } from './vodTarget'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'

let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreOffsetWidth: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreScrollHeight: PropertyDescriptor | undefined
let restoreResizeObserver: typeof globalThis.ResizeObserver | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
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
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', restoreScrollHeight)
  globalThis.ResizeObserver = restoreResizeObserver as typeof ResizeObserver
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
  }
})

const SOURCE_ID = 'source-window-065'
const category = (id: number, name = 'Todos'): CatalogCategory => ({
  id,
  kind: 'movie',
  name,
  order: 0,
  count: 0,
  fetchMode: 'on_demand',
  providerCategoryId: String(id),
})

const movie = (name: string, providerStreamId = name): CatalogItemOut => ({
  id: `id-${providerStreamId}`,
  kind: 'movie',
  name,
  original_name: name,
  original_group: 'Todos',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: providerStreamId,
})

function mockCategories(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockCategoryContent(items: CatalogItemOut[]) {
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items, totalCount: items.length, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function focusedTitle(): string | undefined {
  const cell = [...document.querySelectorAll('.vod-grid-cell')].find((element) => element.querySelector('.tv-focus'))
  return cell?.querySelector('.content-card-title')?.textContent ?? undefined
}

function gridTitles(): string[] {
  return [...document.querySelectorAll('.vod-grid .content-card-title')].map((element) => element.textContent ?? '')
}

function renderScreen(
  target: VodTarget,
  onOpenItem: (itemId: string, restore: VodCategoryRestore) => void = vi.fn(),
  restore?: VodCategoryRestore,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return render(
    <Wrapper>
      <VodCategoryScreen
        section="movies"
        sourceId={SOURCE_ID}
        target={target}
        onOpenItem={onOpenItem}
        restore={restore}
        onBack={vi.fn()}
        onResync={vi.fn()}
      />
    </Wrapper>,
  )
}

async function seedLargeCatalog(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte de teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
  const [categoryId] = await storeCategories([
    { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Todos', order: 0, providerCategoryId: '1' },
  ])
  const records = Array.from({ length: 240 }, (_, index) => ({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie' as const,
    name: `Filme ${String(index).padStart(3, '0')}`,
    originalName: `Filme ${String(index).padStart(3, '0')}`,
    groupOrder: 0,
    providerStreamId: `movie-${index}`,
  }))
  records.push({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie' as const,
    name: 'Zzz último item',
    originalName: 'Zzz último item',
    groupOrder: 0,
    providerStreamId: 'movie-last',
  })
  await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, records, 1)
}

beforeEach(() => {
  resetVodSessionMemory()
  mockCategories([category(1)])
  mockCategoryContent([])
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '\uffff']).delete()
  await db.catalogReadManifests.where('sourceId').equals(SOURCE_ID).delete()
  await db.catalogReadChunks.where('sourceId').equals(SOURCE_ID).delete()
})

describe('VodCategoryScreen — janelas e reconciliação (feature 065, T031)', () => {
  it('busca o último item depois da primeira página e ordena até o fim da grade', async () => {
    await seedLargeCatalog()
    renderScreen({ kind: 'all' })
    await waitFor(() => expect(gridTitles().length).toBeGreaterThan(0))

    // Abrir busca troca a leitura progressiva pelo índice completo; o item da
    // última página continua acessível sem materializar tudo na entrada.
    press('ArrowUp')
    press('Enter')
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(field).not.toBeNull()
    act(() => fireEvent.change(field!, { target: { value: 'último' } }))
    await waitFor(() => expect(gridTitles()).toEqual(['Zzz último item']))

    cleanup()
    resetVodSessionMemory()
    mockCategories([category(1)])
    mockCategoryContent([])
    renderScreen({ kind: 'all', sort: 'az' })
    await waitFor(() => expect(gridTitles()[0]).toBe('Filme 000'))
    const grid = document.querySelector<HTMLElement>('.vod-grid')!
    act(() => {
      grid.scrollTop = 100_000
      fireEvent.scroll(grid)
    })
    await waitFor(() => expect(gridTitles()).toContain('Zzz último item'))
  }, 15000)

  it('restaura o cartão por id após a tela ser desmontada e recarregar os dados', () => {
    const items = [movie('Primeiro', 'first'), movie('Último', 'last')]
    mockCategories([category(1, 'Ação')])
    mockCategoryContent(items)
    const onOpenItem = vi.fn<(itemId: string, restore: VodCategoryRestore) => void>()
    renderScreen({ kind: 'category', name: 'Ação' }, onOpenItem)
    press('ArrowRight')
    press('Enter')
    const [openedId, restore] = onOpenItem.mock.calls[0] ?? []
    expect(openedId).toBe('id-last')

    cleanup()
    resetVodSessionMemory()
    mockCategories([category(1, 'Ação')])
    mockCategoryContent([movie('Primeiro', 'first'), movie('Último', 'last')])
    renderScreen({ kind: 'category', name: 'Ação' }, onOpenItem, restore)
    expect(focusedTitle()).toBe('Último')
    expect(screen.queryByText('Último')).toBeInTheDocument()
    expect(restore?.focusedItemId).toBe('id-last')
  })
})
