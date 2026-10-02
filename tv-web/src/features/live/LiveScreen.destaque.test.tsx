/**
 * Destaque do canal focado (feature 048, US1/US3): rótulo por entrada, fundo
 * com o logo real e sua falha, Assistir soft disabled e cartões de programação.
 * Complementa o contrato travado `LiveScreen.live-paridade-v14.contract.test.tsx`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { deleteEpgForSource, writeEpgPrograms } from '../../lib/epg/epgRepository'

// Mesmos mocks de layout dos contratos 024/030/048 (jsdom não faz layout; lista virtualizada).
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
    useFavoritesContent: vi.fn(),
    fetchPlayback: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-048-destaque'
const LOGO_A = 'https://logos.example/destaque-a.png'
const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 2, hour, minute, 0)

function channel(name: string, extra: Partial<CatalogItemOut>): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: 'Telecine Premium',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    ...extra,
  }
}

const CHANNELS = [
  channel('Canal A', { icon_url: LOGO_A, epg_channel_id: null }),
  channel('Canal B', { icon_url: null, epg_channel_id: null, playable: false }),
  channel('Canal C', { icon_url: null, epg_channel_id: 'c.br' }),
]

function mockCatalog() {
  const categories: CatalogCategory[] = [
    { id: 1, kind: 'channel', name: 'Telecine Premium', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' },
  ]
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? CHANNELS : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items: CHANNELS,
    coveredCategories: 1,
    totalCategories: 1,
    isLoading: false,
  })
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [CHANNELS[0]], unresolved: 0 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <LiveScreen sourceId={SOURCE_ID} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
}

function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

const hero = (selector: string) => document.querySelector<HTMLElement>(`.live-preview-panel .live-hero ${selector}`)

describe('LiveScreen — destaque (feature 048)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(at(10, 30))
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte 048 destaque',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'c.br', start: at(10), end: at(11), title: 'Jornal' },
      { channelKey: 'c.br', start: at(11), end: at(12), title: 'Único Próximo' },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await deleteEpgForSource(SOURCE_ID).catch(() => {})
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('rótulo: "★ Favoritos • grupo" em Favoritos, "Todos • grupo" em Todos', async () => {
    renderLive()
    tap('ArrowUp') // Todos
    tap('Enter')
    await waitFor(() => expect(hero('.live-hero-eyebrow')?.textContent).toBe('Todos • Telecine Premium'))

    tap('Escape')
    tap('ArrowUp') // Favoritos
    tap('Enter')
    await waitFor(() => expect(hero('.live-hero-eyebrow')?.textContent).toBe('★ Favoritos • Telecine Premium'))
  })

  it('logo que falha some e a mesma URL não volta a ser pedida', async () => {
    renderLive()
    tap('Enter')
    await waitFor(() => expect(hero('.live-hero-art img')).not.toBeNull())

    fireEvent.error(hero('.live-hero-art img') as HTMLImageElement)
    expect(hero('.live-hero-art img')).toBeNull()
    expect(hero('.live-hero-art')).not.toBeNull()

    tap('ArrowDown') // outro canal e volta: a URL que falhou não é tentada de novo
    tap('ArrowUp')
    await waitFor(() => expect(hero('.live-hero-name')?.textContent).toBe('Canal A'))
    expect(hero('.live-hero-art img')).toBeNull()
  })

  it('OK em canal não reproduzível não toca (o aviso é o de hoje) e o destaque não tem botões', async () => {
    renderLive()
    tap('Enter')
    tap('ArrowDown') // Canal B (playable: false)
    await waitFor(() => expect(hero('.live-hero-name')?.textContent).toBe('Canal B'))
    expect(document.querySelector('.live-preview-panel button')).toBeNull()

    tap('Enter')
    expect(vi.mocked(catalogApi.fetchPlayback)).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('1 programa futuro → 1 cartão "A seguir"; avançar o relógio recalcula (FR-010)', async () => {
    renderLive()
    tap('Enter')
    tap('ArrowDown')
    tap('ArrowDown') // Canal C, com EPG
    await waitFor(() => expect(document.querySelectorAll('.live-schedule-card')).toHaveLength(1))
    expect(document.querySelector('.live-schedule-label')?.textContent).toBe('A seguir')
    expect(document.querySelector('.live-schedule-title')?.textContent).toBe('Único Próximo')

    await act(async () => {
      vi.setSystemTime(at(11, 30))
      vi.advanceTimersByTime(30_000)
    })
    await waitFor(() => expect(document.querySelectorAll('.live-schedule-card')).toHaveLength(0))
    expect(hero('.live-hero-live')?.textContent).toContain('Único Próximo')
  })

  it('sem EPG: nenhuma faixa de programação', async () => {
    renderLive()
    tap('Enter')
    await waitFor(() => expect(hero('.live-hero-name')?.textContent).toBe('Canal A'))
    expect(document.querySelector('.live-schedule')).toBeNull()
  })
})
