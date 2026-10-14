/**
 * Teste de CONTRATO da feature 068 (legibilidade para TV, US2 — TV ao vivo em coluna única, sem cabeçalho). Travado em
 * `sdd/specs/068-legibilidade-tv/contract-tests.lock`; o sdd-execute só pode fazê-lo passar.
 *
 * Seletores fixados por este contrato (além dos da 018/024/048/049, que continuam — as três colunas seguem no DOM):
 * - `.live-body[data-live-view="categories"|"channels"]`: qual lista a coluna única mostra agora (a outra fica oculta).
 * - `.live-column-channels .live-panel-head`: cabeçalho da lista de canais, com o nome da entrada e "N canais".
 * Regras: `sdd/specs/068-legibilidade-tv/logic/live-coluna-unica.md`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen, type LiveScreenProps } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import * as allHidden from '../../lib/catalog/useSectionAllHidden'
import { db } from '../../lib/catalog/db'

// Mesmos mocks de layout dos contratos 024/030/048/049: jsdom não faz layout e a lista de canais é virtualizada.
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
  define(HTMLElement.prototype, 'offsetWidth', 400)
  define(Element.prototype, 'clientHeight', 640)
  define(Element.prototype, 'scrollHeight', 1_000_000)
  define(HTMLElement.prototype, 'scrollTo', function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
    const top = typeof options === 'object' && options !== null ? options.top : undefined
    if (typeof top === 'number') this.scrollTop = top
    queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
  })
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
    fetchPlayback: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

vi.mock('../../lib/catalog/useSectionAllHidden', () => ({ useSectionAllHidden: vi.fn(() => false) }))

const SOURCE_ID = 'source-068'

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'channel', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function channel(name: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: 'Variedades',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    epg_channel_id: null,
  }
}

const CHANNELS = ['Canal A', 'Canal B', 'Canal C'].map(channel)

function mockCatalog(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 2 ? CHANNELS : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: categories.length, isLoading: false })
}

function renderLive(overrides: Partial<LiveScreenProps> = {}) {
  const props: LiveScreenProps = { sourceId: SOURCE_ID, onBack: vi.fn(), onResync: vi.fn(), ...overrides }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <LiveScreen {...props} />
    </Wrapper>,
  )
  return props
}

function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

const view = () => document.querySelector('.live-body')?.getAttribute('data-live-view')
const focusedTrailLabel = () => document.querySelector('.live-column-groups .tv-focus .side-category-nav-label')?.textContent ?? null

describe('LiveScreen — contrato da feature 068', () => {
  beforeEach(async () => {
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    vi.mocked(allHidden.useSectionAllHidden).mockReturnValue(false)
    await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte 068', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  // US2/AC1..AC4, FR-008..FR-011, Constitution: "Voltar Restaura Foco e Posição" (foco na categoria por id)
  it('sem topbar nem título; coluna única: categorias → OK → canais (com "N canais") → RETURN → mesma categoria → RETURN → Início', async () => {
    mockCatalog([category(1, 'Esportes', 0), category(2, 'Variedades', 1)])
    const props = renderLive()

    expect(document.querySelector('.topbar')).toBeNull()
    expect(document.querySelector('.live-header')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'TV ao vivo' })).toBeNull()
    expect(view()).toBe('categories')

    for (let i = 0; i < 6 && focusedTrailLabel() !== 'Variedades'; i += 1) tap('ArrowDown')
    expect(focusedTrailLabel()).toBe('Variedades')
    tap('Enter')

    expect(view()).toBe('channels')
    const head = document.querySelector('.live-column-channels .live-panel-head')?.textContent ?? ''
    expect(head).toContain('Variedades')
    expect(head).toContain('3 canais')

    tap('Escape')
    expect(view()).toBe('categories')
    expect(focusedTrailLabel()).toBe('Variedades')
    expect(props.onBack).not.toHaveBeenCalled()

    tap('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  // FR-013, D-010 da 067: sem topbar, "Gerenciar categorias" do vazio "todas escondidas" continua alcançável e focado.
  it('sem topbar, o vazio "todas escondidas" mantém "Gerenciar categorias" focado e o OK chega a onManageCategories', () => {
    mockCatalog([])
    vi.mocked(allHidden.useSectionAllHidden).mockReturnValue(true)
    const onManageCategories = vi.fn()
    renderLive({ onManageCategories })

    const manage = screen.getByRole('button', { name: 'Gerenciar categorias' })
    expect(manage).toHaveClass('tv-focus')
    tap('Enter')
    expect(onManageCategories).toHaveBeenCalledTimes(1)
  })
})
