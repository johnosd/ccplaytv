/**
 * Contrato da feature 049 (navegação por página na trilha de Filmes/Séries) —
 * travado em `sdd/specs/049-navegacao-por-pagina/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Página da trilha = `floor(clientHeight / 56)` (altura de item + espaço, 56px,
 * quando o item não tem medida de layout); com o `clientHeight` de 640 deste
 * arquivo, 11 entradas. A grade de cartões não muda (FR-011).
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

const SOURCE_ID = 'source-049-vod'
const CATEGORIES = 14
const PAGE = 11 // floor(640 / 56)
const catName = (id: number) => `Cat ${String(id).padStart(2, '0')}`

function category(id: number): CatalogCategory {
  return { id, kind: 'movie', name: catName(id), order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

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
    year: null,
  }
}

const trailLabels = () => [...document.querySelectorAll('.side-category-nav-label')].map((el) => el.textContent ?? '')
const focusedLabel = () => document.querySelector('.side-category-nav-item.tv-focus .side-category-nav-label')?.textContent ?? null
const heroTitle = () => document.querySelector('.vod-hero-band .vod-hero-title')?.textContent ?? null

function tap(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

describe('VodCatalogScreen — contrato da feature 049', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte 049 vod',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: Array.from({ length: CATEGORIES }, (_, i) => category(i + 1)),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
      const items = cat ? [movie(`Filme ${cat.id}A`), movie(`Filme ${cat.id}B`)] : []
      return {
        data: { items, totalCount: items.length, outcome: 'fresh' },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
    })
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 0, isLoading: false })
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  // US4 (trilha pagina, OK entra), FR-001/FR-003/FR-004/FR-011 (a grade não muda), Constitution: voltar à trilha sempre possível
  it('trilha: → pagina sem abrir a categoria; OK entra; a grade segue cartão a cartão e ← na 1ª coluna volta à trilha', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    render(
      <Wrapper>
        <VodCatalogScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )

    const labels = trailLabels()
    const start = labels.indexOf(focusedLabel() ?? '')
    expect(start).toBeGreaterThanOrEqual(0)

    tap('ArrowRight') // página seguinte da trilha: nada abre
    const expected = Math.min(start + PAGE, labels.length - 1)
    await waitFor(() => expect(focusedLabel()).toBe(labels[expected]))
    expect(heroTitle()).toBeNull()
    expect(document.querySelectorAll('.content-card')).toHaveLength(0)

    tap('ArrowLeft') // página anterior
    await waitFor(() => expect(focusedLabel()).toBe(labels[Math.max(expected - PAGE, 0)]))

    tap('ArrowRight')
    await waitFor(() => expect(focusedLabel()).toBe(labels[expected]))
    const id = Number((focusedLabel() ?? '').replace('Cat ', ''))
    expect(Number.isInteger(id)).toBe(true) // o foco paginou até uma categoria real

    tap('Enter') // OK entra: foco no 1º card
    await waitFor(() => expect(heroTitle()).toBe(`Filme ${id}A`))

    tap('ArrowRight') // grade: cartão a cartão (inalterado)
    await waitFor(() => expect(heroTitle()).toBe(`Filme ${id}B`))
    tap('ArrowLeft')
    await waitFor(() => expect(heroTitle()).toBe(`Filme ${id}A`))
    tap('ArrowLeft') // 1ª coluna: volta à trilha
    await waitFor(() => expect(focusedLabel()).toBe(catName(id)))
  })
})
