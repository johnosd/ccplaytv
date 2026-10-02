import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetLiveSessionMemory } from './liveSessionMemory'

// Contrato da feature 046 (US2 / 14b): a Live lembra o canal por entrada e devolve o foco ao canal que tocava.

// jsdom não faz layout: sem estas medidas o painel de canais virtualizado nunca monta itens (mesmo motivo de LiveScreen.test.tsx).
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

beforeEach(() => {
  resetLiveSessionMemory()
  vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
    item_id: 'id-mock',
    kind: 'channel',
    url: 'http://live.test/stream.m3u8',
    container_hint: null,
    source_id: 'source-1',
    provider_stream_id: null,
    original_name: 'mock',
    series_id: null,
    season_number: null,
    episode_number: null,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  resetLiveSessionMemory()
})

describe('LiveScreen — memória de foco por entrada (feature 046)', () => {
  // US2/AC1, FR-007/FR-008, Constitution: "Voltar Restaura Foco e Posição" (voltar à categoria anterior restaura o item anterior)
  it('trocar de categoria e voltar devolve o foco ao último canal daquela categoria', () => {
    const g1 = [channel('A1', 'G1'), channel('A2', 'G1'), channel('A3', 'G1'), channel('A4', 'G1'), channel('A5', 'G1')]
    const g2 = [channel('B1', 'G2'), channel('B2', 'G2')]
    mockCatalog({ 1: g1, 2: g2 }, [category(1, 'G1', 0), category(2, 'G2', 1)], [...g1, ...g2])
    renderLive()

    press('ArrowRight') // entra em G1 (primeira categoria real)
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown') // A4
    expect(focusedChannelText()).toContain('A4')

    press('ArrowLeft')
    press('ArrowDown') // trilha → G2
    press('ArrowRight') // entra em G2, primeira visita: primeiro item
    expect(focusedChannelText()).toContain('B1')

    press('ArrowLeft')
    press('ArrowUp') // trilha → G1
    press('ArrowRight') // reentra em G1

    expect(focusedChannelText()).toContain('A4')
  })

  // US2/AC3, FR-011 — o caso traiçoeiro: o zapping troca a entrada exibida para a categoria
  // do canal que toca, e CH±/↓ caminha pela vizinhança de "Todos"; ao fechar, o foco volta
  // para onde o canal foi iniciado, no canal que tocava por último.
  it('fechar o player depois de zapping e ↓ devolve o foco ao canal que tocava, na lista de origem', async () => {
    const g1 = [channel('A1', 'G1'), channel('A2', 'G1')]
    const g2 = [channel('B1', 'G2'), channel('B2', 'G2')]
    mockCatalog({ 1: g1, 2: g2 }, [category(1, 'G1', 0), category(2, 'G2', 1)], [...g1, ...g2])
    renderLive()

    press('ArrowUp') // trilha: G1 → "Todos"
    press('ArrowRight') // entra em "Todos"
    press('ArrowDown') // A2
    press('Enter') // toca A2
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())
    act(() => {
      fireEvent.playing(document.querySelector('video')!)
    })

    press('Enter') // abre o zapping: a lista passa a mostrar G1 (categoria de A2)
    await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())
    press('Escape') // fecha só a lista; o canal continua tocando
    expect(document.querySelector('.player-zap-columns')).not.toBeInTheDocument()

    press('ArrowDown') // próximo da vizinhança capturada em "Todos": B1 (outra categoria)
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())

    for (let i = 0; i < 3 && screen.queryByRole('dialog'); i += 1) press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(document.querySelector('.live-column-channels .live-column-title')?.textContent).toBe('Todos')
    expect(focusedChannelText()).toContain('B1')
  })
})
