/**
 * Contrato da feature 048 (paridade visual da Live com o V14) — travado em
 * `sdd/specs/048-live-paridade-v14/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (além dos da 024/030, que continuam):
 * - dentro de `.live-preview-panel`: `.live-hero` (destaque), `.live-hero-art`
 *   (fundo; contém `<img>` só quando há logo), `.live-hero-eyebrow` (rótulo da
 *   entrada/grupo), `.live-hero-name` (nome), `.live-hero-live` (linha "ao vivo").
 * - também dentro de `.live-preview-panel`: `.live-schedule-card` (um por
 *   programa futuro), com `.live-schedule-label` e `.live-schedule-title`.
 * - `.side-category-nav-tile`: tile da entrada da trilha, irmão (não filho)
 *   de `.side-category-nav-label`.
 * - `.live-preview-action.tv-focus`: ação focada do destaque.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { deleteEpgForSource, writeEpgPrograms } from '../../lib/epg/epgRepository'
import { SideCategoryNav } from '../../components/SideCategoryNav'

// Mesmos mocks de layout dos contratos 024/030: jsdom não faz layout, e o
// painel de canais é virtualizado (feature 009).
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
    // Favoritos e EPG: reais, contra `db` (fake-indexeddb).
  }
})

const SOURCE_ID = 'source-048'
const LOGO_A = 'https://logos.example/canal-a.png'
const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 2, hour, minute, 0)

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'channel', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function channel(name: string, streamId: string, extra: Partial<CatalogItemOut>): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: 'Telecine Premium',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: streamId,
    original_name: name,
    ...extra,
  }
}

function mockCatalog() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Telecine Premium', 0), category(2, 'Notícias', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items =
      cat?.id === 1
        ? [
            channel('Canal A', 'a', { icon_url: LOGO_A, epg_channel_id: null }),
            channel('Canal B', 'b', { icon_url: null, epg_channel_id: 'b.br' }),
          ]
        : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items: [],
    coveredCategories: 0,
    totalCategories: 2,
    isLoading: false,
  })
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

function inPreview<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(`.live-preview-panel ${selector}`)
}

function focusedAction(): string | null {
  return document.querySelector('.live-preview-action.tv-focus')?.textContent ?? null
}

function focusedChannelName(): string | null {
  const focused = [...document.querySelectorAll('.tv-focus')].find((el) => el.querySelector('.live-item-name'))
  return focused?.querySelector('.live-item-name')?.textContent ?? null
}

describe('LiveScreen — contrato da feature 048', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(10, 30))
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte 048',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'b.br', start: at(10), end: at(11), title: 'Jornal da Manhã' },
      { channelKey: 'b.br', start: at(11), end: at(12), title: 'Esporte Total' },
      { channelKey: 'b.br', start: at(12), end: at(13), title: 'Filme da Tarde' },
      { channelKey: 'b.br', start: at(13), end: at(14), title: 'Série Inédita' },
      { channelKey: 'b.br', start: at(14), end: at(15), title: 'Quinto Programa' },
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

  // US1/AC1+AC2, FR-001 (destaque com rótulo/nome), FR-002 (sem EPG: só "Ao vivo"), FR-005 (fundo = logo real, nada sem logo), FR-009 (sem EPG: nenhum cartão)
  it('destaque: rótulo do grupo, nome, "Ao vivo" sem EPG, fundo com o logo real só quando ele existe', async () => {
    renderLive()
    tap('ArrowRight') // entra em "Telecine Premium" — foco em "Canal A"

    await waitFor(() => expect(inPreview('.live-hero-name')?.textContent).toBe('Canal A'))
    expect(inPreview('.live-hero')).not.toBeNull()
    expect(inPreview('.live-hero-eyebrow')?.textContent).toContain('Telecine Premium')
    expect(inPreview<HTMLImageElement>('.live-hero-art img')?.getAttribute('src')).toBe(LOGO_A)
    expect(inPreview('.live-hero-live')?.textContent).toContain('Ao vivo')
    expect(document.querySelectorAll('.live-preview-panel .live-schedule-card')).toHaveLength(0)

    tap('ArrowDown') // "Canal B": sem logo
    await waitFor(() => expect(inPreview('.live-hero-name')?.textContent).toBe('Canal B'))
    expect(inPreview('.live-hero-art')).not.toBeNull()
    expect(inPreview('.live-hero-art img')).toBeNull()
  })

  // FR-004 (→/↓ avançam, ↑ volta, ← volta ao canal de QUALQUER ação), preserva os contratos 024/031
  it('ações em linha: → avança e para na última, ↑ volta uma, ← volta ao canal de origem', async () => {
    renderLive()
    tap('ArrowRight') // entra na categoria
    tap('ArrowDown') // "Canal B" — a origem não é o primeiro
    await waitFor(() => expect(focusedChannelName()).toBe('Canal B'))

    tap('ArrowRight') // canal → 1ª ação
    expect(focusedAction()).toContain('Assistir')
    tap('ArrowRight')
    expect(focusedAction()).toContain('Favoritar')
    tap('ArrowRight')
    expect(focusedAction()).toContain('Guia completo')
    tap('ArrowRight') // já na última: fica
    expect(focusedAction()).toContain('Guia completo')
    tap('ArrowUp')
    expect(focusedAction()).toContain('Favoritar')

    tap('ArrowLeft') // de uma ação que não é a 1ª: volta ao canal, não à ação da esquerda
    expect(focusedAction()).toBeNull()
    expect(focusedChannelName()).toBe('Canal B')
  })

  // US3/AC1, FR-002 (com EPG: programa atual na linha "ao vivo"), FR-009 (até 3 cartões reais, em ordem, dentro do painel), SC-003
  it('programação: com EPG, o atual na linha "ao vivo" e 3 cartões A seguir/Depois/Mais tarde com os próximos reais', async () => {
    renderLive()
    tap('ArrowRight')
    tap('ArrowDown') // "Canal B", com EPG

    await waitFor(() => expect(document.querySelectorAll('.live-preview-panel .live-schedule-card')).toHaveLength(3))
    expect(inPreview('.live-hero-live')?.textContent).toContain('Jornal da Manhã')

    const cards = [...document.querySelectorAll('.live-preview-panel .live-schedule-card')]
    expect(cards.map((c) => c.querySelector('.live-schedule-label')?.textContent)).toEqual(['A seguir', 'Depois', 'Mais tarde'])
    expect(cards.map((c) => c.querySelector('.live-schedule-title')?.textContent)).toEqual([
      'Esporte Total',
      'Filme da Tarde',
      'Série Inédita',
    ])
  })

  // US4/AC1, FR-011 (tile: ★, ∞, até 2 iniciais do nome da fonte), FR-017 (sem `tile`, nenhum tile: outras telas intactas), contratos 018/024 (texto do rótulo intacto)
  it('trilha: tile antes do rótulo (★, ∞, iniciais), rótulo intacto; SideCategoryNav sem tile não desenha nenhum', async () => {
    renderLive()

    const items = () => [...document.querySelectorAll('.live-column-groups .side-category-nav-item')]
    await waitFor(() => expect(items()).toHaveLength(4))
    expect(items().map((i) => i.querySelector('.side-category-nav-label')?.textContent)).toEqual([
      'Favoritos',
      'Todos',
      'Telecine Premium',
      'Notícias',
    ])
    expect(items().map((i) => i.querySelector('.side-category-nav-tile')?.textContent)).toEqual(['★', '∞', 'TP', 'NO'])
    for (const item of items()) {
      expect(item.querySelector('.side-category-nav-label .side-category-nav-tile')).toBeNull()
    }

    cleanup()
    render(
      <SideCategoryNav
        entries={[{ id: 'x', label: 'Ação' }, { id: 'y', label: 'Drama', count: 3 }]}
        selectedId="x"
        onSelect={vi.fn()}
      />,
    )
    expect(document.querySelectorAll('.side-category-nav-tile')).toHaveLength(0)
  })
})
