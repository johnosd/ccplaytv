import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import { ZAP_SETTLE_MS } from './useLiveZapping'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetLiveSessionMemory } from './liveSessionMemory'

// Bug `zapping-rapido-por-ch-setas-no` (016 SC-003): ↑/↓/CH± seguidos no player atravessam os canais e só
// o canal em que a pessoa para é aberto.

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

const playedIds = () => vi.mocked(catalogApi.fetchPlayback).mock.calls.map(([id]) => id)
const bandName = () => document.querySelector('.player-chrome-name')?.textContent ?? ''

/** Entra em G1 e toca o 1º canal até `playing` (o jsdom não sai de `preparing` sozinho). */
async function playFirstChannel() {
  press('Enter') // entra em G1
  press('Enter') // toca C1
  await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())
  act(() => {
    fireEvent.playing(document.querySelector('video')!)
  })
  await waitFor(() => expect(bandName()).toContain('C1'))
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

describe('LiveScreen — rajada de troca de canal no player', () => {
  const g1 = ['C1', 'C2', 'C3', 'C4', 'C5'].map((name) => channel(name, 'G1'))

  it('três ↓ seguidos: a faixa acompanha e só o canal final é aberto', async () => {
    mockCatalog({ 1: g1 }, [category(1, 'G1', 0)], g1)
    renderLive()
    await playFirstChannel()

    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    expect(bandName()).toContain('C4')
    expect(playedIds()).toEqual(['id-C1'])

    await waitFor(() => expect(playedIds()).toEqual(['id-C1', 'id-C4']), { timeout: ZAP_SETTLE_MS * 4 })
  })

  it('CH± continua trocando enquanto o canal escolhido ainda prepara', async () => {
    mockCatalog({ 1: g1 }, [category(1, 'G1', 0)], g1)
    renderLive()
    await playFirstChannel()

    press('ArrowDown')
    await waitFor(() => expect(playedIds()).toEqual(['id-C1', 'id-C2']), { timeout: ZAP_SETTLE_MS * 4 })
    // C2 fica em `preparing` (sem evento `playing`): CH+ não pode ser descartado.
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ChannelDown', keyCode: 428, bubbles: true }))
    })
    await waitFor(() => expect(playedIds()).toEqual(['id-C1', 'id-C2', 'id-C3']), { timeout: ZAP_SETTLE_MS * 4 })
  })

  it('falha no canal final volta ao canal que tocava antes da rajada, nunca a um intermediário', async () => {
    mockCatalog({ 1: g1 }, [category(1, 'G1', 0)], g1)
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(async (id) => {
      if (id === 'id-C3') throw new Error('falhou')
      return { item_id: id, kind: 'channel', url: 'http://live.test/stream.m3u8', container_hint: null, source_id: 'source-1', provider_stream_id: null, original_name: 'mock', series_id: null, season_number: null, episode_number: null }
    })
    renderLive()
    await playFirstChannel()

    press('ArrowDown')
    press('ArrowDown')
    await waitFor(() => expect(playedIds()).toEqual(['id-C1', 'id-C3', 'id-C1']), { timeout: ZAP_SETTLE_MS * 4 })
  })
})
