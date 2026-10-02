import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import { AnnouncerRegion } from '../../components/AnnouncerRegion'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'

/**
 * Regressão: na vista principal da TV ao Vivo, o `Toast` era renderizado sem
 * `messageKey`. Com a região de anúncio montada (feature 021, D-004), o `key`
 * do nó caía no próprio texto — dois toasts IDÊNTICOS em sequência reusavam
 * o mesmo nó, e o leitor de tela não anunciava a repetição.
 */

// Mesmo stub de layout de `LiveScreen.test.tsx`: sem ele o virtualizador mede
// 0×0 no jsdom e nenhum `.live-item` é montado.
let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreOffsetWidth: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreScrollHeight: PropertyDescriptor | undefined
let restoreScrollTo: PropertyDescriptor | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  restoreScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 400 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' && options !== null ? options.top : undefined
      if (typeof top === 'number') this.scrollTop = top
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })
})

afterAll(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', restoreScrollHeight)
  if (restoreScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', restoreScrollTo)
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    fetchPlayback: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const category: CatalogCategory = {
  id: 1,
  kind: 'channel',
  name: 'Grupo',
  order: 0,
  count: 0,
  fetchMode: 'on_demand',
  providerCategoryId: '1',
}

const semFonte: CatalogItemOut = {
  id: 'id-Sem fonte',
  kind: 'channel',
  name: 'Sem fonte',
  original_group: 'Grupo',
  published: true,
  playable: false,
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') {
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    }
  })
}

function renderLiveWithAnnouncer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerRegion>
        <LiveScreen sourceId="source-1" onBack={vi.fn()} onResync={vi.fn()} />
      </AnnouncerRegion>
    </QueryClientProvider>,
  )
}

describe('LiveScreen — toast repetido na vista principal', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: [category],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [semFonte], totalCount: 1, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: [],
      coveredCategories: 1,
      totalCategories: 1,
      isLoading: false,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('remonta o nó do toast na região de anúncio a cada OK, mesmo com o mesmo texto', () => {
    const { container } = renderLiveWithAnnouncer()
    const region = container.querySelector('.announcer-region')
    expect(region).not.toBeNull()

    press('ArrowRight') // entra em "Grupo"; foco no canal sem fonte

    press('Enter')
    const primeiro = region!.querySelector('.toast')
    expect(primeiro).not.toBeNull()
    expect(primeiro!.textContent).toMatch(/não tem uma fonte de reprodução/)

    press('Enter')
    const segundo = region!.querySelector('.toast')
    expect(segundo).not.toBeNull()
    expect(segundo!.textContent).toMatch(/não tem uma fonte de reprodução/)

    // Nó novo = o leitor de tela anuncia a repetição (feature 021, D-004).
    expect(segundo).not.toBe(primeiro)
  })
})
