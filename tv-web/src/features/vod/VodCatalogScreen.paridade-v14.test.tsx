/**
 * Feature 050 (T013): molduras de rolagem de Filmes/Séries — o degradê de continuação
 * só acende nos lados com itens ocultos (FR-010, Spec V14 §17); a lógica de medição é
 * a do `useOverflowEdges` (048), aqui só a fiação da tela. O anel inteiro e as
 * posições reais são do E2E `filmes-series-paridade-v14.mjs` (jsdom não faz layout).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoviesScreen } from '../movies/MoviesScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'

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
const SIZES = { client: 400, scroll: 1000 }
let scrollTops = new WeakMap<Element, number>()
let originals: Record<string, PropertyDescriptor | undefined> = {}

function movie(n: number): CatalogItemOut {
  return {
    id: `id-${n}`,
    kind: 'movie',
    name: `Filme ${n}`,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: String(n),
    original_name: `Filme ${n}`,
  }
}

function frames(): { side: Element | null; grid: Element | null } {
  return {
    side: document.querySelector('.vod-side-panel .vod-scroll-frame'),
    grid: document.querySelector('.vod-content-column .vod-scroll-frame'),
  }
}

describe('VodCatalogScreen — molduras de continuação (feature 050)', () => {
  beforeEach(async () => {
    resetVodSessionMemory()
    scrollTops = new WeakMap()
    originals = {
      clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
      scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
      scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
      offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
      offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    }
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: SIZES.client })
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: SIZES.scroll })
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return scrollTops.get(this) ?? 0
      },
      set(this: Element, value: number) {
        scrollTops.set(this, value)
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: SIZES.client })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 })

    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } as CatalogCategory],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: Array.from({ length: 30 }, (_, i) => movie(i + 1)), totalCount: 30, outcome: 'fresh' },
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
    for (const [key, target] of [
      ['clientHeight', Element.prototype],
      ['scrollHeight', Element.prototype],
      ['scrollTop', Element.prototype],
      ['offsetHeight', HTMLElement.prototype],
      ['offsetWidth', HTMLElement.prototype],
    ] as const) {
      if (originals[key]) Object.defineProperty(target, key, originals[key]!)
      else delete (target as unknown as Record<string, unknown>)[key]
    }
    await db.sources.delete(SOURCE_ID)
  })

  it('a grade acende só a borda com itens ocultos: embaixo no topo, nas duas no meio, em cima no fim', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    render(
      <Wrapper>
        <MoviesScreen sourceId={SOURCE_ID} onOpenMovie={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    })

    const gridEl = document.querySelector('.vod-grid')!
    const setScroll = (top: number) =>
      act(() => {
        scrollTops.set(gridEl, top)
        gridEl.dispatchEvent(new Event('scroll'))
      })
    const flags = () => ({
      above: frames().grid?.classList.contains('is-more-above') ?? false,
      below: frames().grid?.classList.contains('is-more-below') ?? false,
    })

    setScroll(0)
    expect(flags()).toEqual({ above: false, below: true })
    setScroll(300)
    expect(flags()).toEqual({ above: true, below: true })
    setScroll(SIZES.scroll - SIZES.client)
    expect(flags()).toEqual({ above: true, below: false })
    // A trilha tem 4 entradas simuladas com a mesma altura: a moldura existe e responde à própria medida.
    expect(frames().side).not.toBeNull()
  })
})
