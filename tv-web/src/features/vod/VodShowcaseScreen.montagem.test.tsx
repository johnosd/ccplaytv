import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryPreview } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import type { VodShellProps } from './vodShell'

// A pilha de fileiras é virtualizada: sem tamanho no jsdom, nenhuma fileira seria montada (mesmo stub dos contratos da vitrine).
const restore: Array<[object, string, PropertyDescriptor | undefined]> = []
let restoreResizeObserver: typeof globalThis.ResizeObserver | undefined
beforeAll(() => {
  for (const [proto, prop, value] of [
    [HTMLElement.prototype, 'offsetHeight', 640],
    [HTMLElement.prototype, 'offsetWidth', 1200],
    [Element.prototype, 'clientHeight', 640],
    [Element.prototype, 'clientWidth', 1200],
  ] as const) {
    restore.push([proto, prop, Object.getOwnPropertyDescriptor(proto, prop)])
    Object.defineProperty(proto, prop, { configurable: true, value })
  }
  restoreResizeObserver = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback([{ contentRect: { width: 1200, height: 640 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})
afterAll(() => {
  for (const [proto, prop, descriptor] of restore) if (descriptor) Object.defineProperty(proto, prop, descriptor)
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
    useCategoryFocusPrefetch: vi.fn(),
    useCategoryPreviews: vi.fn(),
  }
})
vi.mock('../catalog/becauseApi', () => ({ useBecauseYouWatched: vi.fn(() => null) }))

function movie(name: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: 'src',
    provider_stream_id: name,
    original_name: name,
  }
}

const reads: { added?: CatalogItemOut[]; rated?: CatalogItemOut[] } = {}

function mockReads() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' } satisfies CatalogCategory],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({ data: { items: [], unresolved: 0 } } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [movie('Fav')], unresolved: 0 } } as unknown as ReturnType<
    typeof catalogApi.useFavoritesContent
  >)
  vi.mocked(catalogApi.useRecentlyAdded).mockImplementation(() => ({ data: reads.added, isLoading: reads.added === undefined }))
  vi.mocked(catalogApi.useTopRated).mockImplementation(() => ({ data: reads.rated, coveredCategories: 1, totalCategories: 1, isLoading: reads.rated === undefined }))
  vi.mocked(catalogApi.useWeeklyTop10).mockReturnValue({ data: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useDailyTip).mockReturnValue({ data: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useCategoryPreviews).mockReturnValue(new Map<number, CategoryPreview>([[1, { status: 'ready', items: [movie('A1')] }]]))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete reads.added
  delete reads.rated
})

function renderShowcase(shell?: VodShellProps) {
  resetVodSessionMemory()
  mockReads()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <VodShowcaseScreen section="movies" sourceId="src" onOpenItem={vi.fn()} onOpenTarget={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} shell={shell} />
    </QueryClientProvider>
  )
  const view = render(ui())
  return () => view.rerender(ui() as never)
}

const rowLabels = () => [...document.querySelectorAll('section.vod-row')].map((row) => row.getAttribute('aria-label'))

describe('VodShowcaseScreen — montagem (feature 079)', () => {
  it('"Bem avaliados" entra na espera: aparece junto das outras, já na revelação', async () => {
    const rerender = renderShowcase()
    reads.added = [movie('Novo')]
    rerender()
    expect(rowLabels()).toEqual([]) // "Bem avaliados" ainda lendo: não revela sem ela
    reads.rated = [movie('Nota 1'), movie('Nota 2')]
    rerender()
    await waitFor(() => expect(rowLabels()).toEqual(['★ Favoritos', 'Adicionados recentemente', 'Bem avaliados', 'Ação']))
  })

  it('quem subiu para a topbar durante a espera continua nela quando a vitrine aparece', async () => {
    const shell: VodShellProps = { sourceName: 'Lista', onGoHome: vi.fn(), onSwitchTop: vi.fn(), onOpenProfiles: vi.fn() }
    const rerender = renderShowcase(shell)
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    reads.added = [movie('Novo')]
    reads.rated = []
    rerender()
    await waitFor(() => expect(rowLabels()).toContain('★ Favoritos'))
    expect(document.querySelector('.vod-showcase .tv-focus')).toBeNull()
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1) // o foco é o da topbar
  })
})
