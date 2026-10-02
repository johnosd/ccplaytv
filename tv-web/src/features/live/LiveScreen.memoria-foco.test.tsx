import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { recalledLiveFocus } from './liveSessionMemory'

// Cobertura complementar da feature 046 (US2): o que o contrato travado não exercita.

const restore: Array<() => void> = []
function defineOn(target: object, prop: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(target, prop)
  Object.defineProperty(target, prop, { configurable: true, writable: true, value })
  restore.push(() => {
    if (previous) Object.defineProperty(target, prop, previous)
    else delete (target as Record<string, unknown>)[prop]
  })
}

beforeAll(() => {
  defineOn(HTMLElement.prototype, 'offsetHeight', 640)
  defineOn(HTMLElement.prototype, 'offsetWidth', 400)
  defineOn(Element.prototype, 'clientHeight', 640)
  defineOn(Element.prototype, 'scrollHeight', 1_000_000)
  defineOn(HTMLElement.prototype, 'scrollTo', function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
    const top = typeof options === 'object' && options !== null ? options.top : undefined
    if (typeof top === 'number') this.scrollTop = top
    queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
  })
})

afterAll(() => {
  restore.forEach((undo) => undo())
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

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'channel', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function channel(name: string, group: string): CatalogItemOut {
  return { id: `id-${name}`, kind: 'channel', name, original_group: group, published: true, playable: true }
}

/** `byId` é lido a cada render: mutá-lo entre idas e vindas simula uma renovação do catálogo. */
function mockCatalog(byId: Record<number, CatalogItemOut[]>, categories: CatalogCategory[], all: CatalogItemOut[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items: all,
    coveredCategories: categories.length,
    totalCategories: categories.length,
    isLoading: false,
  })
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <LiveScreen sourceId="source-1" onBack={vi.fn()} onResync={vi.fn()} />
    </QueryClientProvider>,
  )
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function focusedChannelText(): string {
  return document.querySelector('.live-channel-list .tv-focus')?.textContent ?? ''
}

// Nomes longos o bastante para a busca (mínimo de 3 caracteres) achar um só canal.
const G1 = ['A1', 'A2', 'A3', 'A4', 'A5'].map((name) => channel(`Canal${name}`, 'G1'))
const G2 = ['B1', 'B2'].map((name) => channel(`Canal${name}`, 'G2'))

beforeEach(() => {
  vi.mocked(catalogApi.fetchPlayback).mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LiveScreen — memória de foco (feature 046, cobertura complementar)', () => {
  // FR-007, FR-016
  it('"Todos" também lembra o canal, e restaurar não inicia reprodução nem consulta', () => {
    mockCatalog({ 1: G1, 2: G2 }, [category(1, 'G1', 0), category(2, 'G2', 1)], [...G1, ...G2])
    renderLive()

    press('ArrowUp') // trilha: G1 → Todos
    press('ArrowRight')
    press('ArrowDown')
    press('ArrowDown') // A3
    expect(focusedChannelText()).toContain('A3')

    press('ArrowLeft')
    press('ArrowDown') // G1
    press('ArrowRight') // entra em G1: primeira visita
    press('ArrowLeft')
    press('ArrowUp') // Todos
    press('ArrowRight')

    expect(focusedChannelText()).toContain('A3')
    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
  })

  // FR-014
  it('a posição numa lista filtrada pela busca nunca sobrescreve a memória da entrada', () => {
    mockCatalog({ 1: G1, 2: G2 }, [category(1, 'G1', 0), category(2, 'G2', 1)], [...G1, ...G2])
    renderLive()

    press('ArrowRight') // entra em G1
    press('ArrowDown') // A2
    press('ArrowUp') // A1
    press('ArrowUp') // ícone de busca
    press('Enter')
    expect(recalledLiveFocus('source-1', 'category:G1')?.channelId).toBe('id-CanalA1')

    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(field).not.toBeNull()
    act(() => fireEvent.change(field!, { target: { value: 'lA4' } }))
    press('ArrowDown') // foca o único resultado: A4

    expect([...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)).toEqual(['CanalA4'])
    expect(document.querySelector('.tv-focus')?.textContent ?? '').toContain('A4')
    expect(recalledLiveFocus('source-1', 'category:G1')?.channelId).toBe('id-CanalA1')
  })

  // FR-010, SC-005
  it('canal lembrado que sumiu da categoria cai no vizinho da mesma posição, nunca no topo', () => {
    const byId: Record<number, CatalogItemOut[]> = { 1: [...G1], 2: [...G2] }
    mockCatalog(byId, [category(1, 'G1', 0), category(2, 'G2', 1)], [])
    renderLive()

    press('ArrowRight')
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown') // A4 (índice 3)
    expect(focusedChannelText()).toContain('A4')

    press('ArrowLeft')
    press('ArrowDown') // G2
    press('ArrowRight')
    byId[1] = G1.filter((c) => c.name !== 'CanalA4') // renovação em segundo plano tirou A4
    press('ArrowLeft')
    press('ArrowUp') // G1
    press('ArrowRight')

    expect(focusedChannelText()).toContain('A5') // ocupa a posição 3 agora
    expect(focusedChannelText()).not.toContain('A1')
  })

  // FR-015
  it('categoria lembrada que ficou vazia mantém um foco visível (ação do estado vazio)', () => {
    const byId: Record<number, CatalogItemOut[]> = { 1: [...G1], 2: [...G2] }
    mockCatalog(byId, [category(1, 'G1', 0), category(2, 'G2', 1)], [])
    renderLive()

    press('ArrowRight')
    press('ArrowDown') // A2
    press('ArrowLeft')
    press('ArrowDown')
    press('ArrowRight') // G2
    byId[1] = []
    press('ArrowLeft')
    press('ArrowUp')
    press('ArrowRight') // G1, agora vazia

    expect(document.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })
})
